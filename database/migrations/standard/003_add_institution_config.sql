-- =============================================================================
-- MIGRATION 003 — Add missing columns to institution table
-- Safe to run multiple times — all statements use IF NOT EXISTS / DO NOTHING
-- =============================================================================

ALTER TABLE public.institution
  ADD COLUMN IF NOT EXISTS email_sender_name TEXT;          -- e.g. "Dal Accessibility Centre"

ALTER TABLE public.institution
  ADD COLUMN IF NOT EXISTS email_reply_to    TEXT;          -- reply-to for outbound emails

ALTER TABLE public.institution
  ADD COLUMN IF NOT EXISTS config            JSONB
    NOT NULL DEFAULT '{}';                                   -- board token, room map, etc.

-- Confirm
DO $$
BEGIN
  RAISE NOTICE 'Migration 003 complete — institution config columns added';
END $$;
