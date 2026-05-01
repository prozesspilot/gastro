-- =============================================================================
-- Migration 022 — error_log + hook_executions
--
-- Welt-A-Konvention: TEXT customer_id (kein FK auf customers UUID), keine
-- tenant_id (audit_log nutzt SENTINEL '0000…0000' für Welt-A-Einträge).
--
-- Beide Tabellen sind idempotent (CREATE TABLE IF NOT EXISTS).
-- =============================================================================

-- =============================================================================
-- error_log — Pipeline-Fehler-Tracking (M01/M02/M03/M05/M07/M08).
-- Wird vom WF-ERROR-HANDLER und vom Backend (POST /api/v1/errors) befüllt.
-- =============================================================================
CREATE TABLE IF NOT EXISTS error_log (
  error_id       TEXT        PRIMARY KEY DEFAULT pp_gen_ulid_text('err_'),
  customer_id    TEXT        NOT NULL,
  receipt_id     TEXT,
  stage          TEXT,                              -- 'M01' | 'M02' | 'M03' | 'M05' | 'M07' | 'M08' | 'master'
  error_type     TEXT,                              -- 'OCR_FAILED' | 'CATEGORY_FAILED' | 'ARCHIVE_FAILED' | 'WEBHOOK_FAILED' | ...
  error_message  TEXT        NOT NULL,
  stack_trace    TEXT,
  trace_id       TEXT,
  resolved       BOOLEAN     NOT NULL DEFAULT false,
  resolved_at    TIMESTAMPTZ,
  resolved_by    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_log_customer_time
  ON error_log (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_log_receipt
  ON error_log (receipt_id, created_at DESC)
  WHERE receipt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_log_unresolved
  ON error_log (created_at DESC)
  WHERE resolved = false;

-- =============================================================================
-- hook_executions — pro Hook-Aufruf ein Eintrag (egal ob Erfolg oder Fehler).
-- Ergänzt customer_hooks aus 018; FK ON DELETE CASCADE damit Hook-Löschungen
-- nicht referentielle Integrität brechen.
-- =============================================================================
CREATE TABLE IF NOT EXISTS hook_executions (
  execution_id      TEXT        PRIMARY KEY DEFAULT pp_gen_ulid_text('hex_'),
  hook_id           TEXT        NOT NULL REFERENCES customer_hooks(hook_id) ON DELETE CASCADE,
  customer_id       TEXT        NOT NULL,
  receipt_id        TEXT,
  hook_point        TEXT        NOT NULL,
  status            TEXT        NOT NULL CHECK (status IN ('success','failure','timeout','skipped')),
  request_payload   JSONB,
  response_status   INT,
  response_body     TEXT,
  duration_ms       INT,
  error_message     TEXT,
  trace_id          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hook_executions_hook_time
  ON hook_executions (hook_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hook_executions_receipt
  ON hook_executions (receipt_id, created_at DESC)
  WHERE receipt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hook_executions_customer_time
  ON hook_executions (customer_id, created_at DESC);
