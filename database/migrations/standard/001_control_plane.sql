-- =============================================================================
-- Clearpath — CONTROL PLANE SCHEMA
-- Layer: public (shared across all tenants)
-- Run once on initial platform setup
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive text for emails/domains

-- ---------------------------------------------------------------------------
-- Enum types (control plane)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.db_status AS ENUM ('provisioning', 'active', 'suspended', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.plan_name AS ENUM ('standard', 'professional', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.grant_reason AS ENUM ('trial', 'negotiated', 'custom_feature', 'internal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Plan
-- Must exist before Institution (FK dependency)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name                public.plan_name NOT NULL UNIQUE,
    display_name        TEXT            NOT NULL,
    monthly_price_cad   NUMERIC(10, 2)  NOT NULL CHECK (monthly_price_cad >= 0),
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.plan IS
    'Subscription tier definitions. Price here is for new signups — existing subscriptions honour the price at signup time via Stripe.';

-- ---------------------------------------------------------------------------
-- Feature
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key             TEXT        NOT NULL UNIQUE,     -- e.g. 'analytics_dashboard'
    name            TEXT        NOT NULL,
    description     TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    is_custom       BOOLEAN     NOT NULL DEFAULT FALSE, -- TRUE = built for one tenant only
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN public.feature.is_custom IS
    'Custom features are tenant-specific and never surfaced in the general product UI.';

-- ---------------------------------------------------------------------------
-- PlanFeature (join: which features are included in which plan)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_feature (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     UUID        NOT NULL REFERENCES public.plan (id) ON DELETE CASCADE,
    feature_id  UUID        NOT NULL REFERENCES public.feature (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_plan_feature UNIQUE (plan_id, feature_id)
);

-- ---------------------------------------------------------------------------
-- Institution
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institution (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT            NOT NULL,
    slug                TEXT            NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9\-]+$'),
    email_domain        CITEXT          NOT NULL UNIQUE, -- primary domain e.g. dal.ca
    plan_id             UUID            NOT NULL REFERENCES public.plan (id),
    timezone            TEXT            NOT NULL DEFAULT 'America/Halifax',
    email_sender_name   TEXT,           -- e.g. 'Dalhousie Accessibility Centre'
    email_reply_to      CITEXT,
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    trial_ends_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.institution IS
    'One row per tenant. email_domain is the primary validated domain for signup.';
COMMENT ON COLUMN public.institution.slug IS
    'Used as schema name prefix and in URLs. Immutable after creation.';

CREATE INDEX IF NOT EXISTS idx_institution_plan    ON public.institution (plan_id);
CREATE INDEX IF NOT EXISTS idx_institution_domain  ON public.institution (email_domain);

-- ---------------------------------------------------------------------------
-- DomainAllowlist
-- Handles institutions with multiple valid email domains,
-- and maps domains to default roles on signup.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.domain_allowlist (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id  UUID        NOT NULL REFERENCES public.institution (id) ON DELETE CASCADE,
    domain          CITEXT      NOT NULL,
    maps_to_role    TEXT        NOT NULL DEFAULT 'lead',  -- default role assigned on signup
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_domain_institution UNIQUE (institution_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_domain_allowlist_domain ON public.domain_allowlist (domain);

-- ---------------------------------------------------------------------------
-- TenantRegistry
-- Tracks provisioning state and migration version per tenant schema.
-- Read by deployment scripts when running migrations across all tenants.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_registry (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id      UUID            NOT NULL UNIQUE REFERENCES public.institution (id) ON DELETE RESTRICT,
    schema_name         TEXT            NOT NULL UNIQUE CHECK (schema_name ~ '^[a-z][a-z0-9_]+$'),
    db_status           public.db_status NOT NULL DEFAULT 'provisioning',
    migration_version   INTEGER         NOT NULL DEFAULT 0,
    provisioned_at      TIMESTAMPTZ,
    last_migrated_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tenant_registry IS
    'One row per tenant schema. deployment scripts iterate this table to run migrations.';
COMMENT ON COLUMN public.tenant_registry.schema_name IS
    'Must match the actual Postgres schema name. e.g. dal, mta, acadia.';
COMMENT ON COLUMN public.tenant_registry.migration_version IS
    'Incremented each time a standard migration runs against this tenant schema.';

-- ---------------------------------------------------------------------------
-- Subscription
-- Billing state per institution. Stripe is the source of truth for payment;
-- this table caches state for fast feature-gate checks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription (
    id                  UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id      UUID                        NOT NULL UNIQUE REFERENCES public.institution (id) ON DELETE RESTRICT,
    status              public.subscription_status  NOT NULL DEFAULT 'trialing',
    stripe_customer_id  TEXT                        UNIQUE,
    stripe_sub_id       TEXT                        UNIQUE,
    current_period_end  TIMESTAMPTZ,
    created_at          TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- PlatformAdmin
-- Your account and any future platform-level staff.
-- No institution_id — operates across all tenant schemas.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admin (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           CITEXT      NOT NULL UNIQUE,
    first_name      TEXT        NOT NULL,
    last_name       TEXT        NOT NULL,
    password_hash   TEXT        NOT NULL,
    salt            TEXT        NOT NULL,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- InstitutionFeatureGrant
-- One-off feature overrides — trials, negotiated access, custom features.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institution_feature_grant (
    id              UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id  UUID                    NOT NULL REFERENCES public.institution (id) ON DELETE CASCADE,
    feature_id      UUID                    NOT NULL REFERENCES public.feature (id) ON DELETE CASCADE,
    granted_by      UUID                    NOT NULL REFERENCES public.platform_admin (id),
    reason          public.grant_reason     NOT NULL,
    notes           TEXT,
    granted_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,            -- NULL = permanent grant
    is_active       BOOLEAN                 NOT NULL DEFAULT TRUE,

    CONSTRAINT uq_institution_feature UNIQUE (institution_id, feature_id)
);

COMMENT ON COLUMN public.institution_feature_grant.expires_at IS
    'NULL means the grant does not expire. Background job deactivates expired grants.';

CREATE INDEX IF NOT EXISTS idx_feature_grant_institution ON public.institution_feature_grant (institution_id);
CREATE INDEX IF NOT EXISTS idx_feature_grant_expires     ON public.institution_feature_grant (expires_at)
    WHERE expires_at IS NOT NULL AND is_active = TRUE;

-- ---------------------------------------------------------------------------
-- PlatformAuditLog
-- Every action you take as platform admin is logged here.
-- Append-only — no UPDATE, no DELETE.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id                UUID        NOT NULL REFERENCES public.platform_admin (id),
    action                  TEXT        NOT NULL,
    target_institution_id   UUID        REFERENCES public.institution (id),
    details                 JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.platform_audit_log IS
    'Append-only. Never UPDATE or DELETE rows in this table.';

CREATE INDEX IF NOT EXISTS idx_platform_audit_admin       ON public.platform_audit_log (admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_institution ON public.platform_audit_log (target_institution_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created     ON public.platform_audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- Seed: Plans
-- ---------------------------------------------------------------------------
INSERT INTO public.plan (name, display_name, monthly_price_cad) VALUES
    ('standard',     'Standard',     500.00),
    ('professional', 'Professional', 2000.00),
    ('enterprise',   'Enterprise',   0.00)   -- enterprise is quoted separately
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed: Features
-- ---------------------------------------------------------------------------
INSERT INTO public.feature (key, name, description) VALUES
    ('daily_book',                    'Daily book',                   'Core daily exam book'),
    ('pdf_import',                    'PDF import',                   'SARS PDF parsing and import'),
    ('status_tracking',               'Status tracking',              'Exam status pipeline'),
    ('audit_trail',                   'Audit trail',                  'Full action audit log'),
    ('multi_user_access',             'Multi-user access',            'Role-based multi-lead access'),
    ('export_print',                  'Export and print',             'PDF export of daily book'),
    ('calendar_view',                 'Calendar view',                'Upcoming exam day calendar'),
    ('prof_email_direct',             'Direct professor email',       'In-app email to professors'),
    ('analytics_dashboard',           'Analytics dashboard',          'Usage and performance analytics'),
    ('course_dossier',                'CourseDossier',                'Institutional course memory'),
    ('live_status_board',             'Live status board',            'Front desk live status display'),
    ('student_accommodation_profiles','Accommodation profiles',       'Persistent student profiles'),
    ('smart_exam_notifications',      'Smart notifications',          'Automated exam reminders'),
    ('custom_form_fields',            'Custom form fields',           'Institution-specific form fields'),
    ('custom_schema_extensions',      'Custom schema extensions',     'Tenant-specific DB tables'),
    ('sso_saml',                      'SSO / SAML',                   'Single sign-on integration'),
    ('data_residency_sla',            'Data residency SLA',           'Guaranteed data location SLA')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed: Plan → Feature entitlements
-- ---------------------------------------------------------------------------
-- Standard: core operational features only
INSERT INTO public.plan_feature (plan_id, feature_id)
SELECT p.id, f.id FROM public.plan p, public.feature f
WHERE p.name = 'standard'
AND f.key IN (
    'daily_book', 'pdf_import', 'status_tracking',
    'audit_trail', 'multi_user_access', 'export_print', 'calendar_view'
)
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- Professional: standard + knowledge and communication features
INSERT INTO public.plan_feature (plan_id, feature_id)
SELECT p.id, f.id FROM public.plan p, public.feature f
WHERE p.name = 'professional'
AND f.key IN (
    'daily_book', 'pdf_import', 'status_tracking', 'audit_trail',
    'multi_user_access', 'export_print', 'calendar_view',
    'prof_email_direct', 'analytics_dashboard', 'course_dossier',
    'live_status_board', 'student_accommodation_profiles',
    'smart_exam_notifications', 'custom_form_fields'
)
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- Enterprise: everything
INSERT INTO public.plan_feature (plan_id, feature_id)
SELECT p.id, f.id FROM public.plan p, public.feature f
WHERE p.name = 'enterprise'
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helper function: check if institution can use a feature
-- Call from application layer: SELECT public.can_use_feature($institution_id, $feature_key)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_use_feature(
    p_institution_id UUID,
    p_feature_key    TEXT
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    -- Check plan entitlement
    SELECT EXISTS (
        SELECT 1
        FROM public.institution i
        JOIN public.plan_feature pf ON pf.plan_id = i.plan_id
        JOIN public.feature f       ON f.id = pf.feature_id
        WHERE i.id = p_institution_id
          AND f.key = p_feature_key
          AND f.is_active = TRUE
          AND i.is_active = TRUE
    )
    OR
    -- Check one-off grant
    EXISTS (
        SELECT 1
        FROM public.institution_feature_grant g
        JOIN public.feature f ON f.id = g.feature_id
        WHERE g.institution_id = p_institution_id
          AND f.key = p_feature_key
          AND g.is_active = TRUE
          AND f.is_active = TRUE
          AND (g.expires_at IS NULL OR g.expires_at > NOW())
    );
$$;

COMMENT ON FUNCTION public.can_use_feature IS
    'Returns TRUE if the institution has access to the feature via their plan or a direct grant.
     Cache the result per institution per request — do not call per UI element.';

-- ---------------------------------------------------------------------------
-- Helper function: resolve tenant schema from email domain
-- Call from API middleware to set search_path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_tenant_schema(
    p_email_domain CITEXT
) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT tr.schema_name
    FROM public.tenant_registry tr
    JOIN public.institution i ON i.id = tr.institution_id
    LEFT JOIN public.domain_allowlist da ON da.institution_id = i.id AND da.domain = p_email_domain
    WHERE (i.email_domain = p_email_domain OR da.domain = p_email_domain)
      AND i.is_active = TRUE
      AND tr.db_status = 'active'
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_tenant_schema IS
    'Given an email domain, returns the tenant schema name to SET search_path to.
     Returns NULL if no matching active tenant exists.';
