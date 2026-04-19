-- Migration 013: Manual course code assignments for students

SET search_path TO :schema_name, public;

CREATE TABLE IF NOT EXISTS :schema_name.student_course (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id UUID        NOT NULL
                       REFERENCES :schema_name.student_profile(id) ON DELETE CASCADE,
  course_code        TEXT        NOT NULL,
  added_by           UUID        REFERENCES :schema_name."user"(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_course UNIQUE (student_profile_id, course_code)
);

COMMENT ON TABLE :schema_name.student_course IS
  'Manually-assigned course codes per student, added by admins. Used when no SARS appointment exists yet.
   The /api/student/courses endpoint UNIONs these with appointment-derived courses.';

CREATE INDEX IF NOT EXISTS idx_student_course_student
  ON :schema_name.student_course (student_profile_id);

DO $$
BEGIN
  RAISE NOTICE 'Migration 013 complete — student_course table created';
END $$;
