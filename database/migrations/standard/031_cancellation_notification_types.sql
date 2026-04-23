-- Migration 031: Add cancellation-related notification types
-- These types can be used for future notification systems (admin, student notifications)
-- Currently upload_notification is professor-only, so these are reserved for potential expansion

SET search_path TO :schema_name, public;

ALTER TYPE :schema_name.upload_notification_type
  ADD VALUE IF NOT EXISTS 'cancellation_request_submitted';

ALTER TYPE :schema_name.upload_notification_type
  ADD VALUE IF NOT EXISTS 'cancellation_approved';

ALTER TYPE :schema_name.upload_notification_type
  ADD VALUE IF NOT EXISTS 'cancellation_rejected';

DO $$ BEGIN
  RAISE NOTICE 'Migration 031 complete — added cancellation notification types';
END $$;
