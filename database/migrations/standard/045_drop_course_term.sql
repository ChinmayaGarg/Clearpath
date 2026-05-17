-- Migration 045: Drop the nullable course.term TEXT column.
-- Term membership is now tracked via course_offering (course + term FK pair),
-- so this redundant metadata field is no longer needed.

SET search_path TO :schema_name, public;

ALTER TABLE :schema_name.course DROP COLUMN IF EXISTS term;

DO $$ BEGIN
  RAISE NOTICE 'Migration 045 complete — course.term column removed';
END $$;
