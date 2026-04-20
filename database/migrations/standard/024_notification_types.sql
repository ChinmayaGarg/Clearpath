SET search_path TO :schema_name, public;

ALTER TYPE :schema_name.upload_notification_type
  ADD VALUE IF NOT EXISTS 'upload_reminder';

ALTER TYPE :schema_name.upload_notification_type
  ADD VALUE IF NOT EXISTS 'booking_cancelled';

DO $$ BEGIN
  RAISE NOTICE 'Migration 024 complete — upload_reminder and booking_cancelled added to upload_notification_type';
END $$;
