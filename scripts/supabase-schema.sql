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
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
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
