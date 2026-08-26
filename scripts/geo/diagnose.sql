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


-- ── 5. The function itself ───────────────────────────────────
--
-- Blocks 3 and 4 measure the query. This measures what actually
-- runs in production.
--
-- A `language sql` function is sometimes inlined into the calling
-- query, in which case the real plan appears below and can be
-- compared with block 4. If instead it prints a single line saying
-- "Function Scan on geo_street_search", it was not inlined — and
-- the total Execution Time is still the number that matters.

explain (analyze, buffers)
select * from geo_street_search('62nd st cir e', 'FL', '34208', null, 50);


-- ── 6. The same query, but with real parameters ──────────────
--
-- The decisive one. Block 4 was fast partly because a planner
-- given literals can fold `null is null` away and delete the dead
-- branches before it starts. Given parameters it cannot: it has to
-- produce one plan that works for every possible value.
--
-- PREPARE reproduces exactly that. Postgres builds a fresh plan
-- for the first five executions and then decides whether a single
-- generic plan is cheap enough to reuse — so the sixth is where a
-- bad generic plan shows itself. Run the whole block; compare the
-- last EXECUTE with the first.

prepare geo_probe (text, text, text, text, integer) as
  select s.id, s.name_display, similarity(s.name_norm, $1) as score
  from geo_street s
  where
    ($2 is null or s.state = $2)
    and (
      s.name_norm % $1
      or ($3 is not null and s.zip  = $3 and similarity(s.name_norm, $1) > 0.12)
      or ($4 is not null and s.city = $4 and similarity(s.name_norm, $1) > 0.12)
    )
  order by
    similarity(s.name_norm, $1)
      + case when $3 is not null and s.zip  = $3 then 0.15 else 0 end
      + case when $4 is not null and s.city = $4 then 0.10 else 0 end
      desc,
    s.point_count desc
  limit $5;

explain (analyze) execute geo_probe('62nd st cir e', 'FL', '34208', null, 50);
explain (analyze) execute geo_probe('62nd st cir e', 'FL', '34208', null, 50);
explain (analyze) execute geo_probe('62nd st cir e', 'FL', '34208', null, 50);
explain (analyze) execute geo_probe('62nd st cir e', 'FL', '34208', null, 50);
explain (analyze) execute geo_probe('62nd st cir e', 'FL', '34208', null, 50);
explain (analyze, buffers) execute geo_probe('62nd st cir e', 'FL', '34208', null, 50);

deallocate geo_probe;
