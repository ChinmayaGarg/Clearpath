-- Migration 020: Add booking_room table + OWN ROOM accommodation code
-- Adds a flag to accommodation_code for "prefers solo room" (not strictly required)
-- and creates the booking_room table for institution admin to define available rooms.

ALTER TABLE :schema_name.accommodation_code
  ADD COLUMN IF NOT EXISTS prefers_solo_room BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark existing codes that strictly require a solo room (RWG, DRAGON already have triggers_rwg_flag)
-- OWN ROOM is a new code: student prefers their own room but can share if no solo room is available
INSERT INTO :schema_name.accommodation_code (code, label, prefers_solo_room)
  VALUES ('OWN ROOM', 'Own room (prefers solo)', TRUE)
  ON CONFLICT (code) DO UPDATE SET prefers_solo_room = TRUE;

-- Physical rooms at the institution used for exam scheduling
CREATE TABLE IF NOT EXISTS :schema_name.booking_room (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT    NOT NULL UNIQUE,
  capacity   INTEGER NOT NULL CHECK (capacity >= 1),
  notes      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
