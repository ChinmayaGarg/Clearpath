-- Migration 032: Add attendance tracking columns to exam_booking_request
-- Purpose: Allow leads and admins to mark show/no-show for confirmed students on exam day
-- Workflow: Lead/admin opens Exam Day view → marks each student as show or no_show

ALTER TABLE :schema_name.exam_booking_request
  ADD COLUMN IF NOT EXISTS attendance_status       TEXT CHECK (attendance_status IN ('show', 'no_show')),
  ADD COLUMN IF NOT EXISTS attendance_recorded_by  UUID REFERENCES :schema_name."user"(id),
  ADD COLUMN IF NOT EXISTS attendance_recorded_at  TIMESTAMPTZ;
