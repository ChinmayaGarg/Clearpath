-- Migration 050: Add 'other' to exam_type check constraints
-- exam_type_label enum already has 'other' from migration 004

SET search_path TO :schema_name, public;

ALTER TABLE :schema_name.exam_booking_request
  DROP CONSTRAINT IF EXISTS exam_booking_request_exam_type_check;
ALTER TABLE :schema_name.exam_booking_request
  ADD CONSTRAINT exam_booking_request_exam_type_check
  CHECK (exam_type IN ('midterm','final','quiz_1','quiz_2','quiz_3','quiz_4','test_1','test_2','test_3','assignment','other'));

ALTER TABLE :schema_name.exam_schedule
  DROP CONSTRAINT IF EXISTS exam_schedule_exam_type_check;
ALTER TABLE :schema_name.exam_schedule
  ADD CONSTRAINT exam_schedule_exam_type_check
  CHECK (exam_type IN ('midterm','final','quiz_1','quiz_2','quiz_3','quiz_4','test_1','test_2','test_3','assignment','other'));

DO $$
BEGIN
  RAISE NOTICE 'Migration 050 complete — other added to exam_type constraints';
END $$;
