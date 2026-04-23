-- Migration 026: Add is_word_doc flag to exam_upload
-- Word document uploads for RWG (Read-With-Graphic) students are tracked
-- as separate exam_upload entries with this flag set to TRUE.

ALTER TABLE :schema_name.exam_upload
  ADD COLUMN IF NOT EXISTS is_word_doc BOOLEAN NOT NULL DEFAULT FALSE;
