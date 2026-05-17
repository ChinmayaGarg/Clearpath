-- Migration 040: Restore exam_stage_audit table
-- It was accidentally dropped in migration 038 (SARS removal).
-- exam_stage_audit is a Clearpath-native table used by the prep portal
-- to track post-exam stage transitions (prepped → ongoing → finished → returned).

SET search_path TO :schema_name, public;

CREATE TABLE IF NOT EXISTS :schema_name.exam_stage_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_date_id  UUID        NOT NULL REFERENCES :schema_name.exam_upload_date(id) ON DELETE CASCADE,
  from_stage      TEXT,
  to_stage        TEXT        NOT NULL,
  changed_by      UUID        REFERENCES :schema_name."user"(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note            TEXT
);

CREATE INDEX IF NOT EXISTS exam_stage_audit_upload_date_idx
  ON :schema_name.exam_stage_audit(upload_date_id, changed_at DESC);

DO $$ BEGIN
  RAISE NOTICE 'Migration 040 complete — exam_stage_audit restored';
END $$;
