-- =============================================================
-- Migration: referrer_referrals adopts the medical lifecycle,
--            and case_confirmed gains 'drop'
-- Date: 2026-12-XX
--
-- Why (A): `referrer_referrals.status` shipped in scripts/supabase-schema.sql
-- with an INLINE, UNNAMED check constraint -- Postgres auto-named it
-- `referrer_referrals_status_check` -- allowing only
-- ('pending','assigned','in_process','completed'). That vocabulary described
-- ROUTING ("has an admin picked a provider yet"), not the client's medical
-- progress, and the referrer read it under a column headed "Status" sitting
-- beside the identically-headed column on `referrals`, which has meant the
-- five-stage medical lifecycle since 2026-11. Two meanings, one word.
--
-- Partner referrals now carry the SAME five stages, under the heading
-- "Medical Status":
--
--     received -> scheduled -> mri -> specialist -> final_mmi
--
-- Row remap, chosen so no dashboard figure jumps:
--     pending    -> received    (submitted; nothing medical has happened)
--     assigned   -> received    (see below)
--     in_process -> scheduled   (treatment had started)
--     completed  -> final_mmi   (terminal stays terminal)
--
-- 'assigned' folds into 'received' deliberately. "Has this been routed to a
-- provider" is now derived from assigned_clinic_id / assigned_lawyer_id being
-- NULL -- the truth those columns were always holding, and which the old
-- status could flatly contradict (a row could carry a clinic and still read
-- 'pending', and did). Expect the admin dashboard's "Partner referrals to
-- assign" figure to MOVE because of this; that is the correction, not a bug.
--
-- Why (B): `case_confirmed` allowed only ('pending','confirmed'), so a case
-- the client declined had nowhere to go and sat as 'pending' for ever. It
-- gains 'drop'. NO rows change: 'drop' is simply newly legal. A dropped case
-- stays INSIDE the "% cases confirmed" denominator, which is why the app now
-- shows the raw drop count everywhere that percentage appears.
--
-- Ordered drop -> update -> add, inside a single transaction, so no row is
-- ever in violation of a live constraint and there is no window in which an
-- unconstrained INSERT could land.
--
-- Idempotent: safe to re-run. The UPDATE matches 0 rows on a second pass, and
-- both constraint blocks recognise the already-new definitions and skip.
--
-- Constraints are dropped BY DISCOVERY, not by assumed name: the originals
-- were anonymous, and DROP ... IF EXISTS on a guessed name would silently
-- no-op and leave the old CHECK live to reject step 3.
--
-- DEPLOY ORDER: ship the application code FIRST, then apply this, and keep the
-- gap to minutes. New code writes 'received', which the OLD check rejects
-- (500 on a partner submission); old code writes 'pending', which the NEW
-- check rejects. Either order has a write window, so the fix is a short gap,
-- not a different order. Have this file pasted into the SQL editor before the
-- deploy is triggered.
--
-- PRE-FLIGHT (run these first and read the output):
--   SELECT status, count(*) FROM referrer_referrals GROUP BY status ORDER BY 2 DESC;
--     -- expected before this runs: pending 5, assigned 1, in_process 1, completed 1
--   SELECT case_confirmed, count(*) FROM referrer_referrals GROUP BY case_confirmed;
--   SELECT count(*) AS will_show_as_unassigned FROM referrer_referrals
--     WHERE assigned_clinic_id IS NULL AND assigned_lawyer_id IS NULL;
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.referrer_referrals'::regclass AND contype = 'c';
-- =============================================================

BEGIN;

-- 1. Drop the old status CHECK, whatever Postgres called it. Matching on
--    'assigned' -- a literal only the OLD definition contains -- is what makes
--    this safe to re-run and keeps it away from the service_needed CHECK.
DO $$
DECLARE cn text;
BEGIN
  FOR cn IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.referrer_referrals'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
      AND pg_get_constraintdef(oid) LIKE '%''assigned''%'
  LOOP
    EXECUTE format('ALTER TABLE referrer_referrals DROP CONSTRAINT %I', cn);
  END LOOP;
END$$;

-- 2. Drop the old case_confirmed CHECK. Both the old and the new definition
--    contain 'pending' and 'confirmed', so the discriminator is the ABSENCE of
--    'drop' -- which is likewise what makes a re-run a no-op.
DO $$
DECLARE cn text;
BEGIN
  FOR cn IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.referrer_referrals'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%case_confirmed%'
      AND pg_get_constraintdef(oid) NOT LIKE '%''drop''%'
  LOOP
    EXECUTE format('ALTER TABLE referrer_referrals DROP CONSTRAINT %I', cn);
  END LOOP;
END$$;

-- 3. Remap the retired status values. This table deliberately has NO
--    updated_at trigger (it is written from JS), so bump it here, matching what
--    the 2026-11 migration did to `referrals`. Nothing measures staleness on
--    referrer_referrals -- the "stuck over 7 days" alert reads `referrals`
--    only -- so no dashboard figure moves because of this.
UPDATE referrer_referrals r
SET    status     = m.new_status,
       updated_at = now()
FROM (VALUES
  ('pending',    'received'),
  ('assigned',   'received'),
  ('in_process', 'scheduled'),
  ('completed',  'final_mmi')
) AS m(old_status, new_status)
WHERE r.status = m.old_status;

-- 4. case_confirmed needs no UPDATE: 'pending' and 'confirmed' are both still
--    legal. The column is only being WIDENED.

-- 5. Refuse to continue if anything is left outside either new vocabulary,
--    rather than letting ADD CONSTRAINT fail with an opaque message.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT status, ', ') INTO bad
  FROM referrer_referrals
  WHERE status NOT IN ('received', 'scheduled', 'mri', 'specialist', 'final_mmi');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'referrer_referrals.status still holds unmapped value(s): %. Add them to the VALUES list in step 3 and re-run.', bad;
  END IF;

  SELECT string_agg(DISTINCT case_confirmed, ', ') INTO bad
  FROM referrer_referrals
  WHERE case_confirmed NOT IN ('pending', 'confirmed', 'drop');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'referrer_referrals.case_confirmed holds unexpected value(s): %. Decide how they map before widening the constraint.', bad;
  END IF;
END$$;

-- 6. Add both constraints, NAMED this time, so the next migration can drop
--    them by name instead of rediscovering them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referrer_referrals_status_check'
      AND conrelid = 'public.referrer_referrals'::regclass
  ) THEN
    ALTER TABLE referrer_referrals
      ADD CONSTRAINT referrer_referrals_status_check
      CHECK (status IN ('received', 'scheduled', 'mri', 'specialist', 'final_mmi'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referrer_referrals_case_confirmed_check'
      AND conrelid = 'public.referrer_referrals'::regclass
  ) THEN
    ALTER TABLE referrer_referrals
      ADD CONSTRAINT referrer_referrals_case_confirmed_check
      CHECK (case_confirmed IN ('pending', 'confirmed', 'drop'));
  END IF;
END$$;

-- 7. Defaults. status moves 'pending' -> 'received' (the old default is no
--    longer a legal value, so an INSERT that omitted status would fail without
--    this). case_confirmed's default is unchanged, re-asserted so this file
--    fully describes the columns' end state.
ALTER TABLE referrer_referrals ALTER COLUMN status         SET DEFAULT 'received';
ALTER TABLE referrer_referrals ALTER COLUMN case_confirmed SET DEFAULT 'pending';

COMMIT;

-- 8. Verification (run manually after applying):
--
-- Should list only the five new values, summing to the pre-flight total:
--   SELECT status, count(*) FROM referrer_referrals GROUP BY status ORDER BY 1;
--   -- expected from today's 8 rows: final_mmi 1, received 6, scheduled 1
--
-- Should list pending/confirmed only (nothing is dropped yet):
--   SELECT case_confirmed, count(*) FROM referrer_referrals GROUP BY case_confirmed;
--
-- Should show both new CHECKs, under the names above:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.referrer_referrals'::regclass AND contype = 'c'
--   ORDER BY conname;
--
-- Should be 'received' and 'pending':
--   SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name = 'referrer_referrals'
--     AND column_name IN ('status','case_confirmed');
--
-- Should equal the KPI "Partner referrals to assign" on /admin/dashboard:
--   SELECT count(*) FROM referrer_referrals
--   WHERE assigned_clinic_id IS NULL AND assigned_lawyer_id IS NULL;
--
-- Should succeed and then roll back -- proves 'drop' is legal:
--   BEGIN; UPDATE referrer_referrals SET case_confirmed = 'drop'
--     WHERE id = (SELECT id FROM referrer_referrals LIMIT 1); ROLLBACK;
