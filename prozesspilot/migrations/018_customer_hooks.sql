-- =============================================================================
-- Migration 018 — customer_hooks (Hook-System nach 04_Erweiterbarkeit_Pro.md §3)
--
-- Pro-Kunden-Hooks für Erweiterungspunkte in der Pipeline. Jeder Hook-Eintrag
-- referenziert genau einen Hook-Point (z. B. 'after_categorization') und eine
-- Implementation ('http_webhook' | 'js_inline' | 'plugin_id' | 'disabled').
--
-- customer_id ist TEXT (kein FK auf customers(id) UUID) — analog zu 010_m10
-- für die Konzept-konforme Welt A.
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_hooks (
  hook_id          TEXT        PRIMARY KEY,
  customer_id      TEXT        NOT NULL,
  hook_point       TEXT        NOT NULL,
  implementation   TEXT        NOT NULL CHECK (implementation IN ('http_webhook','js_inline','plugin_id','disabled')),
  config           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  enabled          BOOLEAN     NOT NULL DEFAULT true,
  priority         INT         NOT NULL DEFAULT 100,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup-Index (hook-runner.ts: WHERE customer_id=$1 AND hook_point=$2 AND enabled ORDER BY priority ASC)
CREATE INDEX IF NOT EXISTS idx_customer_hooks_lookup
  ON customer_hooks (customer_id, hook_point, enabled, priority);

CREATE OR REPLACE TRIGGER tg_customer_hooks_updated_at
  BEFORE UPDATE ON customer_hooks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
