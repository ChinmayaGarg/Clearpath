-- Migration: Add estimated_copies to exam_upload
-- Professors can indicate how many physical copies they plan to drop off

SET search_path TO :schema_name, public;

ALTER TABLE IF EXISTS :schema_name.exam_upload
  ADD COLUMN IF NOT EXISTS estimated_copies INTEGER;

COMMENT ON COLUMN :schema_name.exam_upload.estimated_copies IS
  'Estimated number of physical copies the professor plans to drop off. Set by professor on upload form.';

DO $$
BEGIN
  RAISE NOTICE 'Migration 008 complete — estimated_copies added to exam_upload';
END $$;
