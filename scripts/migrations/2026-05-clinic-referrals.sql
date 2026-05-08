-- =============================================================
-- Migration: clinic→lawyer referrals + insurance/adjuster fields
-- Date: 2026-05-05
--
-- Adds 5 optional columns to `referrals` for insurance + adjuster
-- info, makes `coverage` and `pip` nullable, and drops the
-- `lawyer_id REFERENCES users(id)` FK so `lawyer_id` can hold
-- a lawyer-entity id from the `lawyers` table when a clinic
-- creates a referral targeted at a specialist.
--
-- Run this in the Supabase SQL Editor on the prod DB.
-- Idempotent (safe to re-run).
-- =============================================================

-- Drop FK so lawyer_id can be either users(id) (legacy lawyer→clinic
-- flow) or lawyers(id) (new clinic→lawyer flow). The denormalized
-- columns lawyer_name / lawyer_firm carry the human-readable info.
ALTER TABLE referrals
  DROP CONSTRAINT IF EXISTS referrals_lawyer_id_fkey;

-- New optional insurance + adjuster fields.
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS insurance_company TEXT,
  ADD COLUMN IF NOT EXISTS claim_number      TEXT,
  ADD COLUMN IF NOT EXISTS adjuster_name     TEXT,
  ADD COLUMN IF NOT EXISTS adjuster_phone    TEXT,
  ADD COLUMN IF NOT EXISTS adjuster_email    TEXT;

-- Coverage and PIP no longer required.
ALTER TABLE referrals ALTER COLUMN coverage DROP NOT NULL;
ALTER TABLE referrals ALTER COLUMN pip      DROP NOT NULL;
