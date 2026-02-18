-- =============================================================
-- XPERT-CONNECT: Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables.
-- =============================================================

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  username    TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('lawyer', 'clinic', 'admin')),
  clinic_id   TEXT,
  firm_name   TEXT,
  email       TEXT NOT NULL,
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

-- 3. Referrals table (FKs to users and clinics)
CREATE TABLE IF NOT EXISTS referrals (
  id             TEXT PRIMARY KEY,
  lawyer_id      TEXT NOT NULL REFERENCES users(id),
  lawyer_name    TEXT NOT NULL,
  lawyer_firm    TEXT NOT NULL DEFAULT '',
  clinic_id      TEXT NOT NULL REFERENCES clinics(id),
  clinic_name    TEXT NOT NULL,
  patient_name   TEXT NOT NULL,
  patient_phone  TEXT NOT NULL,
  case_type      TEXT NOT NULL,
  coverage       TEXT NOT NULL DEFAULT '',
  pip            TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL CHECK (status IN ('received', 'in_process', 'attended')) DEFAULT 'received',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

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

CREATE TRIGGER trg_referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- Row Level Security
-- =============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by API routes)
CREATE POLICY "Service role full access on users"
  ON users FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on clinics"
  ON clinics FOR ALL
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
