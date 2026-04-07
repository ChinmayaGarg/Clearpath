-- Migration: Add file upload support to exam_upload
-- For professor portal file uploads

SET search_path TO :schema_name, public;

-- Add file upload columns to exam_upload
ALTER TABLE IF EXISTS :schema_name.exam_upload
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS file_original_name TEXT,
ADD COLUMN IF NOT EXISTS file_uploaded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- Add new delivery method enum value if not exists
-- Note: PostgreSQL enums can't be modified with IF NOT EXISTS, so we use DO block
DO $$
BEGIN
    -- Check if 'file_upload' already exists in delivery_method enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'delivery_method'
        AND e.enumlabel = 'file_upload'
    ) THEN
        ALTER TYPE :schema_name.delivery_method ADD VALUE 'file_upload';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Create index for file uploads
CREATE INDEX IF NOT EXISTS idx_exam_upload_file
    ON :schema_name.exam_upload (file_path)
    WHERE file_path IS NOT NULL;

COMMENT ON COLUMN :schema_name.exam_upload.file_path IS
    'Path to stored file (local path or S3 key). NULL = no file uploaded.';

COMMENT ON COLUMN :schema_name.exam_upload.file_original_name IS
    'Original filename as provided by the professor.';

COMMENT ON COLUMN :schema_name.exam_upload.file_uploaded_at IS
    'Timestamp when the file was uploaded.';

COMMENT ON COLUMN :schema_name.exam_upload.file_size IS
    'File size in bytes.';

DO $$
BEGIN
    RAISE NOTICE 'Migration 006 complete — file upload columns added to exam_upload';
END $$;
