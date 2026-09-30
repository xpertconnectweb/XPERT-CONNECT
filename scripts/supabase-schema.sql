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
  -- Structured address. Added by migrations/2026-08-structured-addresses.sql.
  -- Nullable with no defaults on purpose: NULL means the backfill has not
  -- reached this row, and that is what makes decorateClinic fall back to
  -- parseAddress — which in turn is what lets the migration and the deploy
  -- happen at different times.
  street            TEXT,
  city              TEXT,
  state             TEXT,
  zip_code          TEXT,
  -- place_provider travels with place_id: an id is meaningless to a provider
  -- that did not issue it, and the failure is silent rather than loud.
  place_id          TEXT,
  place_provider    TEXT,
  geocode_precision TEXT,
  geocoded_at       TIMESTAMPTZ,
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
  -- See the clinics table above. `zip_code` predates this and is authoritative
  -- here; the rest arrived with migrations/2026-08-structured-addresses.sql.
  street            TEXT,
  city              TEXT,
  state             TEXT,
  place_id          TEXT,
  place_provider    TEXT,
  geocode_precision TEXT,
  geocoded_at       TIMESTAMPTZ,
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
  -- Named explicitly: the original inline anonymous CHECK is why
  -- 2026-11-referral-status-lifecycle.sql had to guess Postgres's auto-name.
  status              TEXT NOT NULL CONSTRAINT referrals_status_check
                        CHECK (status IN ('received', 'scheduled', 'mri', 'specialist', 'final_mmi'))
                        DEFAULT 'received',
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
  -- Named explicitly: the original inline anonymous CHECKs are why
  -- 2026-12-referrer-referral-status-and-drop.sql has to rediscover them.
  status              TEXT NOT NULL DEFAULT 'received'
                      CONSTRAINT referrer_referrals_status_check
                      CHECK (status IN ('received', 'scheduled', 'mri', 'specialist', 'final_mmi')),
  assigned_clinic_id  TEXT REFERENCES clinics(id) ON DELETE SET NULL,
  assigned_clinic_name TEXT,
  assigned_lawyer_id  TEXT REFERENCES lawyers(id) ON DELETE SET NULL,
  assigned_lawyer_name TEXT,
  case_confirmed      TEXT NOT NULL DEFAULT 'pending'
                      CONSTRAINT referrer_referrals_case_confirmed_check
                      CHECK (case_confirmed IN ('pending', 'confirmed', 'drop')),
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

-- No anon policies. The public forms (contact, newsletter, directory
-- inquiry) insert through the service role; see
-- scripts/migrations/2027-02-security-hardening.sql, which dropped the
-- "Anon insert contacts/newsletter" policies that used to be here.

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

-- =============================================================
-- Security hardening — copied verbatim from
-- scripts/migrations/2027-02-security-hardening.sql (idempotent).
-- =============================================================
-- =============================================================
-- 2027-02 — Security hardening
-- =============================================================
--
-- WHY: Supabase Advisor flagged `settings`, `referrer_referrals` and
-- `activity_logs` as "RLS Disabled in Public" (CRITICAL). It was real:
-- on 2026-09-30, with nothing but the anon key — which every browser
-- has, it is NEXT_PUBLIC_SUPABASE_ANON_KEY — `/rest/v1/referrer_referrals`
-- answered with its rows and `/rest/v1/activity_logs` with 83.
--
-- Those three tables were created by hand in the dashboard. The RLS
-- lines for them were added to scripts/supabase-schema.sql later, and
-- that file cannot be re-run on a live database, so they never ran.
--
-- SAFE TO RUN BEFORE ANY DEPLOY. The app reads and writes exclusively
-- through the service-role client (`supabaseAdmin`), which bypasses RLS
-- and keeps every grant below. Nothing in the app uses the anon key.
--
-- Idempotent: every statement can run twice.
-- Run in the Supabase SQL Editor (it runs as `postgres`).
-- =============================================================


-- -------------------------------------------------------------
-- 1. RLS on the three hand-made tables.
--    No policies on purpose: deny-all for anon/authenticated. The
--    service role bypasses RLS, so the app is unaffected.
-- -------------------------------------------------------------
ALTER TABLE IF EXISTS public.settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referrer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activity_logs      ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- 2. Drop the two "anyone may insert" policies.
--    They have no TO clause, so they applied to anon: anybody holding
--    the public key could write rows straight into these tables,
--    skipping the forms' validation. /api/contact, /api/newsletter and
--    the directory's inquiry route all insert with the service role.
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "Anon insert contacts"   ON public.contacts;
DROP POLICY IF EXISTS "Anon insert newsletter" ON public.newsletter_subscribers;


-- -------------------------------------------------------------
-- 3. SECURITY DEFINER functions: callable by the service role only.
--    Postgres grants EXECUTE to PUBLIC by default, so today anyone can
--    POST /rest/v1/rpc/claim_otp_send with another user's id and
--    overwrite their pending code or lock them out, or burn a user's
--    geocoding quota. The geo functions already do this (2026-09/10).
-- -------------------------------------------------------------
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.claim_otp_send(text, text, text, timestamptz)',
    'public.claim_otp_attempt(text, text)',
    'public.claim_geocode_call(text, text, integer, integer)'
  ]
  LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END$$;


-- -------------------------------------------------------------
-- 4. Pin search_path on the two functions that float.
--    (Advisor: "Function Search Path Mutable".)
-- -------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;
  END IF;
  IF to_regprocedure('public.geo_street_search(text, text, text, text, integer)') IS NOT NULL THEN
    ALTER FUNCTION public.geo_street_search(text, text, text, text, integer)
      SET search_path = public, pg_temp;
  END IF;
END$$;


-- -------------------------------------------------------------
-- 5. Defense in depth: the Data API roles get nothing in `public`.
--
--    RLS is a per-table switch, and this incident is what happens when
--    one table misses it. Revoking the grants means a table created by
--    hand tomorrow is still unreachable through /rest/v1 even if nobody
--    remembers RLS — two locks instead of one.
--
--    Deliberately NOT revoking functions FROM PUBLIC in bulk: pg_trgm's
--    functions live in `public` and the service role reaches them
--    through that PUBLIC grant (geo_street_search needs similarity()).
-- -------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;


-- -------------------------------------------------------------
-- 6. Shared rate limiting for the public forms and the login.
--
--    Fixed windows, one row per (bucket, key). Same shape as
--    claim_otp_send: the read-modify-write happens inside one
--    INSERT ... ON CONFLICT, so two concurrent Vercel instances cannot
--    both read the old count. Keys arrive already hashed (IPs are
--    never stored raw) — see src/lib/security/rate-limit.ts.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket       TEXT        NOT NULL,
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count        INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx
  ON public.rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.claim_rate_limit(
  p_bucket         TEXT,
  p_key            TEXT,
  p_limit          INT,
  p_window_seconds INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window INTERVAL := make_interval(secs => p_window_seconds);
  v_count  INT;
BEGIN
  INSERT INTO rate_limits AS r (bucket, key, window_start, count)
  VALUES (p_bucket, p_key, now(), 1)
  ON CONFLICT (bucket, key) DO UPDATE SET
    window_start = CASE WHEN r.window_start <= now() - v_window THEN now() ELSE r.window_start END,
    count        = CASE WHEN r.window_start <= now() - v_window THEN 1     ELSE r.count + 1   END
  RETURNING count INTO v_count;

  -- Opportunistic cleanup, ~1 call in 100. No cron needed; the longest
  -- window in use is one day.
  IF random() < 0.01 THEN
    DELETE FROM rate_limits WHERE window_start < now() - INTERVAL '2 days';
  END IF;

  RETURN v_count <= p_limit;
END$$;

REVOKE ALL ON FUNCTION public.claim_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rate_limit(text, text, integer, integer)
  TO service_role;

-- PostgREST caches the schema; make it notice the grant changes now.
NOTIFY pgrst, 'reload schema';


-- -------------------------------------------------------------
-- Verify (optional). Each of these should return zero rows.
-- -------------------------------------------------------------
-- Tables in public without RLS:
--   SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
-- Table grants still held by the Data API roles:
--   SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
