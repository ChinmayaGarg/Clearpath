-- Migration 012: Route exam booking requests through professor approval

SET search_path TO :schema_name, public;

-- Add professor routing columns to exam_booking_request
ALTER TABLE :schema_name.exam_booking_request
  ADD COLUMN IF NOT EXISTS professor_profile_id UUID
    REFERENCES :schema_name.professor_profile(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by UUID
    REFERENCES :schema_name."user"(id) ON DELETE SET NULL;

-- Extend the status check to include professor approval states
ALTER TABLE :schema_name.exam_booking_request
  DROP CONSTRAINT IF EXISTS exam_booking_request_status_check;

ALTER TABLE :schema_name.exam_booking_request
  ADD CONSTRAINT exam_booking_request_status_check
  CHECK (status IN ('pending','professor_approved','professor_rejected','confirmed','cancelled'));

CREATE INDEX IF NOT EXISTS idx_exam_booking_professor
  ON :schema_name.exam_booking_request (professor_profile_id, status);

DO $$
BEGIN
  RAISE NOTICE 'Migration 012 complete — exam_booking_request extended with professor routing';
END $$;
