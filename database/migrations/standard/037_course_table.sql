-- Migration 037: Course master table

SET search_path TO :schema_name, public;

CREATE TABLE IF NOT EXISTS :schema_name.course (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        NOT NULL,
  name        TEXT,
  department  TEXT,
  term        TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  UUID        REFERENCES :schema_name."user"(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_course_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_course_code ON :schema_name.course(code);

DO $$
BEGIN
  RAISE NOTICE 'Migration 037 complete — course master table created';
END $$;
