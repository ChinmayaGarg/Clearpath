-- Migration 036: Merge accommodation_grant into student_accommodation
--
-- Adds source ('manual'|'granted'), is_active, expires_at, granted_by to
-- student_accommodation. Migrates all accommodation_grant rows in as
-- source='granted'. Drops accommodation_grant.
--
-- 'manual'  = counsellor added directly via Students tab (has term, has counsellor_profile_id)
-- 'granted' = approved via registration workflow (term is NULL, has granted_by)

SET search_path TO :schema_name, public;

-- 1. Extend student_accommodation with new columns
ALTER TABLE :schema_name.student_accommodation
  ADD COLUMN IF NOT EXISTS source     TEXT        NOT NULL DEFAULT 'manual'
      CHECK (source IN ('manual', 'granted')),
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS granted_by UUID        REFERENCES :schema_name."user"(id) ON DELETE SET NULL;

-- 2. Make term nullable (granted rows carry no term)
ALTER TABLE :schema_name.student_accommodation
  ALTER COLUMN term DROP NOT NULL;

-- 3. Migrate existing accommodation_grant rows
INSERT INTO :schema_name.student_accommodation
  (id, student_profile_id, accommodation_code_id, source, term,
   notes, is_active, expires_at, granted_by, created_at, updated_at)
SELECT
  id, student_profile_id, accommodation_code_id, 'granted', NULL,
  notes, is_active, expires_at, approved_by, created_at, created_at
FROM :schema_name.accommodation_grant
ON CONFLICT DO NOTHING;

-- 4. Partial unique index: one active grant per student+code
--    (NULLs don't satisfy the existing term-based UNIQUE, so we need this separately)
CREATE UNIQUE INDEX IF NOT EXISTS student_accommodation_granted_uq
  ON :schema_name.student_accommodation (student_profile_id, accommodation_code_id)
  WHERE source = 'granted';

-- 5. Drop the now-redundant accommodation_grant table
DROP TABLE IF EXISTS :schema_name.accommodation_grant;

DO $$
BEGIN
  RAISE NOTICE 'Migration 036 complete — accommodation_grant merged into student_accommodation';
END $$;
