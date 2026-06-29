-- 128_reports.sql
-- T087/M08 — Monats-Reporting.
--
-- Ein "report" = ein erzeugter Monats-Übersichtsbericht für einen Tenant +
-- Periode (Jahr/Monat). Die Aggregate (Totals, Top-Kategorien/-Lieferanten,
-- Vormonatsvergleich) werden als JSONB-Snapshot mitgespeichert, das gerenderte
-- PDF liegt in MinIO (`pdf_object_key`).
--
-- Idempotenz: UNIQUE (tenant_id, period_year, period_month) — ein Re-Build
-- desselben Monats überschreibt den vorhandenen Row (ON CONFLICT im Backend),
-- es gibt also genau einen Report pro Tenant+Monat.
--
-- RLS wie überall auf der belege-Welt: is_rls_bypassed() OR tenant_id =
-- current_tenant_id() (Helper aus 002_helpers.sql). Tabellen-GRANTs sind nicht
-- nötig — setup-app-role.sql konfiguriert ALTER DEFAULT PRIVILEGES (Muster wie
-- 124/125/127).

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
CREATE TABLE reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Berichtszeitraum (Vormonat). period_month 1..12.
  period_year       INT NOT NULL,
  period_month      INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),

  -- Aggregat-Snapshot (receipts_count, gross_sum, by_category[], top_suppliers[],
  -- comparison_prev_month, largest_single). Bewusst denormalisiert mitgespeichert,
  -- damit ein Report reproduzierbar ist, auch wenn sich Belege später ändern.
  totals            JSONB NOT NULL,

  -- MinIO-Objekt-Key des gerenderten PDF.
  pdf_object_key    TEXT NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotenz: ein Report pro Tenant+Monat.
  CONSTRAINT reports_tenant_period_unique UNIQUE (tenant_id, period_year, period_month)
);

-- Schneller Zugriff "alle Reports eines Tenants, neueste zuerst".
CREATE INDEX reports_tenant_created_idx ON reports (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports FORCE ROW LEVEL SECURITY;
CREATE POLICY reports_tenant_isolation ON reports
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());
