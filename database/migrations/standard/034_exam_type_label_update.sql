-- Migration 034: Align exam_type_label enum with new exam type values
-- Adds final, quiz_1-4, test_1-3 to the enum and migrates endterm → final

SET search_path TO :schema_name, public;

ALTER TYPE :schema_name.exam_type_label ADD VALUE IF NOT EXISTS 'final';
ALTER TYPE :schema_name.exam_type_label ADD VALUE IF NOT EXISTS 'quiz_1';
ALTER TYPE :schema_name.exam_type_label ADD VALUE IF NOT EXISTS 'quiz_2';
ALTER TYPE :schema_name.exam_type_label ADD VALUE IF NOT EXISTS 'quiz_3';
ALTER TYPE :schema_name.exam_type_label ADD VALUE IF NOT EXISTS 'quiz_4';
ALTER TYPE :schema_name.exam_type_label ADD VALUE IF NOT EXISTS 'test_1';
ALTER TYPE :schema_name.exam_type_label ADD VALUE IF NOT EXISTS 'test_2';
ALTER TYPE :schema_name.exam_type_label ADD VALUE IF NOT EXISTS 'test_3';

UPDATE :schema_name.exam_upload
  SET exam_type_label = 'final'
  WHERE exam_type_label = 'endterm';

DO $$
BEGIN
  RAISE NOTICE 'Migration 034 complete — exam_type_label enum updated, endterm rows migrated to final';
END $$;
