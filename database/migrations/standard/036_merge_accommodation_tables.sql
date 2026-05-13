-- Migration 036: Merge accommodation_grant into student_accommodation
--
-- Adds source ('manual'|'granted'), is_active, expires_at, granted_by to
-- student_accommodation. Drops accommodation_grant.
--
-- 'manual'  = counsellor added directly via Students tab (has term, has counsellor_profile_id)
-- 'granted' = approved via registration workflow (has term, has granted_by)
--
-- Both sources require a term. The existing UNIQUE(student_profile_id, accommodation_code_id, term)
-- constraint covers uniqueness for all rows.

SET search_path TO :schema_name, public;

-- 1. Extend student_accommodation with new columns
ALTER TABLE :schema_name.student_accommodation
  ADD COLUMN IF NOT EXISTS source     TEXT        NOT NULL DEFAULT 'manual'
      CHECK (source IN ('manual', 'granted')),
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS granted_by UUID        REFERENCES :schema_name."user"(id) ON DELETE SET NULL;

-- 2. Drop the now-superseded accommodation_grant table.
--    Existing grants are not migrated automatically because they have no term;
--    a counsellor can re-grant them via the registration approval flow with a term.
DROP TABLE IF EXISTS :schema_name.accommodation_grant;

DO $$
BEGIN
  RAISE NOTICE 'Migration 036 complete — accommodation_grant dropped, student_accommodation extended with source/is_active/expires_at/granted_by';
END $$;
