-- Migration 033: Add exam return stage tracking to exam_upload_date + audit trail
-- Purpose: Track post-exam lifecycle (scheduled → prepped → ongoing → finished → returned)
--          for physical exam material handoff back to professors

SET search_path TO :schema_name, public;

-- Stage tracking columns on exam_upload_date
ALTER TABLE :schema_name.exam_upload_date
  ADD COLUMN IF NOT EXISTS session_stage              TEXT
    CHECK (session_stage IN ('prepped','ongoing','finished','returned')),
  ADD COLUMN IF NOT EXISTS missed_prep                BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stage_updated_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stage_updated_by           UUID REFERENCES :schema_name."user"(id),
  ADD COLUMN IF NOT EXISTS completed_copies_returned  INTEGER,
  ADD COLUMN IF NOT EXISTS extra_copies_returned      INTEGER;

-- Append-only audit log for all stage transitions
CREATE TABLE IF NOT EXISTS :schema_name.exam_stage_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_date_id  UUID        NOT NULL REFERENCES :schema_name.exam_upload_date(id) ON DELETE CASCADE,
  from_stage      TEXT,
  to_stage        TEXT        NOT NULL,
  changed_by      UUID        REFERENCES :schema_name."user"(id),  -- NULL = system/background job
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note            TEXT
);

CREATE INDEX IF NOT EXISTS exam_stage_audit_upload_date_idx
  ON :schema_name.exam_stage_audit(upload_date_id, changed_at DESC);

DO $$ BEGIN
  RAISE NOTICE 'Migration 033 complete — exam return stage tracking added';
END $$;
