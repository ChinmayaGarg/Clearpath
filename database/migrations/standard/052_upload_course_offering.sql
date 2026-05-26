-- Migration 052: Add course_offering_id to exam_upload
-- Links each upload to the specific course-in-a-term it was submitted for.
-- Nullable + ON DELETE SET NULL for full backward compatibility.

SET search_path TO :schema_name, public;

ALTER TABLE :schema_name.exam_upload
  ADD COLUMN IF NOT EXISTS course_offering_id UUID
    REFERENCES :schema_name.course_offering(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exam_upload_course_offering
  ON :schema_name.exam_upload(course_offering_id);

-- Backfill: for each upload, pick the most recent offering for that course
UPDATE :schema_name.exam_upload eu
SET course_offering_id = (
  SELECT co.id
  FROM :schema_name.course_offering co
  JOIN :schema_name.term t ON t.id = co.term_id
  WHERE co.course_id = eu.course_id
  ORDER BY t.start_date DESC NULLS LAST
  LIMIT 1
)
WHERE eu.course_offering_id IS NULL;

DO $$
BEGIN
  RAISE NOTICE 'Migration 052 complete — course_offering_id added to exam_upload';
END $$;
