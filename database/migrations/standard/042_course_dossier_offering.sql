-- Migration 042: Replace course_dossier.(course_id + term TEXT) with course_offering_id FK.
-- course_dossier previously had course_id (migration 039) and term TEXT (migration 005).
-- Both are replaced by a single course_offering_id FK so a dossier record maps
-- directly to a specific course+term pairing.

SET search_path TO :schema_name, public;

-- Drop old unique constraint (may be named differently depending on migration history)
ALTER TABLE :schema_name.course_dossier DROP CONSTRAINT IF EXISTS uq_course_dossier_term;
ALTER TABLE :schema_name.course_dossier DROP CONSTRAINT IF EXISTS course_dossier_professor_id_course_id_term_key;

-- Drop old columns
ALTER TABLE :schema_name.course_dossier DROP COLUMN IF EXISTS term;
ALTER TABLE :schema_name.course_dossier DROP COLUMN IF EXISTS course_id;

-- Add new FK
ALTER TABLE :schema_name.course_dossier
  ADD COLUMN IF NOT EXISTS course_offering_id UUID
    REFERENCES :schema_name.course_offering(id) ON DELETE CASCADE;

-- Backfill: no rows exist in production, so just enforce NOT NULL
ALTER TABLE :schema_name.course_dossier
  ALTER COLUMN course_offering_id SET NOT NULL;

-- New unique constraint
ALTER TABLE :schema_name.course_dossier
  ADD CONSTRAINT uq_course_dossier_offering
    UNIQUE (professor_id, course_offering_id);

DO $$ BEGIN
  RAISE NOTICE 'Migration 042 complete — course_dossier now uses course_offering_id';
END $$;
