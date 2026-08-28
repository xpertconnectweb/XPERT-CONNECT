-- =============================================================
-- Migration: referral status lifecycle 3 -> 5
-- Date: 2026-11-XX
--
-- Why: `referrals.status` shipped in scripts/supabase-schema.sql with an
-- INLINE, UNNAMED check constraint -- Postgres auto-named it
-- `referrals_status_check` -- allowing only ('received','in_process',
-- 'attended'). The clinic's real medical-treatment progression has five
-- stages, and the referring attorney watches it from
-- /professionals/referrals:
--
--     Received -> Scheduled -> MRI -> Specialist -> Final MMI
--
-- The terminal stage therefore moves from 'attended' to 'final_mmi'.
-- Existing rows are remapped: 'in_process' -> 'scheduled' (treatment had
-- started) and 'attended' -> 'final_mmi' (it was the terminal stage, so it
-- stays terminal and the completion figures do not jump).
--
-- NOT TOUCHED: `referrer_referrals.status`
-- ('pending','assigned','in_process','completed') is the partner portal's
-- separate vocabulary on a different table. It happens to share the literal
-- 'in_process' with the retired referral set, so a blind find/replace across
-- the database would corrupt the partner pipeline. Nothing below names that
-- table, and step 6 verifies it was left alone.
--
-- Ordered drop -> update -> add, inside a single transaction, so that no row
-- is ever in violation of a live constraint and there is no window in which
-- an unconstrained INSERT could land.
--
-- Idempotent: safe to re-run. On a second run the UPDATE matches 0 rows, the
-- DROP is a no-op, and the ADD is guarded on pg_constraint.
--
-- Deploy order matters: ship the application code FIRST, then apply this.
-- New code renders old rows as a neutral grey pill; old code would throw on
-- a status it has never heard of.
--
-- PRE-FLIGHT (run these first and read the output):
--   SELECT status, count(*) FROM referrals GROUP BY status ORDER BY 2 DESC;
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.referrals'::regclass AND contype = 'c';
-- =============================================================

BEGIN;

-- 1. Drop the old constraint first. Nothing may write to this table between
--    here and step 4; the surrounding transaction guarantees that.
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_status_check;

-- 2. Remap the retired values. 'received' is unchanged and so is absent here.
UPDATE referrals r
SET    status     = m.new_status,
       updated_at = now()
FROM (VALUES
  ('in_process', 'scheduled'),
  ('attended',   'final_mmi')
) AS m(old_status, new_status)
WHERE r.status = m.old_status;

-- 3. Refuse to continue if anything is left outside the new vocabulary,
--    rather than letting ADD CONSTRAINT fail with an opaque message.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT status, ', ') INTO bad
  FROM referrals
  WHERE status NOT IN ('received', 'scheduled', 'mri', 'specialist', 'final_mmi');

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'referrals.status still holds unmapped value(s): %. Add them to the VALUES list in step 2 and re-run.', bad;
  END IF;
END$$;

-- 4. Add the new constraint, NAMED this time, so the next migration can drop
--    it by name instead of relying on Postgres auto-naming.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referrals_status_check'
      AND conrelid = 'public.referrals'::regclass
  ) THEN
    ALTER TABLE referrals
      ADD CONSTRAINT referrals_status_check
      CHECK (status IN ('received', 'scheduled', 'mri', 'specialist', 'final_mmi'));
  END IF;
END$$;

-- 5. The default is unchanged; re-asserted so this file fully describes the
--    column's end state and a re-run leaves it known-good.
ALTER TABLE referrals ALTER COLUMN status SET DEFAULT 'received';

COMMIT;

-- 6. Verification (run manually after applying):
--
-- Should list only the five new values:
--   SELECT status, count(*) FROM referrals GROUP BY status ORDER BY 1;
--
-- Should show the five-value CHECK:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'referrals_status_check';
--
-- Should be 'received':
--   SELECT column_default FROM information_schema.columns
--   WHERE table_name = 'referrals' AND column_name = 'status';
--
-- Should return 0 -- the partner vocabulary must be untouched:
--   SELECT count(*) FROM referrer_referrals
--   WHERE status NOT IN ('pending','assigned','in_process','completed');
--
-- 2026-12 NOTE: the check immediately above is now historical. Partner
-- referrals adopted this same five-stage vocabulary in
-- 2026-12-referrer-referral-status-and-drop.sql; the two tables are no longer
-- disjoint. Do not re-run that query expecting 0.
