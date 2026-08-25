-- =============================================================
-- Migration: SMS referral alerts — per-user phone, consent, opt-out
-- Date: 2026-08-25
--
-- Why: clinics and firms want a text alongside the referral email
-- when a case lands. Sending a text to a person is legally very
-- different from emailing an organization, so this migration adds
-- the three things the send path needs and the codebase has none of:
--
--   1. A phone that belongs to a PERSON. `clinics.phone` and
--      `lawyers.phone` exist but are front-desk switchboards
--      published in the directory. Nobody consented to be texted
--      on them, and they are not mobiles.
--   2. Proof of consent good enough to defend a TCPA claim —
--      which means storing the literal text the user agreed to,
--      not just a boolean.
--   3. A record of every STOP, keyed by PHONE rather than by user.
--
-- No data is backfilled. `sms_referral_alerts` defaults to FALSE
-- and must stay that way: consent granted retroactively by a
-- migration is not consent. See scripts/backfill-user-state.ts
-- for what happens when a per-user field is filled in blind.
--
-- Run this in the Supabase SQL Editor on the prod DB.
-- Idempotent (safe to re-run).
--
-- ############################################################
-- #  APPLY THIS *BEFORE* DEPLOYING THE CODE. NOT AFTER.      #
-- #                                                          #
-- #  The same commit widens USER_COLUMNS in src/lib/data.ts  #
-- #  to select the new columns. PostgREST rejects a select   #
-- #  naming a column that does not exist, so on a database   #
-- #  without this migration EVERY user read fails — and the  #
-- #  first one to fail is getUserByUsername, i.e. the login. #
-- #  Deploying first takes the whole site down for everyone, #
-- #  and it looks like an auth bug rather than a schema one. #
-- #                                                          #
-- #  This migration is purely additive, so applying it while #
-- #  the OLD code is live is completely safe. Do that first. #
-- ############################################################
-- =============================================================

-- -------------------------------------------------------------
-- 1. Per-user phone + consent on `users`
-- -------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_e164           TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_referral_alerts  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_consent_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_consent_version  TEXT,
  ADD COLUMN IF NOT EXISTS sms_consent_text     TEXT,
  ADD COLUMN IF NOT EXISTS sms_last_sent_at     TIMESTAMPTZ;

-- `sms_consent_text` looks redundant next to `sms_consent_version`.
-- It is not. A TCPA defense rests on "prior express written
-- consent", which means producing WHAT the user agreed to — not
-- merely that they agreed to v1 of something. Storing only the
-- version relies on nobody ever editing that string in place, and
-- that is exactly the kind of edit that looks harmless in review.

CREATE INDEX IF NOT EXISTS idx_users_sms_targets
  ON users (phone_e164)
  WHERE phone_e164 IS NOT NULL AND sms_referral_alerts;

-- -------------------------------------------------------------
-- 2. Phone-ownership verification (6-digit code)
-- -------------------------------------------------------------
-- Deliberately its own table rather than more columns on `users`:
--   * `users` is read on every login and on every referral send;
--     this row churns once per attempt.
--   * `GET /api/admin/users` strips only `password`. Putting a
--     credential-shaped value into USER_COLUMNS puts it one
--     forgotten `delete` away from a JSON response. Nothing else
--     selects this table.
--   * PK on user_id makes a resend an upsert that self-cleans.
CREATE TABLE IF NOT EXISTS phone_verifications (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone_e164      TEXT        NOT NULL,
  code_hash       TEXT        NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  attempts        INT         NOT NULL DEFAULT 0,
  sends_in_window INT         NOT NULL DEFAULT 1,
  window_start    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone
  ON phone_verifications (phone_e164);

-- -------------------------------------------------------------
-- 3. Opt-outs, keyed by PHONE and never deleted
-- -------------------------------------------------------------
-- There is deliberately NO foreign key to users, and rows are
-- never deleted. Three reasons, all of which have bitten someone:
--
--   * A carrier STOP is a property of the NUMBER. Twilio enforces
--     it sender-side and returns 21610 for any later send to it,
--     whatever account row it hangs off. A model keyed differently
--     from Twilio's will drift, and you will bill for — and log as
--     "sent" — messages the carrier dropped.
--   * The inbound webhook has only a phone number. Resolving it to
--     a user returns 0, 1 or N rows. The 0 case is the dangerous
--     one: a STOP arriving after the account was deleted would
--     update zero rows and vanish. That is the exact fact pattern
--     a TCPA claim is built on.
--   * DELETE /api/admin/users/[id] hard-deletes. A cascading FK
--     here would erase the proof that the opt-out was honored.
--
-- If a schema review proposes "tidying" this with an FK: don't.
CREATE TABLE IF NOT EXISTS sms_opt_outs (
  phone_e164   TEXT PRIMARY KEY,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason       TEXT        NOT NULL,
  raw_keyword  TEXT,
  resumed_at   TIMESTAMPTZ
);

-- -------------------------------------------------------------
-- 4. Delivery log
-- -------------------------------------------------------------
-- Not console.log: Vercel retains free-tier logs for about an hour,
-- which would defeat the whole point of making sends observable.
-- Per-message rows do NOT go to activity_logs — they would drown
-- the admin audit feed, which is for the rare legal events.
CREATE TABLE IF NOT EXISTS sms_messages (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT,
  to_e164    TEXT NOT NULL,
  kind       TEXT NOT NULL,   -- 'otp' | 'referral_alert'
  twilio_sid TEXT,
  status     TEXT NOT NULL,   -- 'queued' | 'failed'
  error_code INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_created ON sms_messages (created_at DESC);

-- A 201 from Twilio means QUEUED, not delivered. The failures that
-- matter most for a fresh toll-free number — 30032 (not verified),
-- 30007 (carrier filtered), 30003 (unreachable) — arrive later on a
-- status callback we do not yet consume. So 'queued' is the honest
-- ceiling here, and no UI may render it as "Delivered".

-- -------------------------------------------------------------
-- 5. Atomic rate gates
-- -------------------------------------------------------------
-- These exist because the read-modify-write cannot be done through
-- the PostgREST query builder, and doing it in JS races: two
-- concurrent requests both read the old row and both send. This is
-- the codebase's first use of supabaseAdmin.rpc(); that is the
-- reason.
CREATE OR REPLACE FUNCTION claim_otp_send(
  p_user_id    TEXT,
  p_phone      TEXT,
  p_code_hash  TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row phone_verifications%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_other_sends INT;
BEGIN
  SELECT * INTO v_row FROM phone_verifications WHERE user_id = p_user_id FOR UPDATE;

  IF FOUND THEN
    IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
      RETURN 'locked';
    END IF;
    IF v_row.last_sent_at > v_now - INTERVAL '60 seconds' THEN
      RETURN 'cooldown';
    END IF;
    IF v_row.window_start > v_now - INTERVAL '24 hours'
       AND v_row.sends_in_window >= 5 THEN
      RETURN 'daily_cap';
    END IF;
  END IF;

  -- Cross-account cap on the NUMBER, so three accounts cannot take
  -- turns texting one victim five times each.
  SELECT COALESCE(SUM(sends_in_window), 0) INTO v_other_sends
    FROM phone_verifications
   WHERE phone_e164 = p_phone
     AND user_id <> p_user_id
     AND window_start > v_now - INTERVAL '24 hours';

  IF v_other_sends >= 5 THEN
    RETURN 'phone_cap';
  END IF;

  INSERT INTO phone_verifications AS pv (
    user_id, phone_e164, code_hash, expires_at,
    attempts, sends_in_window, window_start, last_sent_at, locked_until
  )
  VALUES (
    p_user_id, p_phone, p_code_hash, p_expires_at,
    0, 1, v_now, v_now, NULL
  )
  ON CONFLICT (user_id) DO UPDATE SET
    phone_e164      = EXCLUDED.phone_e164,
    code_hash       = EXCLUDED.code_hash,
    expires_at      = EXCLUDED.expires_at,
    attempts        = 0,
    sends_in_window = CASE
                        WHEN pv.window_start <= v_now - INTERVAL '24 hours' THEN 1
                        ELSE pv.sends_in_window + 1
                      END,
    window_start    = CASE
                        WHEN pv.window_start <= v_now - INTERVAL '24 hours' THEN v_now
                        ELSE pv.window_start
                      END,
    last_sent_at    = v_now,
    locked_until    = NULL;

  RETURN 'ok';
END$$;

CREATE OR REPLACE FUNCTION claim_otp_attempt(
  p_user_id   TEXT,
  p_code_hash TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row phone_verifications%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_row FROM phone_verifications WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN RETURN 'none'; END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    RETURN 'locked';
  END IF;

  IF v_row.expires_at <= v_now THEN
    RETURN 'expired';
  END IF;

  -- The comparison happens here rather than in JS so that the
  -- attempt counter increments in the same statement that reads the
  -- hash. That trades a constant-time compare for atomicity, which
  -- is the right trade: the stored value is a peppered SHA-256 and
  -- the 5-attempt cap below bounds any timing oracle to 5 samples.
  IF v_row.code_hash = p_code_hash THEN
    RETURN 'ok';
  END IF;

  UPDATE phone_verifications
     SET attempts     = attempts + 1,
         locked_until = CASE
                          WHEN attempts + 1 >= 5 THEN v_now + INTERVAL '15 minutes'
                          ELSE locked_until
                        END
   WHERE user_id = p_user_id;

  RETURN 'bad';
END$$;

-- -------------------------------------------------------------
-- 6. Row level security
-- -------------------------------------------------------------
ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_opt_outs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on phone_verifications" ON phone_verifications;
CREATE POLICY "Service role full access on phone_verifications"
  ON phone_verifications FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access on sms_opt_outs" ON sms_opt_outs;
CREATE POLICY "Service role full access on sms_opt_outs"
  ON sms_opt_outs FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access on sms_messages" ON sms_messages;
CREATE POLICY "Service role full access on sms_messages"
  ON sms_messages FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================================
-- Run order:
--   1. Apply this migration on Supabase.
--   2. npx tsx scripts/validate-schema.ts   (must exit 0)
--   3. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
--      TWILIO_MESSAGING_SERVICE_SID, TWILIO_WEBHOOK_URL and
--      PHONE_OTP_PEPPER in Vercel. Until all five are present the
--      send path is inert by design — it fails closed.
--   4. Nobody receives a text until they opt in themselves. There
--      is no admin action and no script that can turn this on for
--      another person.
--
-- Verification (run manually after applying):
--
-- Should return the 7 new columns:
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'users' AND (column_name LIKE 'sms_%' OR column_name LIKE 'phone_%')
--   ORDER BY column_name;
--
-- Must return 0 — nobody may start out opted in:
--   SELECT count(*) FROM users WHERE sms_referral_alerts;
--
-- Both gate functions should exist:
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('claim_otp_send', 'claim_otp_attempt');
--
-- Should return 'ok' then 'cooldown'. Uses a real user id because
-- phone_verifications.user_id is a FK; substitute any admin's id
-- and note the DELETE at the end is not optional:
--   SELECT claim_otp_send(id, '+15005550006', 'deadbeef', now() + interval '10 min')
--     FROM users WHERE role = 'admin' LIMIT 1;
--   SELECT claim_otp_send(id, '+15005550006', 'deadbeef', now() + interval '10 min')
--     FROM users WHERE role = 'admin' LIMIT 1;
--   DELETE FROM phone_verifications WHERE phone_e164 = '+15005550006';
-- =============================================================
