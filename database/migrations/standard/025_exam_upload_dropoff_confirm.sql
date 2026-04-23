SET search_path TO :schema_name, public;

ALTER TABLE :schema_name.exam_upload
  ADD COLUMN IF NOT EXISTS dropoff_confirmed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dropoff_confirmed_by   UUID REFERENCES :schema_name."user"(id);

DO $$ BEGIN
  RAISE NOTICE 'Migration 025 complete — dropoff_confirmed_at, dropoff_confirmed_by added to exam_upload';
END $$;
