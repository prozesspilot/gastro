-- 120_lexoffice_category_map.sql
-- T054/M05 — Mapping SKR-Konto → Lexoffice categoryId (pro Tenant + globale 'default').
--
-- Hintergrund: category.mapper.ts liest/schreibt diese Tabelle bereits, sie war
-- aber in KEINER Migration angelegt ("Geister-Tabelle", vgl. CLAUDE.md §3.1) →
-- in Prod warf der SELECT, der Lexware-Export war nicht durchgaengig lauffaehig
-- (T054, aus dem code-reviewer-Finding zu PR #122).
--
-- Schluessel: (customer_id, skr_account). customer_id ist die Tenant-UUID ALS
-- TEXT oder der Literal 'default' (globales Fallback-Mapping). Daher TEXT statt
-- UUID — so verlangt es der bestehende Code-Kontrakt + Spec M05 §8.2.
--
-- RLS: ein Tenant sieht seine eigenen Zeilen + die globalen 'default'-Zeilen;
-- schreiben darf er nur eigene. 'default'-Zeilen werden per Migration/Admin
-- (RLS-Bypass) geseedet. Der CategoryMapper setzt dafuer app.current_tenant auf
-- seiner Connection (T054) — sonst greift current_tenant_id() nicht.

CREATE TABLE lexoffice_category_map (
  customer_id            TEXT         NOT NULL,
  skr_account            TEXT         NOT NULL,
  lexoffice_category_id  UUID         NOT NULL,

  -- Optionaler Anzeigename der Lexoffice-Kategorie (aus dem api_lookup), nur Doku.
  category_name          TEXT,

  -- Herkunft der Zeile: 'manual' (Operator-Seed), 'default' (globales Fallback,
  -- in customer-Zeile kopiert) oder 'api_lookup' (Heuristik ueber listCategories).
  source                 TEXT         NOT NULL DEFAULT 'manual'
                         CHECK (source IN ('manual', 'default', 'api_lookup')),

  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT lexoffice_category_map_pkey PRIMARY KEY (customer_id, skr_account)
);

CREATE TRIGGER lexoffice_category_map_set_updated_at
BEFORE UPDATE ON lexoffice_category_map
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE lexoffice_category_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE lexoffice_category_map FORCE ROW LEVEL SECURITY;

-- Lesen: eigene Zeilen (customer_id = aktueller Tenant) ODER globale 'default'-Zeilen.
CREATE POLICY lexoffice_category_map_tenant_read ON lexoffice_category_map
  FOR SELECT
  USING (
    is_rls_bypassed()
    OR customer_id = current_tenant_id()::text
    OR customer_id = 'default'
  );

-- Schreiben (INSERT/UPDATE/DELETE): nur eigene Zeilen. 'default'/'manual'-Seeds
-- laufen ausschliesslich via RLS-Bypass (Migration/Admin), nie aus der App-Rolle.
-- Hinweis: FOR ALL deckt in Postgres auch SELECT ab; beide Policies sind
-- permissiv und werden per OR kombiniert → SELECT sieht (eigene) OR (eigene +
-- 'default') = eigene + 'default'; UPDATE/DELETE nur eigene (die Read-Policy
-- gilt nicht fuer Schreib-Kommandos). Gewollt.
CREATE POLICY lexoffice_category_map_tenant_write ON lexoffice_category_map
  FOR ALL
  USING (is_rls_bypassed() OR customer_id = current_tenant_id()::text)
  WITH CHECK (is_rls_bypassed() OR customer_id = current_tenant_id()::text);
