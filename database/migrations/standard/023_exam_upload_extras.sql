SET search_path TO :schema_name, public;

ALTER TABLE :schema_name.exam_upload
  ADD COLUMN IF NOT EXISTS student_instructions   TEXT,
  ADD COLUMN IF NOT EXISTS exam_collection_method TEXT
    CHECK (exam_collection_method IN ('delivery', 'pickup_mah', 'pickup_sexton')),
  ADD COLUMN IF NOT EXISTS calculator_type        TEXT
    CHECK (calculator_type IN ('scientific', 'non_programmable', 'financial', 'basic', 'none'));

DO $$ BEGIN
  RAISE NOTICE 'Migration 023 complete — student_instructions, exam_collection_method, calculator_type added to exam_upload';
END $$;
