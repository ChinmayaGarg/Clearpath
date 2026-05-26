-- Migration 053: Track how a booking request was auto-approved
-- 'upload'   = professor submitted an exam upload
-- 'schedule' = admin created an exam schedule
-- NULL       = manually confirmed by an admin user

SET search_path TO :schema_name, public;

ALTER TABLE :schema_name.exam_booking_request
  ADD COLUMN IF NOT EXISTS auto_approve_source TEXT
  CHECK (auto_approve_source IN ('upload', 'schedule'));

DO $$
BEGIN
  RAISE NOTICE 'Migration 053 complete — auto_approve_source added to exam_booking_request';
END $$;
