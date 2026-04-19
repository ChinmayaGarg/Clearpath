SET search_path TO :schema_name, public;

-- Extra time codes (new; 20MIN/HR and 30MIN/HR already exist from seed)
INSERT INTO :schema_name.accommodation_code (code, label, triggers_rwg_flag) VALUES
  ('10MIN/HR',     '10 min/hr extra time',   FALSE),
  ('15MIN/HR',     '15 min/hr extra time',   FALSE),
  ('45MIN/HR',     '45 min/hr extra time',   FALSE),
  ('60MIN/HR',     '60 min/hr extra time',   FALSE)
ON CONFLICT (code) DO NOTHING;

-- Stop Time Break codes (per-rate)
INSERT INTO :schema_name.accommodation_code (code, label, triggers_rwg_flag) VALUES
  ('10MIN/HR STB', '10 min/hr Stop Time Break', FALSE),
  ('15MIN/HR STB', '15 min/hr Stop Time Break', FALSE),
  ('20MIN/HR STB', '20 min/hr Stop Time Break', FALSE),
  ('30MIN/HR STB', '30 min/hr Stop Time Break', FALSE),
  ('45MIN/HR STB', '45 min/hr Stop Time Break', FALSE),
  ('60MIN/HR STB', '60 min/hr Stop Time Break', FALSE)
ON CONFLICT (code) DO NOTHING;

-- Other new codes
INSERT INTO :schema_name.accommodation_code (code, label, triggers_rwg_flag) VALUES
  ('COMPUTER',      'Computer',                     FALSE),
  ('24HR SPACE',    'Exam spaced 24 hours apart',   FALSE),
  ('NO AFTER 5PM',  'Cannot write after 5 PM',      FALSE)
ON CONFLICT (code) DO NOTHING;

DO $$ BEGIN
  RAISE NOTICE 'Migration 016 complete — new accommodation codes added';
END $$;
