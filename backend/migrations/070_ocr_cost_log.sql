-- 070_ocr_cost_log.sql
-- M01/T007 — Cost-Tracking für OCR-API-Calls.
--
-- Zweck:
--   * Pro Tenant und Kalendertag mitzählen, wie viele Vision-API-Aufrufe gemacht
--     wurden. Schützt vor Runaway-Kosten (Akzeptanz-Kriterium: max 1000/Tag).
--   * Spätere Pricing-Auswertung pro Tenant (Konzept §17 Pricing-Modell).
--
-- Granularität: ein Row pro (tenant_id, day) — wird per UPSERT hochgezählt.
-- Engine: 'google_vision' / 'mindee' (zukünftig). Erlaubt getrennte
-- Auswertung wenn mehrere Provider parallel laufen.

CREATE TABLE ocr_cost_log (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day             DATE NOT NULL DEFAULT CURRENT_DATE,
  engine          VARCHAR(40) NOT NULL DEFAULT 'google_vision',
  call_count      INTEGER NOT NULL DEFAULT 0,
  -- Letzter Beleg, der einen Call ausgelöst hat — nur für Debugging,
  -- nicht für Auswertung gedacht.
  last_beleg_id   UUID REFERENCES belege(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ocr_cost_log_unique_tenant_day_engine UNIQUE (tenant_id, day, engine)
);

CREATE INDEX idx_ocr_cost_log_tenant_day ON ocr_cost_log (tenant_id, day DESC);

CREATE TRIGGER ocr_cost_log_set_updated_at
BEFORE UPDATE ON ocr_cost_log
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: Mitarbeiter sehen nur Cost-Daten des Tenants, in dessen Context
-- sie gerade arbeiten. Bypass via is_rls_bypassed() für Reporting.
ALTER TABLE ocr_cost_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_cost_log FORCE ROW LEVEL SECURITY;
CREATE POLICY ocr_cost_log_tenant_isolation ON ocr_cost_log
  FOR ALL
  USING (is_rls_bypassed() OR tenant_id = current_tenant_id())
  WITH CHECK (is_rls_bypassed() OR tenant_id = current_tenant_id());
