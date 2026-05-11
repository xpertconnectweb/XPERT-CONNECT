-- =============================================================
-- Migration: clinic → medical specialist referrals
-- Date: 2026-05-11
--
-- Adds a discriminator column (`referral_kind`) and three medical-
-- specific columns to `referrals` so a clinic can refer a patient
-- to a medical specialist (e.g. orthopedist, neurologist) instead
-- of an attorney. Existing rows default to `referral_kind='lawyer'`
-- so no data migration is needed.
--
-- Run this in the Supabase SQL Editor on the prod DB.
-- Idempotent (safe to re-run).
-- =============================================================

-- lawyer_id becomes optional for medical referrals.
ALTER TABLE referrals ALTER COLUMN lawyer_id DROP NOT NULL;

-- lawyer_name / lawyer_firm also optional in the medical branch.
ALTER TABLE referrals ALTER COLUMN lawyer_name DROP NOT NULL;
ALTER TABLE referrals ALTER COLUMN lawyer_firm DROP NOT NULL;

-- New columns.
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS referral_kind      TEXT NOT NULL DEFAULT 'lawyer',
  ADD COLUMN IF NOT EXISTS target_clinic_id   TEXT REFERENCES clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_clinic_name TEXT,
  ADD COLUMN IF NOT EXISTS specialist_type    TEXT;

-- Constrain referral_kind to known values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referrals_referral_kind_check'
  ) THEN
    ALTER TABLE referrals
      ADD CONSTRAINT referrals_referral_kind_check
      CHECK (referral_kind IN ('lawyer', 'medical_specialist'));
  END IF;
END$$;

-- Indexes for the new query patterns.
CREATE INDEX IF NOT EXISTS idx_referrals_referral_kind
  ON referrals(referral_kind);
CREATE INDEX IF NOT EXISTS idx_referrals_target_clinic_id
  ON referrals(target_clinic_id);
