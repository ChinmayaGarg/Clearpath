-- Migration 011: Exam booking requests + exam_upload additions

SET search_path TO :schema_name, public;

-- Student's self-scheduled exam request
CREATE TABLE IF NOT EXISTS :schema_name.exam_booking_request (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id      UUID        NOT NULL REFERENCES :schema_name.student_profile(id) ON DELETE CASCADE,
  course_code             TEXT        NOT NULL,
  exam_date               DATE        NOT NULL,
  exam_time               TIME,
  exam_type               TEXT        NOT NULL DEFAULT 'midterm'
                            CHECK (exam_type IN ('midterm','final','quiz','assignment','other')),
  special_materials_note  TEXT,
  status                  TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','confirmed','cancelled')),
  confirmed_by            UUID        REFERENCES :schema_name."user"(id) ON DELETE SET NULL,
  confirmed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Additional fields on exam_upload for professor upload form
ALTER TABLE :schema_name.exam_upload
  ADD COLUMN IF NOT EXISTS base_duration_mins  INTEGER,
  ADD COLUMN IF NOT EXISTS exam_description    TEXT;

COMMENT ON COLUMN :schema_name.exam_upload.base_duration_mins IS
  'Test length for students without time extensions (in minutes).';
COMMENT ON COLUMN :schema_name.exam_upload.exam_description IS
  'Optional description of the exam (e.g. "Chapters 3-5, open book").';

DO $$
BEGIN
  RAISE NOTICE 'Migration 011 complete — exam_booking_request table created, exam_upload extended';
END $$;
