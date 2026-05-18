-- Migration 046: Counsellor notes + document attachments for registration requests

SET search_path TO :schema_name, public;

-- Add counsellor-internal notes to registration requests
ALTER TABLE :schema_name.student_registration_request
  ADD COLUMN IF NOT EXISTS counsellor_notes TEXT;

-- Attachments uploaded by counsellors (doctor's letters, supporting docs, etc.)
CREATE TABLE IF NOT EXISTS :schema_name.registration_attachment (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id     UUID        NOT NULL
    REFERENCES :schema_name.student_registration_request(id) ON DELETE CASCADE,
  file_path           TEXT        NOT NULL,
  original_name       TEXT        NOT NULL,
  file_size           INT,
  mime_type           TEXT,
  uploaded_by         UUID        REFERENCES :schema_name."user"(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  RAISE NOTICE 'Migration 046 complete — counsellor_notes column + registration_attachment table created';
END $$;
