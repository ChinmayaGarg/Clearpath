-- Drop the SARS exam workflow tables.
-- Clearpath runs its own native booking system (exam_booking_request);
-- the SARS import pipeline is no longer used.

-- Remove the FK that pointed from exam_upload_date → exam (SARS)
ALTER TABLE :schema_name.exam_upload_date DROP COLUMN IF EXISTS matched_exam_id;

-- Drop SARS tables (CASCADE removes any remaining FKs automatically)
DROP TABLE IF EXISTS :schema_name.appointment_accommodation CASCADE;
DROP TABLE IF EXISTS :schema_name.appointment              CASCADE;
DROP TABLE IF EXISTS :schema_name.exam_room                CASCADE;
DROP TABLE IF EXISTS :schema_name.exam                     CASCADE;
DROP TABLE IF EXISTS :schema_name.exam_day                 CASCADE;
DROP TABLE IF EXISTS :schema_name.status_event             CASCADE;
-- NOTE: exam_stage_audit is Clearpath-native (not SARS) — kept intentionally
