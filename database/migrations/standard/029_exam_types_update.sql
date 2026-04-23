-- Migration 029: Update exam_type values to match professor portal
-- Adds support for: quiz_1, quiz_2, quiz_3, quiz_4, test_1, test_2, test_3

SET search_path TO :schema_name, public;

-- Update exam_booking_request constraint
ALTER TABLE :schema_name.exam_booking_request
  DROP CONSTRAINT IF EXISTS exam_booking_request_exam_type_check;

ALTER TABLE :schema_name.exam_booking_request
  ADD CONSTRAINT exam_booking_request_exam_type_check
  CHECK (exam_type IN ('midterm','final','quiz_1','quiz_2','quiz_3','quiz_4','test_1','test_2','test_3','assignment'));

-- Update exam_schedule constraint
ALTER TABLE :schema_name.exam_schedule
  DROP CONSTRAINT IF EXISTS exam_schedule_exam_type_check;

ALTER TABLE :schema_name.exam_schedule
  ADD CONSTRAINT exam_schedule_exam_type_check
  CHECK (exam_type IN ('midterm','final','quiz_1','quiz_2','quiz_3','quiz_4','test_1','test_2','test_3','assignment'));

DO $$
BEGIN
  RAISE NOTICE 'Migration 029 complete — exam_type values updated to include quiz_1-4, test_1-3';
END $$;
