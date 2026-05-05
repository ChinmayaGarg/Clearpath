-- Migration 035: Room features and accommodation-feature mapping

SET search_path TO :schema_name, public;

-- Master list of features a room can have
CREATE TABLE :schema_name.room_feature (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which features a room has (many-to-many)
CREATE TABLE :schema_name.booking_room_feature (
  room_id    UUID NOT NULL REFERENCES :schema_name.booking_room(id)  ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES :schema_name.room_feature(id)  ON DELETE CASCADE,
  PRIMARY KEY (room_id, feature_id)
);

-- Which features an accommodation code requires (many-to-many)
CREATE TABLE :schema_name.accommodation_required_feature (
  accommodation_code_id UUID NOT NULL REFERENCES :schema_name.accommodation_code(id) ON DELETE CASCADE,
  feature_id            UUID NOT NULL REFERENCES :schema_name.room_feature(id)        ON DELETE CASCADE,
  PRIMARY KEY (accommodation_code_id, feature_id)
);

-- Seed initial features
INSERT INTO :schema_name.room_feature (code, label) VALUES
  ('computer',       'Computer'),
  ('word_processor', 'Word Processor')
ON CONFLICT (code) DO NOTHING;

-- Seed initial accommodation → feature mappings
-- RWG, DRAGON, COMPUTER → computer; WP → word_processor
INSERT INTO :schema_name.accommodation_required_feature (accommodation_code_id, feature_id)
SELECT ac.id, rf.id
FROM :schema_name.accommodation_code ac, :schema_name.room_feature rf
WHERE (ac.code IN ('RWG', 'DRAGON', 'COMPUTER') AND rf.code = 'computer')
   OR (ac.code = 'WP' AND rf.code = 'word_processor')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE 'Migration 035 complete — room_feature, booking_room_feature, accommodation_required_feature tables created';
END $$;
