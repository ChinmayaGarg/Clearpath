SET search_path TO :schema_name, public;

-- BRIGHTSPACE is an exam delivery method, not a student accommodation.
-- Deactivate rather than delete to preserve any existing records that reference it.
UPDATE :schema_name.accommodation_code
SET is_active = FALSE
WHERE code = 'BRIGHTSPACE';

DO $$ BEGIN
  RAISE NOTICE 'Migration 018 complete — BRIGHTSPACE accommodation deactivated';
END $$;
