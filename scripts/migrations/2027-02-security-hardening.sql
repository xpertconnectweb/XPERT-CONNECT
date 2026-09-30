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
