-- 030_belege.sql
-- M01 — Belegerfassung (Receipts).
--
-- Ein "Beleg" = eine Rechnung/Quittung, die ein Wirt eingereicht hat (per
-- WhatsApp, E-Mail, Web-Chat-Widget). Wandert durch die Pipeline:
--   received → extracted → categorized → archived → exported → completed
--
-- Pro Beleg ein einziger Row mit JSONB-Payload, das die Module schrittweise
-- anreichern. Status-FSM siehe 01_Datenmodell_Events.md § 2.2.
--
-- DE-Name "belege" gemäß T011-Akzeptanz-Kriterien — die alte (Welt-A/B)
-- `receipts`-Tabelle existiert nicht mehr nach dem Konzept-Reboot.

-- ---------------------------------------------------------------------------
-- belege
-- ---------------------------------------------------------------------------
CREATE TABLE belege (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Status-FSM
  status              VARCHAR(30) NOT NULL DEFAULT 'received'
                      CHECK (status IN (
                        'received','extracting','extracted',
                        'categorizing','categorized',
                        'archiving','archived',
                        'exporting','exported',
                        'completed',
                        'requires_review','error'
                      )),

  -- Eingangs-Quelle (denormalisiert für schnelle Filter)
  source_channel      VARCHAR(20) NOT NULL
                      CHECK (source_channel IN ('whatsapp','email','web_chat','manual_upload','api','sumup')),
  source_external_id  TEXT,                                    -- z. B. wamid bei WhatsApp
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Datei (in MinIO/S3)
  file_object_key     TEXT NOT NULL,                           -- s3://bucket/<tenant>/originals/...
  file_mime_type      VARCHAR(80) NOT NULL,
  file_size_bytes     BIGINT NOT NULL,
  file_sha256         CHAR(64) NOT NULL,                       -- SHA-256 hex(file_bytes) für Dedup

  -- Vollständiges Receipt-JSON (extraction.fields, categorization, validation,
  -- archive, exports, audit) — siehe 01_Datenmodell_Events.md § 2.1
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Performance-relevante denormalisierte Felder (aus payload extrahiert nach
  -- M01/M03/M02-Fertigstellung):
  supplier_name       VARCHAR(200),
  document_date       DATE,
  total_gross         NUMERIC(12,2),
  currency            CHAR(3) DEFAULT 'EUR',
  category            VARCHAR(80),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotenz: gleicher Beleg darf pro Tenant nur einmal angelegt werden.
  CONSTRAINT belege_tenant_sha256_unique UNIQUE (tenant_id, file_sha256)
);

CREATE TRIGGER belege_set_updated_at
BEFORE UPDATE ON belege
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes (typische Query-Pfade)
-- ---------------------------------------------------------------------------
-- Liste „offene Belege" in der Mitarbeiter-Webapp:
CREATE INDEX idx_belege_tenant_status ON belege (tenant_id, status);
-- Liste „neueste Belege zuerst" pro Tenant:
CREATE INDEX idx_belege_tenant_received ON belege (tenant_id, received_at DESC);
-- Reporting nach Monat (z. B. M08):
CREATE INDEX idx_belege_tenant_docdate ON belege (tenant_id, document_date)
  WHERE document_date IS NOT NULL;
-- Trigger für „needs review" auf der Operator-Liste:
CREATE INDEX idx_belege_review ON belege (received_at) WHERE status = 'requires_review';
-- Volltext-Suche nach Lieferanten-Name in einer Tenant-Ansicht:
CREATE INDEX idx_belege_tenant_supplier ON belege (tenant_id, supplier_name)
  WHERE supplier_name IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS-Policy: nur eigene Tenant-Belege
-- ---------------------------------------------------------------------------
ALTER TABLE belege ENABLE ROW LEVEL SECURITY;
ALTER TABLE belege FORCE ROW LEVEL SECURITY;
CREATE POLICY belege_tenant_isolation ON belege
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());
