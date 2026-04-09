-- Migration: Add student_accommodation table
-- Per-student per-term accommodations managed by counsellors

SET search_path TO :schema_name, public;

CREATE TABLE IF NOT EXISTS :schema_name.student_accommodation (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id    UUID NOT NULL REFERENCES :schema_name.student_profile(id) ON DELETE CASCADE,
  counsellor_profile_id UUID REFERENCES :schema_name.counsellor_profile(id),
  accommodation_code_id UUID NOT NULL REFERENCES :schema_name.accommodation_code(id),
  term                  TEXT NOT NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_profile_id, accommodation_code_id, term)
);

COMMENT ON TABLE :schema_name.student_accommodation IS
  'Per-student per-term accommodations approved by counsellors. Separate from per-appointment accommodations.';

DO $$
BEGIN
  RAISE NOTICE 'Migration 009 complete — student_accommodation table created';
END $$;
