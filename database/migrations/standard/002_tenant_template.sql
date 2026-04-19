-- =============================================================================
-- AC EXAM MANAGER — TENANT SCHEMA TEMPLATE
-- Layer: per-institution schema (e.g. dal, mta, acadia)
-- Runs inside a transaction during tenant provisioning.
-- Replace :schema_name with the actual schema slug before executing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Create schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS :schema_name;
SET search_path TO :schema_name, public;

-- ---------------------------------------------------------------------------
-- Enum types (tenant-scoped)
-- All wrapped in DO blocks so the template is safe to re-run
-- if a previous attempt partially failed.
--
-- NOTE: PostgreSQL doesn't allow user-defined types and tables to share the same name
-- in the same schema, because tables automatically create a composite type for their row structure.
-- Therefore, enum types are named with "_enum" suffix (e.g., user_role_enum instead of user_role).
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE :schema_name.user_role_enum AS ENUM (
        'institution_admin', 'lead', 'professor', 'student', 'counsellor'
    );
EXCEPTION WHEN OTHERS THEN 
    -- Type already exists or other error, that's fine - do nothing
    NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE :schema_name.exam_type AS ENUM (
        'paper', 'brightspace', 'crowdmark'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE :schema_name.delivery_method AS ENUM (
        'pickup', 'dropped', 'delivery', 'pending'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE :schema_name.exam_status AS ENUM (
        'pending', 'emailed', 'received', 'written',
        'picked_up', 'cancelled', 'dropped'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE :schema_name.audit_action AS ENUM (
        'created', 'updated', 'deleted', 'status_changed',
        'email_sent', 'pdf_imported', 'password_set', 'flag_changed',
        'note_added', 'role_granted', 'role_revoked', 'login', 'logout'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE :schema_name.entity_type AS ENUM (
        'exam', 'exam_day', 'exam_room', 'appointment',
        'student', 'professor', 'user', 'course_dossier'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE :schema_name.form_context AS ENUM (
        'create', 'edit', 'view'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE :schema_name.form_field_type AS ENUM (
        'text',
        'textarea',
        'number',
        'boolean',
        'select',
        'multi_select',
        'radio',
        'date',
        'file_upload',
        'section_header'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE :schema_name.delivery_status AS ENUM (
        'queued',
        'sent',
        'delivered',
        'bounced',
        'failed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================================================
-- PEOPLE
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- User
-- Identity only. No role, no profile. Institution is implicit from schema.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.user (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT      NOT NULL UNIQUE,
    email_domain    CITEXT      NOT NULL,
    first_name      TEXT        NOT NULL,
    last_name       TEXT        NOT NULL,
    password_hash   TEXT        NOT NULL,
    salt            TEXT        NOT NULL,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    invited_by      UUID        REFERENCES :schema_name.user (id) ON DELETE SET NULL,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE :schema_name.user IS
    'One row per person at this institution. Email is unique within this schema.
     No institution_id needed — schema boundary enforces isolation.';

CREATE INDEX IF NOT EXISTS idx_user_email        ON :schema_name.user (email);
CREATE INDEX IF NOT EXISTS idx_user_email_domain ON :schema_name.user (email_domain);

-- ---------------------------------------------------------------------------
-- UserRole
-- One row per role per user. Multiple roles allowed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.user_role (
    id          UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID                        NOT NULL REFERENCES :schema_name.user (id) ON DELETE CASCADE,
    role        :schema_name.user_role_enum      NOT NULL,
    granted_by  UUID                        REFERENCES :schema_name.user (id) ON DELETE SET NULL,
    granted_at  TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    is_active   BOOLEAN                     NOT NULL DEFAULT TRUE,

    CONSTRAINT uq_user_role UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_role_user ON :schema_name.user_role (user_id);

-- ---------------------------------------------------------------------------
-- StudentProfile
-- Exists when user has 'student' role.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.student_profile (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL UNIQUE REFERENCES :schema_name.user (id) ON DELETE CASCADE,
    student_number  TEXT        UNIQUE,
    phone           TEXT,
    do_not_call     BOOLEAN     NOT NULL DEFAULT FALSE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_profile_number ON :schema_name.student_profile (student_number);

-- ---------------------------------------------------------------------------
-- ProfessorProfile
-- Exists when user has 'professor' role.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.professor_profile (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL UNIQUE REFERENCES :schema_name.user (id) ON DELETE CASCADE,
    department  TEXT,
    phone       TEXT,
    office      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- CounsellorProfile
-- Exists when user has 'counsellor' role.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.counsellor_profile (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL UNIQUE REFERENCES :schema_name.user (id) ON DELETE CASCADE,
    department  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Session
-- Server-side session store. Token stored as hash — never raw.
-- Scoped to this tenant schema — cross-institution sessions impossible.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.session (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES :schema_name.user (id) ON DELETE CASCADE,
    token_hash      TEXT        NOT NULL UNIQUE,
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN :schema_name.session.token_hash IS
    'SHA-256 hash of the raw token. Raw token lives only in the browser cookie.';

CREATE INDEX IF NOT EXISTS idx_session_user       ON :schema_name.session (user_id);
CREATE INDEX IF NOT EXISTS idx_session_expires    ON :schema_name.session (expires_at);

-- ---------------------------------------------------------------------------
-- PasswordResetToken
-- One-time use. used_at NULL = not yet used.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.password_reset_token (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES :schema_name.user (id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,               -- NULL = not yet consumed
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_user    ON :schema_name.password_reset_token (user_id);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_expires ON :schema_name.password_reset_token (expires_at);

-- ===========================================================================
-- EXAM OPERATIONS
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- ExamDay
-- The daily book. One row per date. Unique constraint prevents duplicates.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.exam_day (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    date            DATE        NOT NULL UNIQUE,
    created_by      UUID        REFERENCES :schema_name.user (id) ON DELETE SET NULL,
    notes           TEXT,
    is_published    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_day_date ON :schema_name.exam_day (date DESC);

-- ---------------------------------------------------------------------------
-- Exam
-- One course sitting per exam day.
-- professor_id nullable — not every exam has a linked professor at import time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.exam (
    id                  UUID                            PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_day_id         UUID                            NOT NULL REFERENCES :schema_name.exam_day (id) ON DELETE CASCADE,
    professor_id        UUID                            REFERENCES :schema_name.professor_profile (id) ON DELETE SET NULL,
    course_code         TEXT                            NOT NULL,
    cross_listed_code   TEXT,
    duration_mins       INTEGER                         CHECK (duration_mins > 0 AND duration_mins <= 900),
    exam_type           :schema_name.exam_type          NOT NULL DEFAULT 'paper',
    delivery            :schema_name.delivery_method    NOT NULL DEFAULT 'pending',
    materials           TEXT,
    password            TEXT,
    status              :schema_name.exam_status        NOT NULL DEFAULT 'pending',
    rwg_flag            BOOLEAN                         NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ                     NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN :schema_name.exam.password IS
    'Stored in plaintext — this is an exam file password provided by the professor,
     not an authentication credential. Required before status can advance past emailed.';

CREATE INDEX IF NOT EXISTS idx_exam_day       ON :schema_name.exam (exam_day_id);
CREATE INDEX IF NOT EXISTS idx_exam_professor ON :schema_name.exam (professor_id);
CREATE INDEX IF NOT EXISTS idx_exam_course    ON :schema_name.exam (course_code);
CREATE INDEX IF NOT EXISTS idx_exam_status    ON :schema_name.exam (status);

-- ---------------------------------------------------------------------------
-- ExamRoom
-- One row per room slot per exam.
-- One exam can run in multiple rooms at different times.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.exam_room (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id         UUID        NOT NULL REFERENCES :schema_name.exam (id) ON DELETE CASCADE,
    room_name       TEXT        NOT NULL,
    start_time      TIME        NOT NULL,
    student_count   INTEGER     NOT NULL DEFAULT 0 CHECK (student_count >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_room_exam ON :schema_name.exam_room (exam_id);

-- ---------------------------------------------------------------------------
-- Appointment
-- One student's individual booking within a room slot.
-- Sourced from SARS PDF import.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.appointment (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_room_id        UUID        NOT NULL REFERENCES :schema_name.exam_room (id) ON DELETE CASCADE,
    student_profile_id  UUID        NOT NULL REFERENCES :schema_name.student_profile (id),
    duration_mins       INTEGER     NOT NULL CHECK (duration_mins > 0),
    start_time          TIME        NOT NULL,
    do_not_call         BOOLEAN     NOT NULL DEFAULT FALSE,
    is_cancelled        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_appointment UNIQUE (exam_room_id, student_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_appointment_room    ON :schema_name.appointment (exam_room_id);
CREATE INDEX IF NOT EXISTS idx_appointment_student ON :schema_name.appointment (student_profile_id);

-- ---------------------------------------------------------------------------
-- AccommodationCode
-- Lookup table of all recognised codes at this institution.
-- Per-tenant — each institution maintains their own code set.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.accommodation_code (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code                TEXT        NOT NULL UNIQUE,  -- e.g. 'RWG', 'DRAGON', '30MIN/HR'
    label               TEXT        NOT NULL,
    triggers_rwg_flag   BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE
);

COMMENT ON COLUMN :schema_name.accommodation_code.triggers_rwg_flag IS
    'When TRUE, importing an appointment with this code automatically sets rwg_flag = TRUE on the parent exam.
     Replaces the hardcoded regex in the legacy parser.';

-- ---------------------------------------------------------------------------
-- AppointmentAccommodation
-- Join between appointment and accommodation codes for that booking.
-- Codes live on the appointment, not permanently on the student — they can change term to term.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.appointment_accommodation (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id  UUID        NOT NULL REFERENCES :schema_name.appointment (id) ON DELETE CASCADE,
    code_id         UUID        NOT NULL REFERENCES :schema_name.accommodation_code (id),
    raw_text        TEXT,       -- exact text from SARS PDF — for debugging and audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_appt_code UNIQUE (appointment_id, code_id)
);

CREATE INDEX IF NOT EXISTS idx_appt_accommodation ON :schema_name.appointment_accommodation (appointment_id);

-- ===========================================================================
-- PROFESSOR
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- CourseDossier
-- Institutional memory of how each professor runs each course.
-- Built up over time — the central knowledge base for leads.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.course_dossier (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    professor_id        UUID        NOT NULL REFERENCES :schema_name.professor_profile (id) ON DELETE CASCADE,
    course_code         TEXT        NOT NULL,
    preferred_delivery  :schema_name.delivery_method,
    typical_materials   TEXT,
    password_reminder   BOOLEAN     NOT NULL DEFAULT FALSE,
    notes               TEXT,
    last_updated_by     UUID        REFERENCES :schema_name.user (id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_course_dossier UNIQUE (professor_id, course_code)
);

CREATE INDEX IF NOT EXISTS idx_course_dossier_professor ON :schema_name.course_dossier (professor_id);
CREATE INDEX IF NOT EXISTS idx_course_dossier_course    ON :schema_name.course_dossier (course_code);

-- ===========================================================================
-- DYNAMIC FORMS
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- FormSchema
-- One schema per entity type + context combination.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.form_schema (
    id              UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     :schema_name.entity_type    NOT NULL,
    context         :schema_name.form_context   NOT NULL,
    label           TEXT                        NOT NULL,
    is_active       BOOLEAN                     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_form_schema UNIQUE (entity_type, context)
);

-- ---------------------------------------------------------------------------
-- FormField
-- One field per schema. Rendered in display_order sequence.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.form_field (
    id              UUID                            PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id       UUID                            NOT NULL REFERENCES :schema_name.form_schema (id) ON DELETE CASCADE,
    key             TEXT                            NOT NULL,
    label           TEXT                            NOT NULL,
    field_type      :schema_name.form_field_type    NOT NULL,
    is_required     BOOLEAN                         NOT NULL DEFAULT FALSE,
    display_order   INTEGER                         NOT NULL DEFAULT 0,
    default_value   TEXT,
    placeholder     TEXT,
    help_text       TEXT,
    is_active       BOOLEAN                         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_form_field_key UNIQUE (schema_id, key)
);

CREATE INDEX IF NOT EXISTS idx_form_field_schema ON :schema_name.form_field (schema_id, display_order);

-- ---------------------------------------------------------------------------
-- FormFieldOption
-- Options for select, multi_select, and radio fields.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.form_field_option (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    field_id        UUID        NOT NULL REFERENCES :schema_name.form_field (id) ON DELETE CASCADE,
    value           TEXT        NOT NULL,
    label           TEXT        NOT NULL,
    display_order   INTEGER     NOT NULL DEFAULT 0,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,

    CONSTRAINT uq_form_field_option UNIQUE (field_id, value)
);

CREATE INDEX IF NOT EXISTS idx_form_field_option ON :schema_name.form_field_option (field_id, display_order);

-- ---------------------------------------------------------------------------
-- FormFieldValue
-- Submitted values for dynamic fields.
-- entity_id is a plain UUID — no FK because it points to different tables
-- depending on entity_type in the parent FormSchema.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.form_field_value (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    field_id    UUID        NOT NULL REFERENCES :schema_name.form_field (id) ON DELETE CASCADE,
    entity_id   UUID        NOT NULL,       -- FK resolved at application layer via entity_type
    value       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_field_value UNIQUE (field_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_form_field_value_entity ON :schema_name.form_field_value (entity_id);
CREATE INDEX IF NOT EXISTS idx_form_field_value_field  ON :schema_name.form_field_value (field_id);

-- ===========================================================================
-- TRACKING
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- StatusEvent
-- Immutable record of every exam status transition.
-- No UPDATE, no DELETE — ever.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.status_event (
    id              UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id         UUID                        NOT NULL REFERENCES :schema_name.exam (id) ON DELETE CASCADE,
    from_status     :schema_name.exam_status,   -- NULL for the initial 'pending' creation event
    to_status       :schema_name.exam_status    NOT NULL,
    changed_by      UUID                        REFERENCES :schema_name.user (id) ON DELETE SET NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE :schema_name.status_event IS
    'Append-only. Never UPDATE or DELETE. Every row is a fact about the past.';

CREATE INDEX IF NOT EXISTS idx_status_event_exam    ON :schema_name.status_event (exam_id);
CREATE INDEX IF NOT EXISTS idx_status_event_created ON :schema_name.status_event (created_at DESC);

-- ---------------------------------------------------------------------------
-- AuditLog
-- Field-level change record across all entities.
-- Polymorphic via entity_type + entity_id.
-- Append-only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.audit_log (
    id          UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type :schema_name.entity_type    NOT NULL,
    entity_id   UUID                        NOT NULL,
    action      :schema_name.audit_action   NOT NULL,
    field_name  TEXT,                       -- NULL for non-field actions (created, deleted)
    old_value   TEXT,
    new_value   TEXT,
    changed_by  UUID                        REFERENCES :schema_name.user (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE :schema_name.audit_log IS
    'Append-only. Never UPDATE or DELETE.';

CREATE INDEX IF NOT EXISTS idx_audit_entity   ON :schema_name.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user     ON :schema_name.audit_log (changed_by);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON :schema_name.audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- EmailLog
-- Complete record of every email sent through the system.
-- body_snapshot preserves exact content at send time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.email_log (
    id              UUID                            PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id         UUID                            REFERENCES :schema_name.exam (id) ON DELETE SET NULL,
    sent_by         UUID                            REFERENCES :schema_name.user (id) ON DELETE SET NULL,
    to_email        CITEXT                          NOT NULL,
    subject         TEXT                            NOT NULL,
    body_snapshot   TEXT                            NOT NULL,
    delivery_status :schema_name.delivery_status    NOT NULL DEFAULT 'queued',
    sent_at         TIMESTAMPTZ                     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_exam    ON :schema_name.email_log (exam_id);
CREATE INDEX IF NOT EXISTS idx_email_log_to      ON :schema_name.email_log (to_email);
CREATE INDEX IF NOT EXISTS idx_email_log_sent_at ON :schema_name.email_log (sent_at DESC);

-- ---------------------------------------------------------------------------
-- Note
-- Free text attached to any entity.
-- Polymorphic via entity_type + entity_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS :schema_name.note (
    id          UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type :schema_name.entity_type    NOT NULL,
    entity_id   UUID                        NOT NULL,
    body        TEXT                        NOT NULL,
    created_by  UUID                        REFERENCES :schema_name.user (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_note_entity ON :schema_name.note (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_note_created ON :schema_name.note (created_at DESC);

-- ===========================================================================
-- SEED: Minimal form schemas for this institution
-- These represent the minimum viable form — core fields only.
-- Extended fields are added via FormField rows for Professional+ institutions.
-- ===========================================================================

-- Exam create form
INSERT INTO :schema_name.form_schema (entity_type, context, label) VALUES
    ('exam',        'create', 'New exam'),
    ('exam',        'edit',   'Edit exam'),
    ('appointment', 'create', 'New appointment'),
    ('appointment', 'edit',   'Edit appointment');

-- Minimal exam fields
WITH schema_id AS (
    SELECT id FROM :schema_name.form_schema
    WHERE entity_type = 'exam' AND context = 'create'
)
INSERT INTO :schema_name.form_field
    (schema_id, key, label, field_type, is_required, display_order)
SELECT
    schema_id.id, f.key, f.label, f.field_type::text::form_field_type, f.is_required, f.display_order
FROM schema_id,
(VALUES
    ('course_code',       'Course code',      'text',    TRUE,  1),
    ('cross_listed_code', 'Cross-listed',     'text',    FALSE, 2),
    ('duration_mins',     'Duration (mins)',  'number',  TRUE,  3),
    ('exam_type',         'Exam type',        'select',  TRUE,  4),
    ('delivery',          'Delivery method',  'select',  TRUE,  5),
    ('materials',         'Materials',        'textarea',FALSE, 6),
    ('password',          'Exam password',    'text',    FALSE, 7)
) AS f(key, label, field_type, is_required, display_order);

-- Seed: Default accommodation codes
INSERT INTO :schema_name.accommodation_code (code, label, triggers_rwg_flag) VALUES
    ('RWG',          'Read/Write/Graph',              TRUE),
    ('DRAGON',       'Dragon Naturally Speaking',      TRUE),
    ('STB',          'Separate test-taking building',  FALSE),
    ('10MIN/HR',     '10 min/hr extra time',           FALSE),
    ('15MIN/HR',     '15 min/hr extra time',           FALSE),
    ('20MIN/HR',     '20 min/hr extra time',           FALSE),
    ('30MIN/HR',     '30 min/hr extra time',           FALSE),
    ('45MIN/HR',     '45 min/hr extra time',           FALSE),
    ('60MIN/HR',     '60 min/hr extra time',           FALSE),
    ('10MIN/HR STB', '10 min/hr Stop Time Break',      FALSE),
    ('15MIN/HR STB', '15 min/hr Stop Time Break',      FALSE),
    ('20MIN/HR STB', '20 min/hr Stop Time Break',      FALSE),
    ('30MIN/HR STB', '30 min/hr Stop Time Break',      FALSE),
    ('45MIN/HR STB', '45 min/hr Stop Time Break',      FALSE),
    ('60MIN/HR STB', '60 min/hr Stop Time Break',      FALSE),
    ('COMPUTER',     'Computer',                       FALSE),
    ('24HR SPACE',   'Exam spaced 24 hours apart',     FALSE),
    ('NO AFTER 5PM', 'Cannot write after 5 PM',        FALSE),
    ('WP',           'Word processor',                 FALSE),
    ('OR',           'Oral response',                  FALSE),
    ('READER',       'Reader/Scribe',                  FALSE);

-- ===========================================================================
-- Updated_at trigger function (reusable)
-- ===========================================================================
CREATE OR REPLACE FUNCTION :schema_name.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_user_updated_at
    BEFORE UPDATE ON :schema_name.user
    FOR EACH ROW EXECUTE FUNCTION :schema_name.set_updated_at();

CREATE TRIGGER trg_student_profile_updated_at
    BEFORE UPDATE ON :schema_name.student_profile
    FOR EACH ROW EXECUTE FUNCTION :schema_name.set_updated_at();

CREATE TRIGGER trg_professor_profile_updated_at
    BEFORE UPDATE ON :schema_name.professor_profile
    FOR EACH ROW EXECUTE FUNCTION :schema_name.set_updated_at();

CREATE TRIGGER trg_counsellor_profile_updated_at
    BEFORE UPDATE ON :schema_name.counsellor_profile
    FOR EACH ROW EXECUTE FUNCTION :schema_name.set_updated_at();

CREATE TRIGGER trg_exam_day_updated_at
    BEFORE UPDATE ON :schema_name.exam_day
    FOR EACH ROW EXECUTE FUNCTION :schema_name.set_updated_at();

CREATE TRIGGER trg_exam_updated_at
    BEFORE UPDATE ON :schema_name.exam
    FOR EACH ROW EXECUTE FUNCTION :schema_name.set_updated_at();

CREATE TRIGGER trg_course_dossier_updated_at
    BEFORE UPDATE ON :schema_name.course_dossier
    FOR EACH ROW EXECUTE FUNCTION :schema_name.set_updated_at();

CREATE TRIGGER trg_form_schema_updated_at
    BEFORE UPDATE ON :schema_name.form_schema
    FOR EACH ROW EXECUTE FUNCTION :schema_name.set_updated_at();

CREATE TRIGGER trg_form_field_value_updated_at
    BEFORE UPDATE ON :schema_name.form_field_value
    FOR EACH ROW EXECUTE FUNCTION :schema_name.set_updated_at();
