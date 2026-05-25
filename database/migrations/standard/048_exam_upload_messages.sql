-- ---------------------------------------------------------------------------
-- 048: Exam upload communication thread
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TYPE :schema_name.upload_notification_type ADD VALUE IF NOT EXISTS 'new_message';
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS :schema_name.exam_upload_message (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_upload_id  UUID        NOT NULL REFERENCES :schema_name.exam_upload(id) ON DELETE CASCADE,
  sent_by         UUID        NOT NULL REFERENCES :schema_name."user"(id),
  body            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_upload_message_upload_id
  ON :schema_name.exam_upload_message (exam_upload_id);

CREATE TABLE IF NOT EXISTS :schema_name.exam_upload_message_file (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID        NOT NULL REFERENCES :schema_name.exam_upload_message(id) ON DELETE CASCADE,
  file_path       TEXT        NOT NULL,
  original_name   TEXT        NOT NULL,
  file_size       BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
