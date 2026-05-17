-- Migration 041: Create term and course_offering tables.
-- Terms are admin-managed academic periods (e.g. "Fall 2026") with optional
-- start/end dates for booking cutoff validation.
-- course_offering is the explicit entity for "CSCI 1100 in Fall 2026".

SET search_path TO :schema_name, public;

CREATE TABLE IF NOT EXISTS :schema_name.term (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT        NOT NULL,
  start_date  DATE,
  end_date    DATE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  UUID        REFERENCES :schema_name."user"(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (label)
);

CREATE TABLE IF NOT EXISTS :schema_name.course_offering (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        NOT NULL REFERENCES :schema_name.course(id) ON DELETE CASCADE,
  term_id     UUID        NOT NULL REFERENCES :schema_name.term(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, term_id)
);

CREATE INDEX IF NOT EXISTS course_offering_term_idx
  ON :schema_name.course_offering(term_id);

DO $$ BEGIN
  RAISE NOTICE 'Migration 041 complete — term and course_offering tables created';
END $$;
