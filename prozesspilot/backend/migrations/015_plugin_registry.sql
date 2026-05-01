-- Migration 015: Plugin-Registry (Task 403)
-- Externe Plugins per API registrieren

CREATE TABLE IF NOT EXISTS plugin_registry (
  plugin_id       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id       TEXT NOT NULL,
  name            TEXT NOT NULL,
  version         TEXT NOT NULL DEFAULT '1.0.0',
  description     TEXT,
  webhook_url     TEXT NOT NULL,
  webhook_secret  TEXT NOT NULL,           -- HMAC-Shared-Secret fuer Webhook-Calls
  hook_events     TEXT[] NOT NULL,         -- z.B. ['after_categorization','after_export']
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plugin_executions (
  execution_id    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  plugin_id       TEXT NOT NULL REFERENCES plugin_registry(plugin_id),
  hook_event      TEXT NOT NULL,
  receipt_id      TEXT,
  payload         JSONB,
  response_status INT,
  response_body   TEXT,
  duration_ms     INT,
  success         BOOLEAN NOT NULL,
  error_message   TEXT,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plugin_executions_plugin ON plugin_executions(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_executions_event  ON plugin_executions(hook_event);
CREATE INDEX IF NOT EXISTS idx_plugin_registry_tenant   ON plugin_registry(tenant_id);
