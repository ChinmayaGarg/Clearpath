-- Migration 047: Lead audit log for tracking all lead actions

SET search_path TO :schema_name, public;

DROP TABLE IF EXISTS :schema_name.lead_audit_log;

CREATE TABLE :schema_name.lead_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  performed_by  UUID NOT NULL,
  action        TEXT NOT NULL,
  description   TEXT,
  entity_type   TEXT,
  entity_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_audit_log_performed_by ON :schema_name.lead_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_lead_audit_log_created_at  ON :schema_name.lead_audit_log(created_at);
