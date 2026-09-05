-- =============================================================
-- Migration: Public lawyers directory flag
-- Date: 2026-09-05
--
-- Why: The legal directory built in 2026-08-directory-role.sql lives
-- behind a login. Only accounts with role 'directory' (or admin) can
-- reach /professionals/attorneys, and /api/directory/lawyers gates on
-- exactly those two roles.
--
-- The public site now needs the opposite: a "Lawyers Directory" that
-- anyone can search from the landing page, with no account at all.
--
-- That cannot simply be the whole `lawyers` table. The table holds two
-- populations that look identical in SQL and are not the same thing:
--
--   1. Firms seeded from public sources (BD Abogados/*.csv, and the
--      research batch that follows this migration). Their phone and
--      address are already public information; publishing them is the
--      entire point of a directory.
--
--   2. The firm records of attorneys who actually signed up. Those are
--      linked by users.lawyer_id. /api/professionals/lawyers goes out
--      of its way to strip `phone` and `address` from these so clinics
--      cannot route around the platform (see toPublicLawyer in
--      src/lib/api/public-shape.ts). Publishing their direct line on
--      the front page would undo that deliberately, for everyone.
--
-- So the split is made explicit with a column rather than inferred at
-- query time. `directory_public` means "this row may appear on the
-- public site". It defaults to false, which is the safe direction: a
-- firm that signs up later does not silently stay published, and a row
-- inserted by any path that does not know about this column stays
-- private until someone decides otherwise.
--
-- Run this in the Supabase SQL Editor on the prod DB.
--
-- ## RUN THIS, THEN CHECK npm run validate:schema ##
-- PostgREST rejects an entire select if it names a column that does
-- not exist, so the code that reads directory_public cannot work until
-- this is applied.
--
-- The blast radius is deliberately small: only DIRECTORY_COLUMNS in
-- src/lib/data.ts names this column, never LAWYER_COLUMNS. So a deploy
-- that runs ahead of this migration costs the public directory -- which
-- renders its empty state and logs -- and leaves the attorney map, the
-- gated directory, the admin lawyers table and the referral firm picker
-- working. Order still matters; getting it wrong is just no longer an
-- outage.
--
-- Idempotent (safe to re-run).
-- =============================================================

-- 1. The flag
ALTER TABLE lawyers
  ADD COLUMN IF NOT EXISTS directory_public BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill: publish every firm that is NOT a registered user's firm.
--
-- users.lawyer_id is the only membership link. References from
-- referrals.lawyer_id and referrer_referrals.assigned_lawyer_id are
-- deliberately NOT disqualifying: a clinic referring a patient to a
-- seeded firm does not turn that firm into a member, and excluding it
-- would quietly shrink the public directory every time someone uses
-- the product.
--
-- Guarded on directory_public = false so a re-run never re-publishes a
-- row an admin has since unpublished by hand.
UPDATE lawyers l
SET directory_public = true
WHERE l.directory_public = false
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.lawyer_id = l.id);

-- 3. Indexes for the public read path.
--
-- Partial on the true branch: the public route only ever asks for
-- published rows, and the index stays small as the member population
-- grows.
CREATE INDEX IF NOT EXISTS lawyers_directory_public_idx
  ON lawyers (directory_public) WHERE directory_public;

-- GIN over the JSONB practice_areas array. Not needed at 176 rows --
-- filtering is client-side today -- but the route comment in
-- src/app/api/directory/lawyers/route.ts already names this as the fix
-- for practice-area filtering, and the research batch takes the table
-- to roughly 900 rows. Cheap now, avoids a second migration later.
CREATE INDEX IF NOT EXISTS lawyers_practice_areas_gin
  ON lawyers USING gin (practice_areas);

-- 4. Verification (run manually after applying):
--
-- Should show both buckets, with true >= 176 before the research batch:
--   SELECT directory_public, count(*) FROM lawyers GROUP BY 1 ORDER BY 1;
--
-- Should return 0 rows -- no registered attorney's firm is published:
--   SELECT l.id, l.name
--   FROM lawyers l
--   JOIN users u ON u.lawyer_id = l.id
--   WHERE l.directory_public;
--
-- Should list both new indexes:
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'lawyers'
--     AND indexname IN ('lawyers_directory_public_idx', 'lawyers_practice_areas_gin');
