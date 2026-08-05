-- =============================================================
-- Migration: Add the 'directory' role + drop the CSV header row
-- Date: 2026-08-05
--
-- Why (1): the legal directory portal introduces a sixth user role,
-- `directory`, whose whole purpose is browsing the lawyer network by
-- practice area. `users.role` is guarded by a CHECK constraint that
-- only allows the original five roles, so a directory account cannot
-- be created until the constraint is widened.
--
-- Why (2): `lawyers` row `l-060` is the header line of the source CSV
-- imported as data:
--     name           = "Abogado/Firma"
--     phone          = "Teléfono"
--     address        = "Dirección, FL ZIP Code"
--     region         = "Región"
--     county         = "Condado"
--     practice_areas = ["Especialidad"]
-- It is the only row with junk in those columns, and it carries real
-- West Palm Beach coordinates (26.7083444, -80.1089041) — so it
-- renders as a live map marker named "Abogado/Firma" the moment
-- attorney pins are switched on. `data/lawyers.json` loses the same
-- record in this commit so `restore-lawyers.ts` / `import-lawyers.js`
-- cannot resurrect it.
--
-- Idempotent: re-running this migration is safe.
-- =============================================================

-- 1. Allow the 'directory' role in users.role
DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('lawyer', 'clinic', 'admin', 'partner', 'referrer', 'directory'));
END$$;

-- 2. Delete the CSV header row imported as a firm.
-- Guarded on every FK that points at lawyers(id) so the statement can
-- never remove a firm that is actually in use. `referrer_referrals`
-- is checked only when it exists — it was created out-of-band and a
-- freshly provisioned database may not have it yet.
DO $$
BEGIN
  IF to_regclass('public.referrer_referrals') IS NOT NULL THEN
    DELETE FROM lawyers l
    WHERE l.id = 'l-060'
      AND NOT EXISTS (SELECT 1 FROM users u              WHERE u.lawyer_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM referrals r          WHERE r.lawyer_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM referrer_referrals rr WHERE rr.assigned_lawyer_id = l.id);
  ELSE
    DELETE FROM lawyers l
    WHERE l.id = 'l-060'
      AND NOT EXISTS (SELECT 1 FROM users u     WHERE u.lawyer_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM referrals r WHERE r.lawyer_id = l.id);
  END IF;
END$$;

-- 3. Verification (run manually after applying):
--
-- Should return 6 roles including 'directory':
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'users_role_check';
--
-- Should return 0 rows:
--   SELECT id, name FROM lawyers WHERE id = 'l-060';
--
-- Should return only the 8 canonical practice areas:
--   SELECT DISTINCT jsonb_array_elements_text(practice_areas) AS area
--   FROM lawyers ORDER BY area;
