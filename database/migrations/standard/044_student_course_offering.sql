-- Migration 044: Replace student_course.course_id with course_offering_id FK.
-- This adds term scope to student enrollments.

SET search_path TO :schema_name, public;

-- Drop old unique constraint
ALTER TABLE :schema_name.student_course
  DROP CONSTRAINT IF EXISTS student_course_student_profile_id_course_id_key;
ALTER TABLE :schema_name.student_course
  DROP CONSTRAINT IF EXISTS uq_student_course_offering;

-- Drop old column
ALTER TABLE :schema_name.student_course DROP COLUMN IF EXISTS course_id;

-- Add new FK
ALTER TABLE :schema_name.student_course
  ADD COLUMN IF NOT EXISTS course_offering_id UUID
    REFERENCES :schema_name.course_offering(id) ON DELETE CASCADE;

ALTER TABLE :schema_name.student_course
  ALTER COLUMN course_offering_id SET NOT NULL;

-- New unique constraint
ALTER TABLE :schema_name.student_course
  ADD CONSTRAINT uq_student_course_offering
    UNIQUE (student_profile_id, course_offering_id);

DO $$ BEGIN
  RAISE NOTICE 'Migration 044 complete — student_course now uses course_offering_id';
END $$;
