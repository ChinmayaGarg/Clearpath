SET search_path TO :schema_name, public;

ALTER TABLE :schema_name.exam_upload
  ADD COLUMN IF NOT EXISTS exam_duration_mins  INT,
  ADD COLUMN IF NOT EXISTS exam_format         TEXT
    CHECK (exam_format IN ('crowdmark', 'paper', 'brightspace')),
  ADD COLUMN IF NOT EXISTS booklet_type        TEXT
    CHECK (booklet_type IN ('engineering_booklet', 'essay_booklet', 'not_needed')),
  ADD COLUMN IF NOT EXISTS scantron_needed     BOOLEAN,
  ADD COLUMN IF NOT EXISTS calculator_allowed  BOOLEAN;

DO $$ BEGIN
  RAISE NOTICE 'Migration 014 complete — exam_upload extra fields added';
END $$;
