-- =============================================================
-- Migration: add `accident_date` to referral tables
-- Date: 2026-05-22
--
-- Adds an optional `accident_date` (DATE) column to both referral
-- tables so every flow (clinic ⇄ lawyer, clinic → medical
-- specialist, partner referrer) can record when the accident
-- happened. Stored as plain DATE (no time / no timezone shift) and
-- nullable to keep existing rows valid.
--
-- Run this in the Supabase SQL Editor on the prod DB.
-- Idempotent (safe to re-run).
-- =============================================================

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS accident_date DATE;

ALTER TABLE referrer_referrals
  ADD COLUMN IF NOT EXISTS accident_date DATE;
