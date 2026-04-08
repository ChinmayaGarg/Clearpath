-- Migration: Add drop-off tracking fields to exam_upload
-- Leads use these to record physical copies received from professors

SET search_path TO :schema_name, public;

ALTER TABLE IF EXISTS :schema_name.exam_upload
  ADD COLUMN IF NOT EXISTS copies_received INTEGER,
  ADD COLUMN IF NOT EXISTS lead_notes       TEXT;

COMMENT ON COLUMN :schema_name.exam_upload.copies_received IS
  'Number of physical exam copies received from the professor (drop-off delivery only).';

COMMENT ON COLUMN :schema_name.exam_upload.lead_notes IS
  'Internal notes added by the lead when handling a drop-off submission.';

DO $$
BEGIN
  RAISE NOTICE 'Migration 007 complete — drop-off tracking columns added to exam_upload';
END $$;
