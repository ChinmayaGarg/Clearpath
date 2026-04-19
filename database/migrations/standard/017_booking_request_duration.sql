SET search_path TO :schema_name, public;

ALTER TABLE :schema_name.exam_booking_request
  ADD COLUMN IF NOT EXISTS base_duration_mins     INTEGER,
  ADD COLUMN IF NOT EXISTS extra_mins             INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stb_mins               INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS computed_duration_mins INTEGER;

DO $$ BEGIN
  RAISE NOTICE 'Migration 017 complete — duration columns added to exam_booking_request';
END $$;
