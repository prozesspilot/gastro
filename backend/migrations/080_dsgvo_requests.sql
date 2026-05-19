-- 080_dsgvo_requests.sql
-- M12/T010 — DSGVO Auskunft (Art. 15) + Loeschung (Art. 17) Requests.
--
-- Eine Zeile pro DSGVO-Anfrage, die ein Geschaeftsfuehrer im Namen eines
-- Betroffenen (Lieferanten-Email, Customer-Email, etc.) stellt.
--
-- Flow Auskunft:
--   pending     -> Job in BullMQ-Queue gelegt
--   processing  -> Worker sammelt Daten + baut ZIP
--   ready       -> ZIP in MinIO, Download-Link per Mail an Subject
--   completed   -> Subject hat ZIP runtergeladen
--   failed      -> mit error_message
--
-- Flow Loeschung (Two-Step):
--   pending     -> Confirm-Token per Mail an Subject (Redis 30min)
--   confirming  -> Token gueltig, wartet auf POST /confirm
--   processing  -> Soft-Delete laeuft
--   completed   -> Soft-Delete fertig
--   cancelled   -> Token abgelaufen ODER Subject hat NEIN gesagt
--   failed      -> mit error_message

CREATE TABLE dsgvo_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Anfrage-Typ + Status-FSM
  type                  VARCHAR(20) NOT NULL
                        CHECK (type IN ('auskunft', 'loeschung')),
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                          'pending','confirming','processing',
                          'ready','completed','cancelled','failed'
                        )),

  -- Wer ist betroffen?
  subject_email         VARCHAR(320) NOT NULL,                     -- Lieferant/Customer-Mail
  subject_description   TEXT,                                       -- optionale Beschreibung des GF

  -- Wer hat den Antrag gestellt?
  requested_by_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- Auskunft-spezifisch: ZIP-Pfad in MinIO + Passwort (verschluesselt)
  export_object_key     TEXT,                                       -- z.B. <tenant>/dsgvo/<request_id>.zip
  export_password_hash  TEXT,                                       -- Argon2id des ZIP-Passworts (an Subject separat)

  -- Loeschung-spezifisch: was wurde tatsaechlich geloescht?
  soft_deleted_count    INTEGER NOT NULL DEFAULT 0,                 -- belege.payload anonymisiert
  hard_deleted_count    INTEGER NOT NULL DEFAULT 0,                 -- Rows komplett geloescht

  -- Audit/Lifecycle
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  -- Auskunft-ZIP: nach 14 Tagen aufraeumen.
  expires_at            TIMESTAMPTZ
);

CREATE INDEX idx_dsgvo_requests_tenant_status
  ON dsgvo_requests (tenant_id, status);

CREATE INDEX idx_dsgvo_requests_tenant_created
  ON dsgvo_requests (tenant_id, created_at DESC);

-- Rate-Limit-Query: "wie viele Antraege in den letzten 24h pro Tenant?"
CREATE INDEX idx_dsgvo_requests_recent
  ON dsgvo_requests (tenant_id, created_at DESC)
  WHERE status NOT IN ('cancelled', 'failed');

-- Auto-Expire-Query: ZIPs nach 14 Tagen wegraeumen
CREATE INDEX idx_dsgvo_requests_expires
  ON dsgvo_requests (expires_at)
  WHERE expires_at IS NOT NULL AND export_object_key IS NOT NULL;

CREATE TRIGGER dsgvo_requests_set_updated_at
BEFORE UPDATE ON dsgvo_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: Mitarbeiter sehen nur DSGVO-Antraege des aktiven Tenants.
ALTER TABLE dsgvo_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsgvo_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY dsgvo_requests_tenant_isolation ON dsgvo_requests
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());
