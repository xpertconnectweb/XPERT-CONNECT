-- =============================================================
-- Migration: structured addresses, geocode cache, geocode quotas
-- Date: 2026-08-25
--
-- Why: three separate problems that all trace back to the same
-- thing — the app has never had an address, only a string.
--
--   1. `clinics` stores `address TEXT` and nothing else. City,
--      state and ZIP are re-derived by regex on EVERY read, in
--      decorateClinic (src/lib/data.ts). The state filter is
--      `ILIKE '%FL%'` — a deliberately loose superset with a JS
--      pass behind it, because there is no column to index.
--   2. Coordinates are typed in BY HAND in the admin form, and
--      nothing on the server rejects (0, 0). That is where the
--      rows sitting in the Gulf of Guinea came from, and why
--      hasRealCoordinates() has to filter them out at index time.
--   3. Address lookups are cached in a per-lambda Map, so on
--      Vercel a popular address is re-fetched once per instance,
--      per deploy, forever — and nothing meters a user who holds
--      down backspace.
--
-- Everything here is ADDITIVE. Nothing is backfilled by this
-- file: `scripts/backfill-structured-addresses.ts` fills the new
-- columns from the text already stored, and
-- `scripts/backfill-geocode.ts` re-resolves coordinates once a
-- real geocoding provider is configured. Until a row is filled,
-- its new columns are NULL and `decorateClinic` falls back to
-- parseAddress exactly as before. That NULL is the entire
-- mechanism of the dual-read phase — do not give these columns
-- defaults, and do not make them NOT NULL.
--
-- Run this in the Supabase SQL Editor on the prod DB.
-- Idempotent (safe to re-run).
--
-- ############################################################
-- #  APPLY THIS *BEFORE* DEPLOYING THE CODE. NOT AFTER.      #
-- #                                                          #
-- #  The same commit widens CLINIC_COLUMNS and LAWYER_COLUMNS #
-- #  in src/lib/data.ts to select the new columns. PostgREST  #
-- #  rejects a select naming a column that does not exist, so #
-- #  on a database without this migration EVERY clinic and    #
-- #  lawyer read fails — the map, the directory, the admin    #
-- #  tables and the referral form all at once.                #
-- #                                                          #
-- #  This migration is purely additive, so applying it while  #
-- #  the OLD code is live is completely safe. Do that first.  #
-- ############################################################
-- =============================================================

-- -------------------------------------------------------------
-- 1. Structured address columns
-- -------------------------------------------------------------
-- `county` already exists on BOTH tables and `zip_code` already
-- exists on `lawyers` — that asymmetry is why each ALTER lists a
-- different set. IF NOT EXISTS keeps a re-run harmless either way.
--
-- `place_provider` sits beside `place_id` because a place id is
-- meaningless to a provider that did not issue it. Without the
-- pair, switching provider would silently poison every row that
-- was geocoded under the old one: a Google place id handed to
-- Mapbox does not error, it simply is not found, and the row
-- quietly stops refreshing.

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS street            TEXT,
  ADD COLUMN IF NOT EXISTS city              TEXT,
  ADD COLUMN IF NOT EXISTS state             TEXT,
  ADD COLUMN IF NOT EXISTS zip_code          TEXT,
  ADD COLUMN IF NOT EXISTS place_id          TEXT,
  ADD COLUMN IF NOT EXISTS place_provider    TEXT,
  ADD COLUMN IF NOT EXISTS geocode_precision TEXT,
  ADD COLUMN IF NOT EXISTS geocoded_at       TIMESTAMPTZ;

ALTER TABLE lawyers
  ADD COLUMN IF NOT EXISTS street            TEXT,
  ADD COLUMN IF NOT EXISTS city              TEXT,
  ADD COLUMN IF NOT EXISTS state             TEXT,
  ADD COLUMN IF NOT EXISTS place_id          TEXT,
  ADD COLUMN IF NOT EXISTS place_provider    TEXT,
  ADD COLUMN IF NOT EXISTS geocode_precision TEXT,
  ADD COLUMN IF NOT EXISTS geocoded_at       TIMESTAMPTZ;

-- The vocabulary is defined once, in src/types/geocode.ts. A CHECK
-- here is what stops a backfill run with a typo from writing a
-- value the UI will silently treat as "unknown" forever.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinics_geocode_precision_check') THEN
    ALTER TABLE clinics ADD CONSTRAINT clinics_geocode_precision_check
      CHECK (geocode_precision IS NULL OR geocode_precision IN
        ('rooftop','parcel','interpolated','street','city','zip','region','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lawyers_geocode_precision_check') THEN
    ALTER TABLE lawyers ADD CONSTRAINT lawyers_geocode_precision_check
      CHECK (geocode_precision IS NULL OR geocode_precision IN
        ('rooftop','parcel','interpolated','street','city','zip','region','unknown'));
  END IF;
END$$;

-- Partial indexes: during the dual-read phase most rows are NULL,
-- and indexing NULLs would be paying for the half of the table the
-- index cannot help with anyway.
CREATE INDEX IF NOT EXISTS idx_clinics_state ON clinics (state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lawyers_state ON lawyers (state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinics_zip   ON clinics (zip_code) WHERE zip_code IS NOT NULL;

-- -------------------------------------------------------------
-- 2. Shared geocode cache
-- -------------------------------------------------------------
-- `expires_at` is a LICENCE term, not a performance knob.
--   Google: place ids may be kept indefinitely; anything else,
--           coordinates included, must go within 30 days.
--   Mapbox: temporary results are cache-only; storing them as
--           application data needs the permanent endpoint.
--   Nominatim: ODbL, storage permitted with attribution.
-- src/lib/geocoding/constants.ts holds the per-provider ceiling
-- and a unit test asserts a Google payload can never be handed a
-- longer one. Raising either without reading those terms is a
-- contract breach that will never show up as a bug.

CREATE TABLE IF NOT EXISTS geocode_cache (
  cache_key   TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('autocomplete','details','reverse')),
  payload     JSONB NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  hits        INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_hit_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_geocode_cache_expiry ON geocode_cache (expires_at);

ALTER TABLE geocode_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'geocode_cache' AND policyname = 'Service role full access on geocode_cache'
  ) THEN
    CREATE POLICY "Service role full access on geocode_cache"
      ON geocode_cache FOR ALL USING (auth.role() = 'service_role');
  END IF;
END$$;

-- -------------------------------------------------------------
-- 3. Per-user geocoding quota
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geocode_usage (
  user_id      TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('autocomplete','details','reverse')),
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  calls        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, kind)
);

ALTER TABLE geocode_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'geocode_usage' AND policyname = 'Service role full access on geocode_usage'
  ) THEN
    CREATE POLICY "Service role full access on geocode_usage"
      ON geocode_usage FOR ALL USING (auth.role() = 'service_role');
  END IF;
END$$;

-- Atomic, for the same reason claim_otp_send is: the
-- read-modify-write cannot be expressed through the PostgREST
-- query builder, and doing it in JS races — two concurrent
-- requests both read the old count and both proceed, which is
-- exactly the runaway-render case the quota exists to catch.
--
-- Called ONLY on a provider miss. A cache hit costs nothing, so
-- charging quota for one would let a popular query lock a user
-- out for no reason: the limit is on spend, not on searching.
CREATE OR REPLACE FUNCTION claim_geocode_call(
  p_user_id        TEXT,
  p_kind           TEXT,
  p_max            INT,
  p_window_seconds INT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row geocode_usage%ROWTYPE;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_row
    FROM geocode_usage
   WHERE user_id = p_user_id AND kind = p_kind
     FOR UPDATE;

  IF FOUND AND v_row.window_start > v_now - make_interval(secs => p_window_seconds) THEN
    IF v_row.calls >= p_max THEN
      RETURN 'window_cap';
    END IF;
  END IF;

  INSERT INTO geocode_usage AS gu (user_id, kind, window_start, calls)
  VALUES (p_user_id, p_kind, v_now, 1)
  ON CONFLICT (user_id, kind) DO UPDATE SET
    calls        = CASE
                     WHEN gu.window_start <= v_now - make_interval(secs => p_window_seconds) THEN 1
                     ELSE gu.calls + 1
                   END,
    window_start = CASE
                     WHEN gu.window_start <= v_now - make_interval(secs => p_window_seconds) THEN v_now
                     ELSE gu.window_start
                   END;

  RETURN 'ok';
END$$;

-- -------------------------------------------------------------
-- 4. Verification
-- -------------------------------------------------------------
-- Run AFTER scripts/backfill-structured-addresses.ts --apply.
-- The counts must match: the old ILIKE '%FL%' filter is a loose
-- superset with a JS pass behind it, so if the indexed `state`
-- column returns FEWER rows there are addresses whose state is
-- not being parsed — and those clinics would vanish from the map.
--
--   SELECT count(*) FROM clinics WHERE address ILIKE '%FL%';
--   SELECT count(*) FROM clinics WHERE state = 'FL';
--
-- What still needs a human:
--   SELECT id, name, address FROM clinics
--    WHERE geocode_precision = 'unknown' OR (lat = 0 AND lng = 0);
