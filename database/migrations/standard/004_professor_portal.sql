-- =============================================================================
-- MIGRATION 004 — Professor portal
-- Adds: exam_upload, exam_upload_date, exam_upload_value,
--       exam_reuse_request, upload_notification
-- Modifies: appointment (is_makeup, makeup_of_appointment_id)
--           course_dossier (exam_type_label)
-- Safe to run multiple times — all statements use IF NOT EXISTS
-- =============================================================================

SET search_path TO :schema_name, public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE :schema_name.exam_upload_status AS ENUM (
    'draft', 'submitted', 'superseded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE :schema_name.exam_type_label AS ENUM (
    'midterm', 'endterm', 'tutorial', 'lab', 'quiz', 'assignment', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE :schema_name.upload_date_match_status AS ENUM (
    'unmatched', 'matched', 'conflict'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE :schema_name.reuse_request_status AS ENUM (
    'pending', 'approved', 'denied'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE :schema_name.upload_notification_type AS ENUM (
    'upload_needed',
    'upload_received',
    'reuse_requested',
    'reuse_approved',
    'reuse_denied'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- exam_upload
-- One row per exam a professor prepares.
-- Can cover multiple dates (via exam_upload_date).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.exam_upload (
  id                   UUID                             PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_profile_id UUID                             NOT NULL
                         REFERENCES :schema_name.professor_profile (id) ON DELETE CASCADE,
  course_code          TEXT                             NOT NULL,
  exam_type_label      :schema_name.exam_type_label    NOT NULL,
  version_label        TEXT,                            -- e.g. "Midterm 2 — Section A"
  delivery             :schema_name.delivery_method    NOT NULL DEFAULT 'pending',
  materials            TEXT,
  password             TEXT,
  rwg_flag             BOOLEAN                          NOT NULL DEFAULT FALSE,
  is_makeup            BOOLEAN                          NOT NULL DEFAULT FALSE,
  makeup_notes         TEXT,                            -- e.g. "for student who missed April 14"
  status               :schema_name.exam_upload_status NOT NULL DEFAULT 'draft',
  submitted_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ                      NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ                      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_upload_prof
  ON :schema_name.exam_upload (professor_profile_id);

CREATE INDEX IF NOT EXISTS idx_exam_upload_course
  ON :schema_name.exam_upload (course_code);

COMMENT ON TABLE :schema_name.exam_upload IS
  'Professor-submitted exam details. One upload can cover multiple dates.
   Matched to exam records by course_code + date + optional time_slot.';

-- ---------------------------------------------------------------------------
-- exam_upload_date
-- Each date (and optional time slot) this upload applies to.
-- time_slot = NULL means "all rooms on this date".
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.exam_upload_date (
  id               UUID                                      PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_upload_id   UUID                                      NOT NULL
                     REFERENCES :schema_name.exam_upload (id) ON DELETE CASCADE,
  exam_date        DATE                                      NOT NULL,
  time_slot        TIME,                                     -- NULL = all times on this date
  match_status     :schema_name.upload_date_match_status    NOT NULL DEFAULT 'unmatched',
  matched_exam_id  UUID
                     REFERENCES :schema_name.exam (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ                               NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_upload_date_slot UNIQUE (exam_upload_id, exam_date, time_slot)
);

CREATE INDEX IF NOT EXISTS idx_exam_upload_date_upload
  ON :schema_name.exam_upload_date (exam_upload_id);

CREATE INDEX IF NOT EXISTS idx_exam_upload_date_date
  ON :schema_name.exam_upload_date (exam_date);

COMMENT ON TABLE :schema_name.exam_upload_date IS
  'Dates and optional time slots this upload applies to.
   Matching engine populates match_status and matched_exam_id after PDF import.';

-- ---------------------------------------------------------------------------
-- exam_upload_value
-- Custom form field values for institution-specific fields.
-- Reuses the existing form_field / form_schema system.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.exam_upload_value (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_upload_id UUID        NOT NULL
                   REFERENCES :schema_name.exam_upload (id) ON DELETE CASCADE,
  field_id       UUID        NOT NULL
                   REFERENCES :schema_name.form_field (id) ON DELETE CASCADE,
  value          TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_upload_value UNIQUE (exam_upload_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_upload_value_upload
  ON :schema_name.exam_upload_value (exam_upload_id);

-- ---------------------------------------------------------------------------
-- exam_reuse_request
-- Created when a makeup exam needs to reuse an existing upload.
-- Professor approves or denies via their portal dashboard.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.exam_reuse_request (
  id                 UUID                               PRIMARY KEY DEFAULT gen_random_uuid(),
  original_upload_id UUID                               NOT NULL
                       REFERENCES :schema_name.exam_upload (id) ON DELETE CASCADE,
  makeup_exam_id     UUID                               NOT NULL
                       REFERENCES :schema_name.exam (id) ON DELETE CASCADE,
  requested_by       UUID
                       REFERENCES :schema_name."user" (id) ON DELETE SET NULL,
  status             :schema_name.reuse_request_status  NOT NULL DEFAULT 'pending',
  professor_note     TEXT,
  requested_at       TIMESTAMPTZ                        NOT NULL DEFAULT NOW(),
  responded_at       TIMESTAMPTZ,

  CONSTRAINT uq_reuse_request UNIQUE (original_upload_id, makeup_exam_id)
);

CREATE INDEX IF NOT EXISTS idx_reuse_request_upload
  ON :schema_name.exam_reuse_request (original_upload_id);

CREATE INDEX IF NOT EXISTS idx_reuse_request_exam
  ON :schema_name.exam_reuse_request (makeup_exam_id);

CREATE INDEX IF NOT EXISTS idx_reuse_request_status
  ON :schema_name.exam_reuse_request (status)
  WHERE status = 'pending';

COMMENT ON TABLE :schema_name.exam_reuse_request IS
  'Tracks whether a professor has approved reuse of an existing exam upload
   for a makeup sitting. Pending requests appear on the professor portal dashboard.';

-- ---------------------------------------------------------------------------
-- upload_notification
-- Per-professor notifications about upload activity.
-- Persistent — survives page refreshes unlike the in-memory notification bell.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.upload_notification (
  id                   UUID                                     PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_profile_id UUID                                     NOT NULL
                         REFERENCES :schema_name.professor_profile (id) ON DELETE CASCADE,
  exam_upload_id       UUID
                         REFERENCES :schema_name.exam_upload (id) ON DELETE SET NULL,
  exam_id              UUID
                         REFERENCES :schema_name.exam (id) ON DELETE SET NULL,
  type                 :schema_name.upload_notification_type   NOT NULL,
  message              TEXT                                     NOT NULL,
  is_read              BOOLEAN                                  NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ                              NOT NULL DEFAULT NOW(),
  read_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_upload_notification_prof
  ON :schema_name.upload_notification (professor_profile_id, is_read);

CREATE INDEX IF NOT EXISTS idx_upload_notification_created
  ON :schema_name.upload_notification (created_at DESC);

COMMENT ON TABLE :schema_name.upload_notification IS
  'Persistent notifications for professors. Unlike the in-memory lead notifications,
   these survive page refreshes and are visible on the professor portal dashboard.';

-- ---------------------------------------------------------------------------
-- Modify: appointment — add makeup columns
-- ---------------------------------------------------------------------------
ALTER TABLE :schema_name.appointment
  ADD COLUMN IF NOT EXISTS is_makeup                  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS makeup_of_appointment_id  UUID
    REFERENCES :schema_name.appointment (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointment_makeup
  ON :schema_name.appointment (is_makeup)
  WHERE is_makeup = TRUE;

COMMENT ON COLUMN :schema_name.appointment.is_makeup IS
  'TRUE if this is a makeup sitting. Set by the auto-detection heuristic
   (prior appointment for same course within configurable window) or
   confirmed by the professor via the makeup checkbox on their upload form.';

COMMENT ON COLUMN :schema_name.appointment.makeup_of_appointment_id IS
  'Points to the original appointment this is a makeup for, if identifiable.';

-- ---------------------------------------------------------------------------
-- Modify: course_dossier — add exam_type_label
-- Allows per-exam-type preferences (e.g. different delivery for finals vs midterms)
-- NULL = applies to all exam types for this course (backwards compatible)
-- ---------------------------------------------------------------------------
ALTER TABLE :schema_name.course_dossier
  ADD COLUMN IF NOT EXISTS exam_type_label :schema_name.exam_type_label;

-- Drop old unique constraint and replace with one that includes exam_type_label
DO $$ BEGIN
  ALTER TABLE :schema_name.course_dossier
    DROP CONSTRAINT IF EXISTS uq_dossier_prof_course;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE :schema_name.course_dossier
  DROP CONSTRAINT IF EXISTS uq_dossier_prof_course_type;

ALTER TABLE :schema_name.course_dossier
  ADD CONSTRAINT uq_dossier_prof_course_type
    UNIQUE (professor_id, course_code, exam_type_label);

COMMENT ON COLUMN :schema_name.course_dossier.exam_type_label IS
  'NULL = wildcard, applies to all exam types for this course.
   Specific value overrides the wildcard for that type.
   Lookup priority: exact match > wildcard > any prof for this course.';

-- ---------------------------------------------------------------------------
-- Modify: exam — add exam_upload_id link
-- Set by the matching engine after PDF import.
-- ---------------------------------------------------------------------------
ALTER TABLE :schema_name.exam
  ADD COLUMN IF NOT EXISTS exam_upload_id UUID
    REFERENCES :schema_name.exam_upload (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exam_upload_link
  ON :schema_name.exam (exam_upload_id)
  WHERE exam_upload_id IS NOT NULL;

COMMENT ON COLUMN :schema_name.exam.exam_upload_id IS
  'Set by the matching engine when a professor upload matches this exam.
   NULL = no upload matched yet.';

-- ---------------------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'Migration 004 complete — professor portal tables created';
END $$;