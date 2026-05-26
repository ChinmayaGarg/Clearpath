-- Migration 051: Add course_offering_id to exam_booking_request
-- Links each booking to the specific course-in-a-term it belongs to.
-- Nullable + ON DELETE SET NULL for full backward compatibility.

SET search_path TO :schema_name, public;

ALTER TABLE :schema_name.exam_booking_request
  ADD COLUMN IF NOT EXISTS course_offering_id UUID
    REFERENCES :schema_name.course_offering(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ebr_course_offering
  ON :schema_name.exam_booking_request(course_offering_id);

-- Backfill: resolve via student_course → course_offering
-- (works for all existing rows where the student is enrolled)
UPDATE :schema_name.exam_booking_request ebr
SET course_offering_id = sc.course_offering_id
FROM :schema_name.student_course sc
JOIN :schema_name.course_offering co ON co.id = sc.course_offering_id
WHERE sc.student_profile_id = ebr.student_profile_id
  AND co.course_id            = ebr.course_id
  AND ebr.course_offering_id IS NULL;

DO $$
BEGIN
  RAISE NOTICE 'Migration 051 complete — course_offering_id added to exam_booking_request';
END $$;
