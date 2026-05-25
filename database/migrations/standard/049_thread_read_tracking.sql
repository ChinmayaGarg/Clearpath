-- ---------------------------------------------------------------------------
-- 049: Per-user read tracking for exam upload message threads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS :schema_name.exam_upload_thread_read (
  exam_upload_id  UUID        NOT NULL REFERENCES :schema_name.exam_upload(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES :schema_name."user"(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (exam_upload_id, user_id)
);
