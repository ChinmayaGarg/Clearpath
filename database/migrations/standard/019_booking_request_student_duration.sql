SET search_path TO :schema_name, public;

ALTER TABLE :schema_name.exam_booking_request
  ADD COLUMN IF NOT EXISTS student_duration_mins INTEGER;

DO $$ BEGIN
  RAISE NOTICE 'Migration 019 complete — student_duration_mins added to exam_booking_request';
END $$;
