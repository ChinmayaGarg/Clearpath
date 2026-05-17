-- Migration 043: Replace student_accommodation.term TEXT with term_id UUID FK.

SET search_path TO :schema_name, public;

-- Drop old unique constraint
ALTER TABLE :schema_name.student_accommodation
  DROP CONSTRAINT IF EXISTS student_accommodation_student_profile_id_accommodation_code_id_key;
ALTER TABLE :schema_name.student_accommodation
  DROP CONSTRAINT IF EXISTS uq_student_accommodation_term;

-- Drop old text column
ALTER TABLE :schema_name.student_accommodation DROP COLUMN IF EXISTS term;

-- Add FK column
ALTER TABLE :schema_name.student_accommodation
  ADD COLUMN IF NOT EXISTS term_id UUID
    REFERENCES :schema_name.term(id) ON DELETE RESTRICT;

ALTER TABLE :schema_name.student_accommodation
  ALTER COLUMN term_id SET NOT NULL;

-- New unique constraint
ALTER TABLE :schema_name.student_accommodation
  ADD CONSTRAINT uq_student_accommodation_term
    UNIQUE (student_profile_id, accommodation_code_id, term_id);

DO $$ BEGIN
  RAISE NOTICE 'Migration 043 complete — student_accommodation uses term_id FK';
END $$;
