-- =============================================================
-- Migration: candidate generation for the self-hosted geocoder
-- Date: 2026-09-02
--
-- Depends on scripts/migrations/2026-09-geo-index.sql, both parts,
-- and on the index having been loaded.
--
-- Why a function rather than a PostgREST query: `%` and
-- `similarity()` come from pg_trgm and neither is expressible
-- through PostgREST's filter syntax. This is also the only place
-- the trigram threshold is set, so there is one answer to "how
-- close is close enough" instead of one per caller.
--
-- ── What this does and does not do ───────────────────────────
--
-- It generates CANDIDATES, cheaply, and stops. The ranking that
-- decides which one the user meant is in
-- src/lib/geocoding/street-index.ts, in TypeScript, where it can
-- be unit-tested and where it can see things SQL cannot — how
-- close the house number is to the block, how the query was
-- parsed, where the map is currently looking.
--
-- That split is the whole architecture. `src/lib/search/engine.ts`
-- has a scoring model this project trusts, calibrated against real
-- incidents, but its search() walks every document: about 2.3 µs
-- each, which is 2 ms over 872 clinics and would be 22 minutes
-- over 17 million address points. So the index generates fifty
-- candidates and the good scorer runs on fifty rows.
--
-- Run this in the Supabase SQL Editor on the prod DB.
-- Idempotent (safe to re-run).
-- =============================================================


create or replace function geo_street_search(
  q        text,
  q_state  text    default null,
  q_zip    text    default null,
  q_city   text    default null,
  q_limit  integer default 50
)
returns table (
  id           integer,
  name_norm    text,
  name_display text,
  city         text,
  state        text,
  zip          text,
  num_min      integer,
  num_max      integer,
  lat_min      double precision,
  lat_max      double precision,
  lng_min      double precision,
  lng_max      double precision,
  point_count  integer,
  score        real
)
language sql
stable
-- 0.24 rather than pg_trgm's 0.3 default. The trigram stage is
-- meant to be generous: precision is the ranker's job and it only
-- ever sees fifty rows, whereas a candidate this stage drops is
-- gone for good.
--
-- Declared as a function property rather than called as
-- `set_limit()` in the body. `set_limit` changes the setting for
-- the whole session, and these connections come from a pooler --
-- it would leak into whatever query ran next on the same
-- connection. A SET clause is scoped to the call and restored
-- afterwards. It also makes the function parallel-restricted,
-- which is why that marking is absent.
set pg_trgm.similarity_threshold = 0.24
as $$
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
    similarity(s.name_norm, q) as score
  from geo_street s
  where
    -- The state IS a hard filter. It is read server-side from the
    -- session, never sent by the client, and this platform serves
    -- two states -- so a Florida user is never looking for a
    -- Minnesota street, and letting one through would only add
    -- noise to the ranking.
    (q_state is null or s.state = q_state)
    and s.name_norm % q

  -- The postcode and city are NOT filters, here or anywhere.
  -- People mistype postcodes, and a clinic at the edge of one
  -- city has a postal city nobody calls it by; filtering on
  -- either would turn a small error into no result at all. They
  -- only move a row up the ordering.
  --
  -- That still matters, and it is the reason they are in this
  -- query rather than left entirely to the ranker: "main st"
  -- matches thousands of rows and only fifty survive the LIMIT.
  -- Without these two terms the right street can be cut before
  -- the ranker ever sees it.
  order by
    similarity(s.name_norm, q)
      + case when q_zip  is not null and s.zip  = q_zip  then 0.15 else 0 end
      + case when q_city is not null and s.city = q_city then 0.10 else 0 end
      desc,
    -- The tie-break that matters: a street with four hundred
    -- address points is the road someone means; one with three is
    -- usually a fragment a single source published on its own.
    s.point_count desc
  limit q_limit;
$$;


-- Reference data from public county registers, but there is no
-- reason for a browser to reach it: every geocoding request
-- already goes server-to-server through /api/geocode.
revoke all on function geo_street_search(text, text, text, text, integer) from public;
revoke all on function geo_street_search(text, text, text, text, integer) from anon;
revoke all on function geo_street_search(text, text, text, text, integer) from authenticated;
grant execute on function geo_street_search(text, text, text, text, integer) to service_role;
