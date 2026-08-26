-- =============================================================
-- Why is the address search slow?
--
-- Read-only. Nothing here creates, changes or deletes anything.
-- Run each block on its own in the Supabase SQL Editor and keep
-- the output — the editor shows one result set at a time.
--
-- What is being diagnosed: `geo_street_search` takes about 1.5 s
-- against 567,767 streets, and it takes the same 1.5 s for a rare
-- street name as for a common one. Constant time regardless of how
-- selective the query is, is the signature of a sequential scan.
-- Either the trigram index is absent, or the query is written in a
-- way that stops the planner using it.
--
-- These four blocks tell those two apart.
-- =============================================================


-- ── 1. Which indexes exist ───────────────────────────────────
--
-- PART 2 of 2026-09-geo-index.sql creates three: geo_street_trgm
-- (GIN), geo_street_state_zip and geo_street_state_city. Plus the
-- primary keys and geo_street_key from PART 1.

select tablename, indexname, indexdef
from pg_indexes
where tablename in ('geo_street', 'geo_street_points')
order by tablename, indexname;


-- ── 2. Does the planner have any statistics? ─────────────────
--
-- `analyze` runs at the end of PART 2. Without it the planner
-- estimates a handful of rows in a table holding half a million,
-- and picks a sequential scan over the index it was just given.
-- `last_analyze` and `last_autoanalyze` both null is the answer.

select relname, n_live_tup, last_analyze, last_autoanalyze, last_vacuum
from pg_stat_user_tables
where relname in ('geo_street', 'geo_street_points');


-- ── 3. The simplest possible trigram query ───────────────────
--
-- No parameters, no OR branches, nothing that could confuse the
-- planner. If this uses "Bitmap Index Scan on geo_street_trgm"
-- and takes a few milliseconds, the index is fine and the problem
-- is how geo_street_search is written. If it says "Seq Scan on
-- geo_street", the index is missing or unusable.

explain (analyze, buffers)
select s.id, s.name_display, similarity(s.name_norm, '62nd st cir e') as score
from geo_street s
where s.state = 'FL'
  and s.name_norm % '62nd st cir e'
order by similarity(s.name_norm, '62nd st cir e') desc
limit 50;


-- ── 4. The real query, with its parameters as literals ───────
--
-- The same shape geo_street_search runs, but with values written
-- in. That difference is the point: with literals the planner can
-- fold `null is null` away and drop the dead branches, and with
-- parameters it cannot.
--
-- So if block 3 is fast, this one is fast, and the function is
-- still slow — the cause is the parameter-dependent branches, and
-- the fix is in the SQL, not in the index.

explain (analyze, buffers)
select
  s.id,
  s.name_display,
  similarity(s.name_norm, '62nd st cir e') as score
from geo_street s
where
  s.state = 'FL'
  and (
    s.name_norm % '62nd st cir e'
    or (s.zip = '34208' and similarity(s.name_norm, '62nd st cir e') > 0.12)
  )
order by
  similarity(s.name_norm, '62nd st cir e')
    + case when s.zip = '34208' then 0.15 else 0 end desc,
  s.point_count desc
limit 50;
