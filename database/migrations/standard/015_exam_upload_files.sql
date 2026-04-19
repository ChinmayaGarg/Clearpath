SET search_path TO :schema_name, public;

CREATE TABLE IF NOT EXISTS :schema_name.exam_upload_file (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_upload_id     UUID        NOT NULL
                       REFERENCES :schema_name.exam_upload(id) ON DELETE CASCADE,
  file_path          TEXT        NOT NULL,
  file_original_name TEXT        NOT NULL,
  file_size          BIGINT,
  file_uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_upload_file_upload
  ON :schema_name.exam_upload_file (exam_upload_id);

DO $$ BEGIN
  RAISE NOTICE 'Migration 015 complete — exam_upload_file table created';
END $$;
