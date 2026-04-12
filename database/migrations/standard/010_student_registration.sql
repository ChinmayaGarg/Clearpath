-- Migration 010: Student registration, provider form, and accommodation grant tables

SET search_path TO :schema_name, public;

-- Student intake form submission (one per student)
CREATE TABLE IF NOT EXISTS :schema_name.student_registration_request (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id        UUID        REFERENCES :schema_name.student_profile(id) ON DELETE SET NULL,
  email                     TEXT        NOT NULL,
  first_name                TEXT        NOT NULL,
  last_name                 TEXT        NOT NULL,
  student_number            TEXT,
  phone                     TEXT,
  status                    TEXT        NOT NULL DEFAULT 'submitted'
                              CHECK (status IN ('submitted','under_review','approved','rejected')),
  student_status_flags      JSONB       NOT NULL DEFAULT '[]',
  disability_categories     TEXT[]      NOT NULL DEFAULT '{}',
  on_medication             BOOLEAN     NOT NULL DEFAULT FALSE,
  medication_details        TEXT,
  academic_impact           TEXT,
  past_accommodations       TEXT[]      NOT NULL DEFAULT '{}',
  requested_accommodations  TEXT[]      NOT NULL DEFAULT '{}',
  provider_name             TEXT,
  provider_phone            TEXT,
  reviewed_by               UUID        REFERENCES :schema_name."user"(id) ON DELETE SET NULL,
  reviewed_at               TIMESTAMPTZ,
  rejection_reason          TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Medical provider documentation tracking
CREATE TABLE IF NOT EXISTS :schema_name.provider_form_request (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_registration_request_id UUID        NOT NULL
    REFERENCES :schema_name.student_registration_request(id) ON DELETE CASCADE,
  provider_name                   TEXT,
  provider_phone                  TEXT,
  sent_at                         TIMESTAMPTZ,
  received_at                     TIMESTAMPTZ,
  status                          TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','received','waived')),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Formally approved accommodations per student
CREATE TABLE IF NOT EXISTS :schema_name.accommodation_grant (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id    UUID        NOT NULL REFERENCES :schema_name.student_profile(id) ON DELETE CASCADE,
  accommodation_code_id UUID        NOT NULL REFERENCES :schema_name.accommodation_code(id),
  approved_by           UUID        REFERENCES :schema_name."user"(id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ,
  notes                 TEXT,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_profile_id, accommodation_code_id)
);

DO $$
BEGIN
  RAISE NOTICE 'Migration 010 complete — student_registration_request, provider_form_request, accommodation_grant tables created';
END $$;
