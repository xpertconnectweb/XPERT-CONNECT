-- =============================================================
-- Migration: self-hosted geocoding index (Florida + Minnesota)
-- Date: 2026-09-01
--
-- Why: today every address typed into this platform is sent to
-- Geoapify to be resolved. That works, it costs nothing on their
-- free tier, and it is measured — but the addresses in question
-- are the home addresses of personal-injury clients, and
-- next.config.js:56 already documents the deliberate decision to
-- keep them off third-party servers as far as the browser is
-- concerned. This closes the other half: the county address
-- registers live here, and the address never leaves.
--
-- The data is OpenAddresses, which aggregates what US counties
-- publish themselves under licences permitting commercial use.
-- 144 sources across the two states the platform serves,
-- 17.1 million address points, 567,767 distinct streets.
--
-- ── The shape, and why it is two tables ──────────────────────
--
-- Manatee County publishes 301,660 address points across 5,642
-- streets: fifty-three points per street. That ratio is the
-- whole design.
--
--   `geo_street` is small and searched constantly. Autocomplete
--   runs on it and nothing else, so it stays narrow enough for
--   its indexes to sit in the free plan's shared buffers.
--
--   `geo_street_points` is large and read once per selection, by
--   primary key. Every house number on a street is packed into a
--   single blob at about four bytes each — the codec is in
--   src/lib/geocoding/payload-codec.ts and the format is
--   documented there. Stored one row per point this table would
--   be several gigabytes; packed it is a hundred megabytes.
--
-- Projected total with indexes: ~240 MB of the free plan's
-- 500 MB. Measured, not guessed — `npx tsx
-- scripts/geo/build-index.ts --report` prints the breakdown.
--
-- Run this in the Supabase SQL Editor on the prod DB.
-- Idempotent (safe to re-run).
--
-- ############################################################
-- #  THIS FILE HAS TWO PARTS. RUN PART 1, LOAD THE DATA,     #
-- #  THEN RUN PART 2.                                        #
-- #                                                          #
-- #  Part 2 builds the trigram index. Creating it before the #
-- #  load would make all 567,767 inserts maintain it row by  #
-- #  row, which turns a twenty-minute load into hours. This  #
-- #  is the one ordering that matters here.                  #
-- ############################################################
--
-- Nothing in this migration touches an existing table, and no
-- application code reads these tables until GEOCODER_PROVIDER is
-- switched to `selfhosted`. It is safe to apply at any time.
-- =============================================================


-- =============================================================
--  PART 1 — run before loading
-- =============================================================

-- Trigram similarity. Without it there is no tolerance for a
-- typo, and "62nd st cirle" finds nothing at all.
--
-- This is the project's first Postgres extension. It ships with
-- Supabase on every plan including Free, and it is enabled per
-- database rather than per table.
create extension if not exists pg_trgm;


create table if not exists geo_street (
  -- Assigned by the indexer, not by a sequence. The points table
  -- needs this id to reference, and reading generated ids back
  -- from an insert would mean a round trip per batch plus an
  -- assumption about the order rows come back in. Assigned up
  -- front, both tables load independently and restartably.
  id            integer     primary key,

  -- Folded: lower case, no punctuation, single spaces. Produced
  -- by fold() in src/lib/search/text.ts, and the query side MUST
  -- use the same function or the trigram index is searching a
  -- different alphabet than it was built from.
  name_norm     text        not null,

  -- As the county publishes it, title-cased: "62nd Street Cir E".
  -- This is what the user is shown.
  name_display  text        not null,

  -- Empty string rather than NULL throughout. These three form
  -- the unique key with name_norm, and in Postgres a NULL never
  -- equals a NULL — a nullable column here would let the same
  -- street be inserted an unlimited number of times.
  --
  -- `text`, and NOT char(2)/char(5) however well those would
  -- document a state code and a postcode. This file declared them
  -- that way and it cost a factor of eleven: geo_street_search
  -- takes text parameters, comparing bpchar to text casts the
  -- COLUMN, and an index cannot serve a predicate on
  -- `(column)::text`. Worse, a BitmapOr needs every branch of an
  -- OR to be indexable — so losing the postcode branch lost the
  -- trigram index too, and the planner fell back to scanning all
  -- 567,767 rows. See 2026-09-geo-column-types.sql, which repairs
  -- a database created before this line was fixed.
  city          text        not null default '',
  state         text        not null,
  zip           text        not null default '',

  -- The house numbers present on this street. Lets a query reject
  -- an out-of-range number before fetching the blob at all.
  num_min       integer     not null,
  num_max       integer     not null,

  -- Bounding box, for proximity ranking and for framing the map.
  lat_min       double precision not null,
  lat_max       double precision not null,
  lng_min       double precision not null,
  lng_max       double precision not null,

  point_count   integer     not null,

  -- A hash of the packed points and the published name.
  --
  -- This is what makes the quarterly refresh differential. Counties change
  -- very little between publications -- a new subdivision, a renumbered
  -- block -- so re-ingesting rewrites 567,000 rows to change a few hundred
  -- unless there is something cheap to compare. Reading back 100 MB of
  -- payloads to diff them would cost more than the rewrite; reading back
  -- 567,000 integers costs almost nothing.
  checksum      integer     not null
);


create table if not exists geo_street_points (
  street_id     integer     primary key
                            references geo_street(id) on delete cascade,

  -- Delta-coded, columnar, ~4 bytes per address point. The layout
  -- is documented in src/lib/geocoding/payload-codec.ts, which is
  -- the only thing that reads or writes it.
  payload       bytea       not null
);


-- The upsert target. Also the constraint that makes a reload
-- idempotent: run the loader twice and nothing duplicates.
create unique index if not exists geo_street_key
  on geo_street (state, city, zip, name_norm);


-- Reference data from public county registers — no personal
-- information, nothing about a client or a case. RLS is enabled
-- anyway, with no policy, so only the service role reads it:
-- every geocoding request already goes server-to-server through
-- /api/geocode, and there is no reason to widen that.
alter table geo_street        enable row level security;
alter table geo_street_points enable row level security;


-- =============================================================
--  PART 2 — run AFTER the loader finishes
--
--  npx tsx scripts/geo/load-index.ts --apply
-- =============================================================

-- The autocomplete index. GIN over trigrams is what makes
-- `name_norm % $1` an index scan instead of 567,767 comparisons,
-- and what makes a misspelling still find the street.
--
-- Expect this to take several minutes and a few hundred MB of
-- temporary space while it builds.
create index if not exists geo_street_trgm
  on geo_street using gin (name_norm gin_trgm_ops);

-- Scoping. A query carrying a postcode should never look at
-- another state's streets, and these two make that a cheap
-- pre-filter rather than a post-filter.
create index if not exists geo_street_state_zip
  on geo_street (state, zip);

create index if not exists geo_street_state_city
  on geo_street (state, city);

-- The planner has no statistics for a table that appeared and
-- filled in one session; without this it will estimate a handful
-- of rows and choose a sequential scan over the index just built.
analyze geo_street;
analyze geo_street_points;
