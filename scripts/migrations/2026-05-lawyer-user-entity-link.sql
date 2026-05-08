-- =============================================================
-- Migration: Link lawyer USER accounts to lawyer ENTITIES (firms)
-- Date: 2026-05-05
--
-- Why: Until now, `referrals.lawyer_id` ambiguously referenced
-- either a user (legacy lawyer→clinic flow) or a lawyer entity
-- (new clinic→lawyer flow), making it impossible to filter
-- referrals consistently. This migration unifies the data model:
--
--   - users.lawyer_id  → FK to lawyers(id), nullable
--                        (links a lawyer login account to its firm)
--   - referrals.lawyer_id → FK to lawyers(id) (the firm involved)
--   - referrals.created_by_user_id → FK to users(id), nullable
--                        (who initiated the referral; audit trail)
--   - referrals.creator_role → 'lawyer' | 'clinic' | 'admin'
--
-- The migration backfills:
--   1. users.lawyer_id by matching user.email to lawyers.email
--      (case-insensitive). Unmatched lawyer users keep NULL and
--      will need an admin to link them manually.
--   2. Existing referrals where lawyer_id was a user-id are
--      rewritten to point at that user's lawyer entity. Rows
--      whose user has no entity match are flagged via
--      creator_role='lawyer' but lawyer_id stays as the original
--      user id (will fail the new FK; see Step 6 below).
--
-- Run order:
--   1. Apply this migration on Supabase.
--   2. As admin, log into /admin/users and assign lawyer_id to
--      every lawyer user that didn't auto-link. Until that is
--      done, referrals belonging to those users will be orphaned.
--
-- Idempotent: re-running this migration is safe.
-- =============================================================

-- 1. Allow all 5 roles in users.role
DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('lawyer', 'clinic', 'admin', 'partner', 'referrer'));
END$$;

-- 2. users.lawyer_id (entity link)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS lawyer_id TEXT REFERENCES lawyers(id);

-- 3. referrals: track originator
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS creator_role       TEXT;

-- Add the FK on created_by_user_id only after column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referrals_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE referrals
      ADD CONSTRAINT referrals_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- creator_role CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referrals_creator_role_check'
  ) THEN
    ALTER TABLE referrals
      ADD CONSTRAINT referrals_creator_role_check
      CHECK (creator_role IS NULL OR creator_role IN ('lawyer', 'clinic', 'admin'));
  END IF;
END$$;

-- 4. Backfill users.lawyer_id by email match (case-insensitive)
UPDATE users u
SET lawyer_id = l.id
FROM lawyers l
WHERE u.role = 'lawyer'
  AND u.lawyer_id IS NULL
  AND l.email IS NOT NULL
  AND l.email <> ''
  AND LOWER(u.email) = LOWER(l.email);

-- 5. Backfill referrals: legacy rows have lawyer_id=user.id and
-- creator_role IS NULL. Set creator_role/created_by_user_id, then
-- rewrite lawyer_id to the user's lawyer entity (if known).
UPDATE referrals r
SET creator_role       = 'lawyer',
    created_by_user_id = r.lawyer_id
WHERE r.creator_role IS NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = r.lawyer_id AND u.role = 'lawyer');

UPDATE referrals r
SET lawyer_id = u.lawyer_id
FROM users u
WHERE u.id = r.created_by_user_id
  AND u.lawyer_id IS NOT NULL
  AND r.creator_role = 'lawyer'
  AND r.lawyer_id = r.created_by_user_id;  -- only rewrite if not yet rewritten

-- 6. Restore the FK on referrals.lawyer_id, now pointing at the
-- lawyers entity table. Rows whose lawyer user has no entity
-- match will FAIL this constraint; we use NOT VALID + manual
-- VALIDATE to make the migration succeed and surface offenders
-- via a SELECT below.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referrals_lawyer_id_fkey'
  ) THEN
    ALTER TABLE referrals
      ADD CONSTRAINT referrals_lawyer_id_fkey
      FOREIGN KEY (lawyer_id) REFERENCES lawyers(id)
      NOT VALID;
  END IF;
END$$;

-- 7. Audit query: surface orphaned referrals (lawyer_id is a
-- user id that wasn't linked to an entity). Run this after the
-- migration to see what admin needs to fix.
--
-- SELECT r.id, r.lawyer_name, r.created_by_user_id, r.created_at
-- FROM referrals r
-- LEFT JOIN lawyers l ON l.id = r.lawyer_id
-- WHERE l.id IS NULL;
--
-- After admin links missing users.lawyer_id and re-runs the
-- backfill UPDATE in step 5, run:
--   ALTER TABLE referrals VALIDATE CONSTRAINT referrals_lawyer_id_fkey;
-- to enforce the FK on all rows.
