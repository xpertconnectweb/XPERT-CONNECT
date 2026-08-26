-- =============================================================
-- Migration: in-house reverse geocoding
-- Date: 2026-10-01
--
-- Depends on scripts/migrations/2026-09-geo-index.sql (both parts)
-- and on the index having been loaded. Run
--
--   select geo_rebuild_cells();
--
-- after this file, and again after every quarterly re-ingest.
--
-- ── What this is for ─────────────────────────────────────────
--
-- Reverse geocoding is the question the map asks when someone
-- drags the pin: not "where is this address" but "what is at this
-- point". Today that question leaves the building — the exact
-- coordinates of a personal-injury client's home go to a third
-- party — and that is the one privacy hole the self-hosted engine
-- was meant to close and had not.
--
-- There is no name to match on, so pg_trgm is no help at all, and
-- scanning 567,767 rows for the nearest is not something to do on
-- every drag of a pin.
--
-- ── Coverage cells, not centroids ────────────────────────────
--
-- The obvious design stores each street's centroid cell and reads
-- the 3×3 neighbourhood. It is cheaper, it is one generated
-- column, and it is wrong.
--
-- A row of geo_street is a BOX, not a point. Most are a block
-- long; the widest one percent run 8–11 km across, because their
-- source published neither city nor postcode and every segment of
-- one road in the county got grouped into a single row. A box
-- that size has a centroid kilometres from the end of it you are
-- standing on.
--
-- Measured against a brute-force scan of all 567,767 rows, on 60
-- sampled coordinates:
--
--   scheme      cell   neighbourhood   nearest found   candidates
--   centroid    0.01       3×3             76.7%           125
--   centroid    0.01       5×5             90.0%           311
--   centroid    0.02       5×5             98.3%         1,113
--   coverage    0.01       3×3            100.0%           165
--
-- A geocoder that names the wrong street on a quarter of drags is
-- not shippable, and widening the neighbourhood costs more
-- candidates than doing it properly does. So a street is indexed
-- in EVERY cell its box touches.
--
-- ── One row per cell, not per pair ───────────────────────────
--
-- Coverage means 1,941,305 (street, cell) pairs, 3.4 per street.
-- Stored as one row each that is ~116 MB. Stored as an array per
-- cell it is 114,016 rows and ~17 MB, on a 500 MB plan already
-- near half full. Same trick as geo_street_points: pack many
-- small things into one row, because the cost is the row.
--
-- ── Why not PostGIS ──────────────────────────────────────────
--
-- PostGIS would give a cleaner KNN — ORDER BY envelope <-> point,
-- no cells and no radius to tune — and as a query it is better.
-- It loses on everything around the query:
--
--   1. Reversion. `drop table geo_street_cell cascade` leaves
--      nothing behind. Removing PostGIS with a generated column
--      and a GiST index on top of it is not a thing to do in a
--      hurry.
--   2. 17 MB against ~114 MB, plus a transient ~80 MB while the
--      table is rewritten, on a plan at 48% of its ceiling that
--      the application tables share.
--   3. Precedent. This project runs one extension and the
--      migration that added it says so.
--
-- Reconsider if real geometry is ever needed.
--
-- Nothing here touches geo_street: no ALTER TABLE, no rewrite, no
-- MVCC bloat on an 80 MB table.
-- =============================================================

-- ── The cell table ───────────────────────────────────────────

create table if not exists geo_street_cell (
  -- floor(lat / 0.01) and floor(lng / 0.01). At 0.01° a cell is
  -- about 1.1 km of latitude and 0.9 km of longitude in Florida.
  --
  -- smallint holds ±32,767, which covers ±327° — comfortably more
  -- than the planet. text keys would cost more than the payload.
  cell_lat  smallint not null,
  cell_lng  smallint not null,

  -- Every street whose bounding box touches this cell.
  street_ids integer[] not null,

  primary key (cell_lat, cell_lng)
);

-- The lookup reads by primary key range and nothing else, so the
-- PK index is the only one this table needs.

alter table geo_street_cell enable row level security;

-- No policy, deliberately, exactly as geo_street has none: every
-- read goes through the service role in the API route. RLS on with
-- no policy denies anon and authenticated by default, which is the
-- intent — this data is public record, but the QUERIES are not:
-- a reverse geocode reveals where somebody is looking.

comment on table geo_street_cell is
  'Reverse-geocoding index: for each ~1 km cell, every street whose bounding box touches it. Rebuild with geo_rebuild_cells() after any re-ingest.';

-- ── Rebuilding it ────────────────────────────────────────────

create or replace function geo_rebuild_cells()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  pairs bigint;
begin
  -- Rebuilt whole rather than reconciled. 114,016 rows rewrite
  -- more cheaply than they diff, and an incremental version is
  -- exactly the kind of bookkeeping that breaks in silence — a
  -- stale cell does not error, it answers with the wrong street.
  truncate geo_street_cell;

  insert into geo_street_cell (cell_lat, cell_lng, street_ids)
  select
    lat_cell,
    lng_cell,
    array_agg(id order by id)
  from (
    select
      s.id,
      lat_cell,
      lng_cell
    from geo_street s
    -- Every cell the box touches, inclusive at both ends: a street
    -- straddling a boundary belongs to the cells on both sides of
    -- it, which is the entire point of covering.
    --
    -- floor() and not round(), matching cellOf() in
    -- src/lib/geocoding/cells.ts. A cell owns [n*size, (n+1)*size)
    -- so no coordinate lands in two cells or in neither — and
    -- floor() is right below zero too, which matters because every
    -- longitude in this index is negative.
    cross join lateral generate_series(
      floor(s.lat_min / 0.01)::int,
      floor(s.lat_max / 0.01)::int
    ) as lat_cell
    cross join lateral generate_series(
      floor(s.lng_min / 0.01)::int,
      floor(s.lng_max / 0.01)::int
    ) as lng_cell
  ) covered
  group by lat_cell, lng_cell;

  select coalesce(sum(cardinality(street_ids)), 0) into pairs from geo_street_cell;
  return pairs;
end;
$$;

revoke all on function geo_rebuild_cells() from public;
revoke all on function geo_rebuild_cells() from anon;
revoke all on function geo_rebuild_cells() from authenticated;
grant execute on function geo_rebuild_cells() to service_role;

-- ── The lookup ───────────────────────────────────────────────

create or replace function geo_street_nearby(
  q_lat        double precision,
  q_lng        double precision,
  q_radius_deg double precision default 0.03,
  q_limit      integer          default 12
)
returns table (
  id            integer,
  name_norm     text,
  name_display  text,
  city          text,
  state         text,
  zip           text,
  num_min       integer,
  num_max       integer,
  lat_min       double precision,
  lat_max       double precision,
  lng_min       double precision,
  lng_max       double precision,
  point_count   integer,
  score         real
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      floor((q_lat - q_radius_deg) / 0.01)::int as lat_lo,
      floor((q_lat + q_radius_deg) / 0.01)::int as lat_hi,
      -- Widened for longitude by 1/cos(lat), because a degree of
      -- longitude is shorter than one of latitude everywhere but
      -- the equator — 0.73 of one in Minneapolis. A square of
      -- cells in raw degrees would search a third less ground
      -- east-west, and every street it missed would be missed in
      -- silence. Clamped so a coordinate near a pole cannot ask
      -- for every cell on Earth. Mirrors cellRange().
      floor((q_lng - q_radius_deg / greatest(0.2, cos(radians(q_lat)))) / 0.01)::int as lng_lo,
      floor((q_lng + q_radius_deg / greatest(0.2, cos(radians(q_lat)))) / 0.01)::int as lng_hi
  ),
  candidates as (
    -- A street spanning several cells appears in each of them, so
    -- the same id arrives more than once. distinct before the join
    -- rather than after: deduplicating ids is cheaper than
    -- deduplicating whole rows.
    select distinct unnest(c.street_ids) as street_id
    from geo_street_cell c, bounds b
    where c.cell_lat between b.lat_lo and b.lat_hi
      and c.cell_lng between b.lng_lo and b.lng_hi
  )
  select
    s.id,
    s.name_norm,
    s.name_display,
    s.city,
    s.state,
    s.zip,
    s.num_min,
    s.num_max,
    s.lat_min,
    s.lat_max,
    s.lng_min,
    s.lng_max,
    s.point_count,
    0::real as score
  from candidates c
  join geo_street s on s.id = c.street_id
  order by
    -- Squared planar distance from the point to the BOX, zero
    -- inside it, longitude scaled by cos(lat) so the two axes are
    -- comparable. Planar and not haversine because at this range
    -- the error is submetric and this only ORDERS: the metres the
    -- caller sees are recomputed in TypeScript against the winning
    -- address point. Mirrors boxDistanceSq().
    (
      power(
        greatest(s.lat_min - q_lat, q_lat - s.lat_max, 0),
        2
      ) +
      power(
        greatest(s.lng_min - q_lng, q_lng - s.lng_max, 0) * cos(radians(q_lat)),
        2
      )
    ),
    -- Then the SMALLER box, and this tie-break is not cosmetic.
    -- Downtown, dozens of boxes contain the same point and all
    -- score zero, so the order among them decides what survives
    -- the cut. scripts/geo/gate-reverse.ts caught the consequence
    -- in the in-memory mirror: two metres from a known door, one
    -- lookup in a hundred did not return the street that door is
    -- on, because twelve other boxes sorted ahead of it — p99
    -- distance to the named door of 1,341 m for a query two metres
    -- from an address. A block-sized box containing the point is
    -- far likelier to be the street you are on than a county-wide
    -- one, and the county-wide ones are the same 1% with no city
    -- and no postcode that made coverage indexing necessary.
    ((s.lat_max - s.lat_min) * (s.lng_max - s.lng_min)),
    s.id
  limit greatest(1, least(q_limit, 50));
$$;

revoke all on function geo_street_nearby(double precision, double precision, double precision, integer) from public;
revoke all on function geo_street_nearby(double precision, double precision, double precision, integer) from anon;
revoke all on function geo_street_nearby(double precision, double precision, double precision, integer) from authenticated;
grant execute on function geo_street_nearby(double precision, double precision, double precision, integer) to service_role;

-- ── After running this ───────────────────────────────────────
--
--   select geo_rebuild_cells();
--
-- Expect ≈ 1,941,305 — the measured pair count. A materially
-- different number means the index changed underneath, not that
-- the function is flexible.
--
-- Then confirm the shape and the plan:
--
--   select count(*) from geo_street_cell;               -- ≈ 114,016
--   select pg_size_pretty(pg_total_relation_size('geo_street_cell'));
--                                                       -- ≤ 25 MB
--
--   explain analyze select * from geo_street_nearby(27.491257, -82.481824);
--   explain analyze select * from geo_street_nearby(25.774, -80.194);
--
-- Both must show an Index Scan on geo_street_cell_pkey. Miami is
-- there on purpose: its densest cell holds 145 streets, and a plan
-- that looks fine in Bradenton can still fall over there.
--
-- To undo, in full, leaving nothing behind:
--
--   drop function if exists geo_street_nearby(double precision, double precision, double precision, integer);
--   drop function if exists geo_rebuild_cells();
--   drop table if exists geo_street_cell;
--
-- and raise GEOCODE_CACHE_REVISION. Never lower it: reverting the
-- number resurrects exactly the answers the revert was retiring.
