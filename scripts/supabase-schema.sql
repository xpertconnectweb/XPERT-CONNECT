-- =============================================================
-- XPERT-CONNECT: Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables.
-- =============================================================

-- 1. Users table
-- lawyer_id links a `role='lawyer'` user account to its firm
-- (lawyers.id). FK added below after the lawyers table is created.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('lawyer', 'clinic', 'admin', 'partner', 'referrer', 'directory')),
  clinic_id   TEXT,
  lawyer_id   TEXT,
  firm_name   TEXT,
  email       TEXT NOT NULL,
  state       TEXT,
  -- SMS referral alerts. Only the user themselves writes these, via
  -- /api/me/*. sms_referral_alerts MUST default FALSE: a consent flag
  -- that defaults true is consent nobody gave.
  phone_e164          TEXT,
  phone_verified_at   TIMESTAMPTZ,
  sms_referral_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  sms_consent_at      TIMESTAMPTZ,
  sms_consent_version TEXT,
  sms_consent_text    TEXT,
  sms_last_sent_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Clinics table
CREATE TABLE IF NOT EXISTS clinics (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  specialties JSONB NOT NULL DEFAULT '[]',
  email       TEXT NOT NULL DEFAULT '',
  website     TEXT,
  region      TEXT,
  county      TEXT,
  available   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. Lawyers table
CREATE TABLE IF NOT EXISTS lawyers (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  address        TEXT NOT NULL,
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,
  phone          TEXT NOT NULL DEFAULT '',
  practice_areas JSONB NOT NULL DEFAULT '[]',
  email          TEXT NOT NULL DEFAULT '',
  website        TEXT,
  region         TEXT,
  county         TEXT,
  zip_code       TEXT,
  available      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- 4. Referrals table.
-- referral_kind = 'lawyer'              → lawyer_id points at lawyers(id) (firm)
-- referral_kind = 'medical_specialist'  → target_clinic_id may point at clinics(id);
--                                         lawyer_id/lawyer_name/lawyer_firm are NULL
-- created_by_user_id records the originating user and creator_role
-- its role at creation time.
CREATE TABLE IF NOT EXISTS referrals (
  id                  TEXT PRIMARY KEY,
  referral_kind       TEXT NOT NULL DEFAULT 'lawyer' CHECK (referral_kind IN ('lawyer', 'medical_specialist')),
  lawyer_id           TEXT REFERENCES lawyers(id),
  lawyer_name         TEXT,
  lawyer_firm         TEXT,
  clinic_id           TEXT NOT NULL REFERENCES clinics(id),
  clinic_name         TEXT NOT NULL,
  target_clinic_id    TEXT REFERENCES clinics(id) ON DELETE SET NULL,
  target_clinic_name  TEXT,
  specialist_type     TEXT,
  created_by_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  creator_role        TEXT CHECK (creator_role IS NULL OR creator_role IN ('lawyer', 'clinic', 'admin')),
  patient_name        TEXT NOT NULL,
  patient_phone       TEXT NOT NULL,
  case_type           TEXT NOT NULL,
  coverage            TEXT,
  pip                 TEXT,
  insurance_company   TEXT,
  claim_number        TEXT,
  adjuster_name       TEXT,
  adjuster_phone      TEXT,
  adjuster_email      TEXT,
  notes               TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL CHECK (status IN ('received', 'in_process', 'attended')) DEFAULT 'received',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referral_kind   ON referrals(referral_kind);
CREATE INDEX IF NOT EXISTS idx_referrals_target_clinic_id ON referrals(target_clinic_id);

-- Now that the lawyers table exists, attach the FK on users.lawyer_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_lawyer_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_lawyer_id_fkey
      FOREIGN KEY (lawyer_id) REFERENCES lawyers(id);
  END IF;
END$$;

-- 4. Contacts table (public form submissions)
CREATE TABLE IF NOT EXISTS contacts (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT NOT NULL,
  service    TEXT NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Newsletter subscribers
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  subscribed_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================
-- Tables 6-8 were originally created by hand in the Supabase
-- dashboard and were missing from this file, so a freshly
-- provisioned database could not run Settings, referrer referrals
-- or the activity feed. The DDL below is reconstructed from the
-- column lists the code actually queries:
--   referrer_referrals → RREF_COLUMNS in src/lib/data.ts
--   settings           → src/app/api/admin/settings/route.ts
--   activity_logs      → src/lib/activity-log.ts + types/admin.ts
-- Diff it against production before relying on it for a migration.
-- =============================================================

-- 6. Referrer referrals (referrer submits a client, admin routes it)
CREATE TABLE IF NOT EXISTS referrer_referrals (
  id                  TEXT PRIMARY KEY,
  referrer_id         TEXT NOT NULL REFERENCES users(id),
  referrer_name       TEXT NOT NULL,
  state               TEXT NOT NULL,
  client_name         TEXT NOT NULL,
  client_phone        TEXT NOT NULL,
  client_email        TEXT NOT NULL DEFAULT '',
  client_address      TEXT NOT NULL,
  service_needed      TEXT NOT NULL CHECK (service_needed IN ('clinic', 'lawyer', 'both')),
  case_type           TEXT NOT NULL,
  accident_date       DATE,
  notes               TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'assigned', 'in_process', 'completed')),
  assigned_clinic_id  TEXT REFERENCES clinics(id) ON DELETE SET NULL,
  assigned_clinic_name TEXT,
  assigned_lawyer_id  TEXT REFERENCES lawyers(id) ON DELETE SET NULL,
  assigned_lawyer_name TEXT,
  case_confirmed      TEXT NOT NULL DEFAULT 'pending'
                      CHECK (case_confirmed IN ('pending', 'confirmed')),
  admin_notes         TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- 7. Platform settings (key/value; see PlatformSettings in types/admin.ts)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

-- 8. Activity logs (admin audit feed)
CREATE TABLE IF NOT EXISTS activity_logs (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  user_name   TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  target_name TEXT,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON activity_logs (created_at DESC);

-- =============================================================
-- Auto-update triggers for updated_at
-- =============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_clinics_updated_at
  BEFORE UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_lawyers_updated_at
  BEFORE UPDATE ON lawyers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Deliberately NO trigger on referrer_referrals: its updated_at is
-- set from JS (src/app/api/admin/referrer-referrals/[id]/route.ts).
-- Adding one here would silently overwrite the value the API wrote,
-- which is exactly the bug this project already hit on `referrals`.

-- =============================================================
-- Row Level Security
-- =============================================================
-- =============================================================
-- 10. SMS notifications (see scripts/migrations/2026-08-sms-notifications.sql
--     for the full rationale and the two rate-gate functions)
-- =============================================================
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

-- No FK to users, and rows are never deleted: a STOP belongs to the
-- NUMBER, must survive the account being deleted, and is the proof
-- that the opt-out was honoured.
CREATE TABLE IF NOT EXISTS sms_opt_outs (
  phone_e164   TEXT PRIMARY KEY,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason       TEXT        NOT NULL,
  raw_keyword  TEXT,
  resumed_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sms_messages (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT,
  to_e164    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  twilio_sid TEXT,
  status     TEXT NOT NULL,
  error_code INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE lawyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by API routes)
CREATE POLICY "Service role full access on users"
  ON users FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on clinics"
  ON clinics FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on lawyers"
  ON lawyers FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on referrals"
  ON referrals FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on contacts"
  ON contacts FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on newsletter_subscribers"
  ON newsletter_subscribers FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on referrer_referrals"
  ON referrer_referrals FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on settings"
  ON settings FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on activity_logs"
  ON activity_logs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on phone_verifications"
  ON phone_verifications FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on sms_opt_outs"
  ON sms_opt_outs FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on sms_messages"
  ON sms_messages FOR ALL
  USING (auth.role() = 'service_role');

-- Anon can INSERT into contacts (public contact form)
CREATE POLICY "Anon insert contacts"
  ON contacts FOR INSERT
  WITH CHECK (true);

-- Anon can INSERT into newsletter_subscribers (public newsletter)
CREATE POLICY "Anon insert newsletter"
  ON newsletter_subscribers FOR INSERT
  WITH CHECK (true);

-- =============================================================
-- Migration: Add 'admin' role to users table
-- Run this on existing databases to update the role constraint:
-- =============================================================
-- ALTER TABLE users DROP CONSTRAINT users_role_check;
-- ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('lawyer', 'clinic', 'admin'));

-- =============================================================
-- Migration: Add 'state' column to users table
-- Run this on existing databases:
-- =============================================================
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS state TEXT;
