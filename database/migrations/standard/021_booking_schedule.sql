-- Migration 021: Add booking schedule tables for auto-scheduling algorithm
-- booking_schedule: one row per scheduling run for a date
-- booking_schedule_room: one row per room used in a schedule
-- booking_assignment: maps a confirmed booking request to a room slot

CREATE TABLE IF NOT EXISTS :schema_name.booking_schedule (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE        NOT NULL,
  created_by UUID        REFERENCES :schema_name."user"(id) ON DELETE SET NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS :schema_name.booking_schedule_room (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id     UUID NOT NULL REFERENCES :schema_name.booking_schedule(id) ON DELETE CASCADE,
  booking_room_id UUID NOT NULL REFERENCES :schema_name.booking_room(id)
);

CREATE TABLE IF NOT EXISTS :schema_name.booking_assignment (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_room_id        UUID NOT NULL REFERENCES :schema_name.booking_schedule_room(id) ON DELETE CASCADE,
  exam_booking_request_id UUID NOT NULL UNIQUE REFERENCES :schema_name.exam_booking_request(id)
);
