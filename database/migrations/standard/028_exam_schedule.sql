-- Migration 028: Admin exam scheduling with auto-approval
-- Allows admins to schedule exams and auto-approve student requests

SET search_path TO :schema_name, public;

CREATE TABLE IF NOT EXISTS :schema_name.exam_schedule (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code           TEXT        NOT NULL,
  exam_date             DATE        NOT NULL,
  exam_time             TIME,
  exam_type             TEXT        NOT NULL DEFAULT 'midterm'
                        CHECK (exam_type IN ('midterm','final','quiz','assignment','other')),
  base_duration_mins    INTEGER,
  auto_approve_enabled  BOOLEAN     NOT NULL DEFAULT true,
  created_by            UUID        NOT NULL REFERENCES :schema_name."user"(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(course_code, exam_date, exam_time)
);

CREATE INDEX idx_exam_schedule_course_date
  ON :schema_name.exam_schedule(course_code, exam_date);

COMMENT ON TABLE :schema_name.exam_schedule IS
  'Admin-scheduled exams for auto-approval of student requests. When a student requests an exam matching course+date, it auto-approves.';

COMMENT ON COLUMN :schema_name.exam_schedule.auto_approve_enabled IS
  'If true, matching student requests are auto-approved without prof/admin review.';

DO $$
BEGIN
  RAISE NOTICE 'Migration 028 complete — exam_schedule table created';
END $$;
