-- =============================================================================
-- Migration 017 — Webhook-Queue
--
-- Persistente Queue für Webhook-Aufrufe mit Exponential-Backoff-Retry.
-- =============================================================================

CREATE TABLE IF NOT EXISTS webhook_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url           TEXT        NOT NULL,
  payload       JSONB       NOT NULL DEFAULT '{}',
  attempts      INT         NOT NULL DEFAULT 0,
  max_attempts  INT         NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error    TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_queue_pending
  ON webhook_queue (next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_queue_tenant
  ON webhook_queue (tenant_id, created_at DESC);

CREATE OR REPLACE TRIGGER tg_webhook_queue_updated_at
  BEFORE UPDATE ON webhook_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
