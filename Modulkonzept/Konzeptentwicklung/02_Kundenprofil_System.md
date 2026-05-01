# 02 — Kundenprofil-System

> Das Kundenprofil ist das **Kernstück** von ProzessPilot. Es entscheidet bei jedem einzelnen Beleg, welche Module laufen, welche Integrationen genutzt werden, und mit welchen Credentials.
> Ohne ein gepflegtes Kundenprofil läuft kein einziger Workflow.

---

## 1. Zweck

Das Kundenprofil-System ist:

1. **Single Source of Truth** für Konfiguration (Paket, aktive Module, Integrationen).
2. **Sicherer Speicher** für API-Keys/OAuth-Tokens (verschlüsselt mit pgcrypto).
3. **Routing-Quelle** für n8n-Workflows.
4. **Audit-Quelle** (Wer hat wann was geändert?).
5. **Erweiterungspunkt** für Pro-Kunden (Custom-Konfiguration, Hooks).

---

## 2. Datenmodell

### 2.1 Tabellen (vollständig)

```sql
-- 1. Kundengrunddaten
CREATE TABLE customers (
  customer_id        TEXT PRIMARY KEY,             -- "cust_a3f4b2"
  display_name       TEXT NOT NULL,                -- "Pizzeria Bella Italia"
  legal_name         TEXT,
  vat_id             TEXT,
  contact_email      TEXT NOT NULL,
  contact_phone      TEXT,
  package            TEXT NOT NULL CHECK (package IN ('basic','standard','pro')),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','offboarded')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Konfiguration (versioniert)
CREATE TABLE customer_profiles (
  customer_id        TEXT PRIMARY KEY REFERENCES customers ON DELETE CASCADE,
  profile_version    INT  NOT NULL DEFAULT 1,
  modules_enabled    JSONB NOT NULL,               -- ["M01","M02",...]
  integrations       JSONB NOT NULL,               -- siehe Beispiel
  routing            JSONB NOT NULL,               -- siehe Beispiel
  custom             JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         TEXT
);

-- 3. Profil-Historie (für Audit)
CREATE TABLE customer_profile_history (
  history_id         BIGSERIAL PRIMARY KEY,
  customer_id        TEXT NOT NULL,
  profile_version    INT  NOT NULL,
  snapshot           JSONB NOT NULL,
  changed_by         TEXT NOT NULL,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_summary     TEXT
);

-- 4. Verschlüsselte Credentials
CREATE TABLE customer_credentials (
  credential_id      TEXT PRIMARY KEY,             -- "cred_..."
  customer_id        TEXT NOT NULL REFERENCES customers ON DELETE CASCADE,
  kind               TEXT NOT NULL,                -- 'lexoffice_api_key', 'gdrive_oauth', ...
  ciphertext         BYTEA NOT NULL,               -- pgcrypto AES-256-GCM
  meta               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at         TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ
);
CREATE INDEX idx_credentials_customer_kind ON customer_credentials (customer_id, kind);

-- 5. Custom-Hooks (nur Pro-Pakete)
CREATE TABLE customer_hooks (
  hook_id            TEXT PRIMARY KEY,
  customer_id        TEXT NOT NULL REFERENCES customers ON DELETE CASCADE,
  hook_point         TEXT NOT NULL,                -- 'before_categorization', 'after_export', ...
  implementation     TEXT NOT NULL,                -- 'js_inline', 'http_webhook', 'plugin_id'
  config             JSONB NOT NULL,
  enabled            BOOLEAN NOT NULL DEFAULT true,
  priority           INT NOT NULL DEFAULT 100,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hooks_lookup ON customer_hooks (customer_id, hook_point, enabled);
```

### 2.2 Vollständiges Beispiel-Profil (Pro-Paket, Gastronomie)

```json
{
  "customer_id": "cust_a3f4b2",
  "display_name": "Pizzeria Bella Italia",
  "legal_name": "Bella Italia Mario Rossi e.K.",
  "vat_id": "DE123456789",
  "contact_email": "mario@bella-italia.de",
  "contact_phone": "+4917612345678",
  "package": "pro",
  "status": "active",
  "profile_version": 7,

  "modules_enabled": [
    "M01", "M02", "M03", "M04", "M05", "M07", "M08", "M09", "M10"
  ],

  "integrations": {
    "ocr": {
      "provider": "google_vision",
      "config": {
        "language_hints": ["de", "it"],
        "feature": "DOCUMENT_TEXT_DETECTION"
      }
    },

    "input_whatsapp": {
      "enabled": true,
      "phone_number_id": "123456789012345",
      "display_phone": "+498912345678",
      "allowed_senders": [
        { "name": "Mario", "phone": "+4917612345678", "role": "owner" },
        { "name": "Giulia (Buchhaltung)", "phone": "+4917698765432", "role": "accountant" }
      ],
      "credentials_ref": "cred_wa_a3f4b2"
    },

    "input_email": {
      "enabled": true,
      "alias": "belege+a3f4b2@inbox.prozesspilot.de",
      "imap": {
        "host": "imap.gmail.com",
        "port": 993,
        "username": "belege.bella@gmail.com",
        "credentials_ref": "cred_imap_a3f4b2"
      }
    },

    "archive": {
      "provider": "google_drive",
      "config": {
        "root_folder_id": "1aB2cD3eF4gH5iJ6kL7mN8oP9qR",
        "structure": "{year}/{month_de}/{category_label}/",
        "filename_template": "{document_date}_{supplier_name}_{document_number}_{total_gross}EUR.pdf",
        "naming_collisions": "append_counter"
      },
      "credentials_ref": "cred_gdrive_a3f4b2"
    },

    "booking": {
      "providers": ["lexoffice"],
      "primary": "lexoffice",
      "config": {
        "lexoffice": {
          "voucher_type": "expense",
          "auto_book": false,
          "default_payment_status": "open",
          "credentials_ref": "cred_lexoffice_a3f4b2"
        }
      }
    },

    "datev": {
      "enabled": true,
      "tax_advisor": {
        "name": "Steuerkanzlei Müller & Partner",
        "email": "kontakt@stb-mueller.de",
        "datev_consultant_number": "11111",
        "client_number": "54321"
      },
      "delivery": {
        "method": "email",
        "schedule_cron": "0 7 5 * *",
        "format": "datev_csv_v2",
        "include_pdfs": true
      }
    },

    "spreadsheet": {
      "provider": "google_sheets",
      "enabled": true,
      "config": {
        "sheet_id": "1zXyZ-abc-...",
        "tab_name": "Belege 2026",
        "append_mode": true
      },
      "credentials_ref": "cred_gsheet_a3f4b2"
    },

    "reporting": {
      "enabled": true,
      "delivery_channels": ["email", "whatsapp"],
      "schedule_cron": "0 8 1 * *",
      "report_template": "gastronomie_monthly_v1",
      "include_pdf": true,
      "recipients": [
        { "channel": "email", "to": "mario@bella-italia.de" },
        { "channel": "whatsapp", "to": "+4917612345678" }
      ]
    },

    "supplier_communication": {
      "enabled": true,
      "templates": {
        "missing_invoice": "tpl_missing_de_v2",
        "low_quality": "tpl_low_quality_de_v1"
      },
      "from_email": "belege@bella-italia.de",
      "credentials_ref": "cred_smtp_a3f4b2"
    }
  },

  "routing": {
    "ki_kategorisierung": true,
    "categorization_engine": "claude_sonnet_4_6",
    "min_amount_review": 1000.00,
    "low_confidence_threshold": 0.75,
    "default_currency": "EUR",
    "default_locale": "de_DE",
    "tax_keys_map": {
      "0.19": "9",
      "0.07": "8",
      "0.00": "0"
    },
    "skr_chart": "SKR03",
    "default_cost_centers": ["kueche", "bar", "service", "verwaltung"],
    "duplicate_detection": "sha256+amount+date"
  },

  "custom": {
    "branch": "muenchen-altstadt",
    "fiscal_year_start": "01-01",
    "ai_categorization_examples": [
      { "supplier": "Metro AG", "category": "wareneinkauf_food", "skr": "3100" },
      { "supplier": "Stadtwerke München", "category": "betriebskosten_energie", "skr": "4240" }
    ],
    "supplier_overrides": {
      "Metro AG": { "category": "wareneinkauf_food", "skr": "3100" }
    }
  },

  "updated_at": "2026-04-29T08:00:00Z",
  "updated_by": "user_andreas@prozesspilot.de"
}
```

### 2.3 Beispiel: Basic-Profil (minimal)

```json
{
  "customer_id": "cust_basic_001",
  "display_name": "Café Klein",
  "package": "basic",
  "status": "active",
  "profile_version": 1,
  "modules_enabled": ["M01", "M02", "M07", "M10"],
  "integrations": {
    "ocr": { "provider": "google_vision" },
    "input_whatsapp": { "enabled": true, "phone_number_id": "9876...", "credentials_ref": "cred_wa_basic_001" },
    "archive": {
      "provider": "google_drive",
      "config": {
        "root_folder_id": "...",
        "structure": "{year}/{month_de}/",
        "filename_template": "{document_date}_{supplier_name}_{total_gross}EUR.pdf"
      },
      "credentials_ref": "cred_gdrive_basic_001"
    },
    "spreadsheet": {
      "provider": "google_sheets",
      "config": { "sheet_id": "...", "tab_name": "Belege" },
      "credentials_ref": "cred_gsheet_basic_001"
    }
  },
  "routing": {
    "ki_kategorisierung": false,
    "default_currency": "EUR",
    "default_locale": "de_DE"
  },
  "custom": {}
}
```

---

## 3. Web-App (Admin-UI)

### 3.1 Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind + shadcn/ui
- Auth: NextAuth (E-Mail-Magic-Link, intern) — keine Multi-Tenant-Anmeldung in Phase 1
- API: gleiche Fastify-Backend, JWT mit `role: admin` oder `role: customer`

### 3.2 Routen / Screens

| Route                                | Funktion                                           | Phase |
|--------------------------------------|----------------------------------------------------|-------|
| `/customers`                         | Liste aller Kunden, Suche, Status-Filter            | 1     |
| `/customers/new`                     | Onboarding-Wizard (5 Schritte)                      | 1     |
| `/customers/{id}`                    | Übersicht: Paket, Status, letzte Belege             | 1     |
| `/customers/{id}/profile`            | Profil-Editor (modules_enabled, integrations, …)    | 1     |
| `/customers/{id}/credentials`        | API-Keys/OAuth verwalten (verschlüsselt)            | 1     |
| `/customers/{id}/receipts`           | Beleg-Liste, Re-Run, manuelle Korrekturen           | 2     |
| `/customers/{id}/hooks`              | Custom-Hooks (nur Pro)                              | 3     |
| `/customers/{id}/audit`              | Profil-/Beleg-Historie                              | 2     |
| `/system/health`                     | Worker-Status, n8n-Status, Postgres                 | 1     |

### 3.3 Onboarding-Wizard

Schritt-für-Schritt:

1. **Stammdaten**: Name, USt-ID, Kontakt.
2. **Paket**: Basic / Standard / Pro.
3. **Eingangskanal**: WhatsApp Nummer, E-Mail-Alias.
4. **Integrationen**: OAuth-Flows zu Google Drive, Lexoffice/sevDesk; oder Upload von DATEV-Mandantendaten.
5. **Routing-Defaults**: SKR03/04, Steuerkennzeichen, KI-Kategorisierung an/aus.

Nach Abschluss:
- Profil-Eintrag wird erzeugt (`profile_version=1`).
- n8n-Worker erhalten ein `pp.customer.profile_updated`-Event und cachen das Profil.
- Test-Beleg-Upload aus dem Wizard prüft End-to-End.

---

## 4. Backend-API für Kundenprofile

### 4.1 Endpoints

```
GET    /api/v1/customers                    # Liste (admin)
POST   /api/v1/customers                    # Anlegen (admin)
GET    /api/v1/customers/{id}               # Stammdaten
PATCH  /api/v1/customers/{id}               # Stammdaten ändern

GET    /api/v1/customers/{id}/profile       # vollständiges Profil
PUT    /api/v1/customers/{id}/profile       # vollständiges Replace
PATCH  /api/v1/customers/{id}/profile       # JSON Merge Patch (RFC 7396)

GET    /api/v1/customers/{id}/credentials   # nur Metadaten (kind, rotated_at)
POST   /api/v1/customers/{id}/credentials   # neuen Key speichern (verschlüsselt)
DELETE /api/v1/customers/{id}/credentials/{credential_id}

GET    /api/v1/customers/{id}/profile/history
POST   /api/v1/customers/{id}/profile/rollback     # Rollback auf eine Version

# Spezial: für n8n-Worker
GET    /api/v1/internal/profile/{customer_id}      # Cache-freundlich, nur für Backend-Service
POST   /api/v1/internal/profile/{customer_id}/use-credential  # Auth-gated; gibt entschlüsseltes Secret zurück
```

### 4.2 Profil-Validierung

Vor jedem Schreibvorgang läuft ein JSON-Schema-Validator (`backend/src/core/schemas/customer-profile.schema.json`) plus semantische Checks:

- `modules_enabled` muss zum Paket passen (z. B. M04 nur wenn `package='pro'`).
- Aktive `integrations` müssen entsprechende `credentials_ref` haben.
- `routing.skr_chart` ∈ {SKR03, SKR04}.
- `tax_keys_map` enthält die landesüblichen Sätze.

Bei Fehlern: 400 `VALIDATION_FAILED` mit Liste der Probleme.

### 4.3 Cache-Strategie

n8n soll nicht bei jedem Beleg eine HTTP-Roundtrip zum Backend machen. Lösung:

- **Backend** hat einen In-Memory-Cache (Node-LRU) mit TTL 60s.
- Bei `pp.customer.profile_updated`-Event wird der Cache invalidiert.
- **n8n**: Im Master-Workflow gibt es einen "Fetch: Customer Profile"-Node, der `/api/v1/internal/profile/{customer_id}` ruft. Das Backend antwortet aus dem Cache.

---

## 5. Wie n8n auf das Profil zugreift

### 5.1 Trigger-Phase (Beleg kommt an)

```
[Webhook M10/M-Email] ──► [Function: extract customer_id]
                            │
                            ▼
                   [HTTP: GET /api/v1/internal/profile/{customer_id}]
                            │
                            ▼
                   [Set: customer_profile  (Item-Field)]
                            │
                            ▼
                   [Switch: profile.modules_enabled]
                            │
                ┌───────────┼───────────┐
                ▼           ▼           ▼
              M01         M03         M07 ...
```

### 5.2 Sub-Workflow-Aufruf

Jeder Sub-Workflow (M01..M10) bekommt diese Struktur als Input:

```json
{
  "trace_id": "trc_a8f3d2c1",
  "receipt": { "...vollständiges Receipt..." },
  "customer_profile": { "...wie in 02_Kundenprofil_System.md Abschnitt 2.2..." }
}
```

Damit muss kein Modul selbst das Profil holen.

### 5.3 Credentials-Nutzung in n8n (sicher)

n8n bekommt **niemals** den entschlüsselten API-Key direkt im Workflow. Stattdessen:

**Variante A (bevorzugt) — n8n macht den API-Call übers Backend-Proxy:**

```
n8n  ──HTTP──►  Backend (/api/v1/integrations/lexoffice/voucher)  ──HTTPS──► Lexoffice
```

Backend hat den entschlüsselten Key, leitet weiter, liefert Lexoffice-Response durch.

**Variante B — wenn n8n's nativer Node zwingend verwendet werden soll:**

n8n holt sich den Key just-in-time via signiertem Backend-Call:
```
GET /api/v1/internal/profile/{customer_id}/use-credential?kind=lexoffice_api_key
→ Response: { "value": "decrypted-key", "expires_in": 60 }
```
n8n nutzt den Wert für genau einen Call und verwirft ihn anschließend (kein Caching im Workflow-State). Die HMAC-Signatur und ein dediziertes `audit_log`-Entry (`credential_used`) sichern Nachvollziehbarkeit.

---

## 6. Routing-Logik (was bekommt welche Module?)

Diese Funktion wird vom Backend exposed (`POST /api/v1/routing/plan`) und ersetzt jede „if/else"-Logik in n8n:

```ts
// backend/src/core/routing/route-receipt.ts
export function planRoute(receipt: Receipt, profile: CustomerProfile): RoutePlan {
  const enabled = new Set(profile.modules_enabled);
  const steps: RouteStep[] = [];

  // Phase: Extraktion
  if (enabled.has('M01')) steps.push({ module: 'M01', required: true });

  // Phase: Kategorisierung (nur Standard+ + KI eingeschaltet)
  if (enabled.has('M03') && profile.routing.ki_kategorisierung) {
    steps.push({ module: 'M03', required: true });
  }

  // Phase: Archivierung
  if (enabled.has('M02')) steps.push({ module: 'M02', required: true });

  // Phase: Export-Fan-out
  const exports: ('M04'|'M05'|'M06'|'M07')[] = [];
  if (enabled.has('M05') && profile.integrations.booking?.providers?.includes('lexoffice')) exports.push('M05');
  if (enabled.has('M06') && profile.integrations.booking?.providers?.includes('sevdesk')) exports.push('M06');
  if (enabled.has('M07') && profile.integrations.spreadsheet?.enabled) exports.push('M07');
  if (enabled.has('M04') && profile.integrations.datev?.enabled) exports.push('M04'); // DATEV ist async/Cron, nicht inline

  // Pro-Hook: kann steps hinzufügen oder umsortieren
  return runHooks('after_route_plan', { steps, receipt, profile });
}
```

n8n Master-Workflow ruft `POST /api/v1/routing/plan` einmalig pro Beleg auf und iteriert dann den Plan.

---

## 7. Sicherheit & Compliance

- **Verschlüsselung at rest**: pgcrypto + Schlüssel-Rotation alle 90 Tage. Master-Key in HashiCorp Vault oder AWS KMS.
- **Verschlüsselung in transit**: TLS 1.3 zwischen allen Komponenten.
- **Rollen**:
  - `admin` — Vollzugriff (ProzessPilot-Operator).
  - `accountant` — Lesen/Bearbeiten von Belegen, kein Zugriff auf Credentials.
  - `customer` — Lesen eigenes Profil, eingeschränktes Bearbeiten (Phase 2: Customer-Self-Service-Portal).
- **DSGVO**: Profil-Export per Endpoint `GET /api/v1/customers/{id}/export` (vollständiges JSON). Lösch-Workflow setzt Status auf `offboarded`, nach 30 Tagen Hard-Delete (außer Belege, die GoBD-pflichtig 10 Jahre bleiben — diese werden anonymisiert).
- **Audit**: Jede Profiländerung erzeugt einen Eintrag in `customer_profile_history` mit Diff.

---

## 8. Migrations-/Versionsstrategie

Wenn das Profil-Schema sich ändert:

1. Neuer JSON-Schema-Eintrag in `backend/src/core/schemas/customer-profile.v2.schema.json`.
2. Migration-Script `backend/src/migrations/profile-v1-to-v2.ts` rechnet alte Profile hoch.
3. Backend liest beide Versionen, schreibt nur v2.
4. Nach 30 Tagen: alte Profile sind alle migriert; v1-Schema wird entfernt.

---

## 9. Was die Web-App noch leisten muss (Phase 2)

- **Re-Run** eines fehlgeschlagenen Belegs (Button im UI → POST `/api/v1/receipts/{id}/rerun`).
- **Manuelle Korrektur** (z. B. Lieferant ändern, Kategorie überschreiben).
- **Mass-Aktionen** (mehrere Belege gleichzeitig kategorisieren).
- **Lieferanten-Stammdaten-Pflege** (für bessere Auto-Kategorisierung).
- **Kontenrahmen-Mapping** (kundenindividuelle Kontenpläne).

Diese Features stehen nicht im MVP, sind aber im Datenmodell schon vorbereitet (`receipts.payload->categorization` ist überschreibbar; `audit_log` zeichnet alle Korrekturen auf).
