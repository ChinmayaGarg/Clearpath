-- Migration 022: Add booking_upload_needed to upload_notification_type enum
-- Allows the system to notify professors when student bookings are confirmed,
-- prompting them to upload their exam file and Word doc for RWG students.

ALTER TYPE :schema_name.upload_notification_type
  ADD VALUE IF NOT EXISTS 'booking_upload_needed';
