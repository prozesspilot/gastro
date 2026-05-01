# M03 — Kategorisierung & Buchungsvorbereitung

> **Paket:** Standard, Pro
> **Phase:** 2
> **Verantwortlich:** KI-Kategorisierung + SKR-Konten-Mapping
> **Spec-Version:** 1.0

---

## 1. Zweck

M03 ordnet jeden extrahierten Beleg automatisch einer Kostenkategorie zu (z. B. „Wareneinkauf Lebensmittel", „Miete", „Energie") und mappt sie auf das passende Sachkonto im Kontenrahmen des Kunden (SKR03 oder SKR04). Das Ergebnis ist ein Buchungsvorschlag, der von M04–M07 weiterverarbeitet wird.

---

## 2. Verantwortlichkeit

- Bestimmung von `category_id` + `category_label`.
- Mapping auf `skr_account` und `tax_key`.
- Bestimmung von `cost_center` (sofern Branchen/Filialen).
- Confidence-Scoring; bei niedrig: `requires_review`.
- Reihenfolge der Strategien: Override → Stammdaten → Claude.
- Hooks `before_categorization`, `after_categorization`.

M03 ist **nicht** verantwortlich für das tatsächliche Verbuchen (das macht M04–M07).

---

## 3. Trigger

- Sub-Workflow-Aufruf aus `WF-MASTER-RECEIPT`.
- Akzeptierte Eingangsstatus: `extracted`.
- Wird übersprungen, wenn `profile.routing.ki_kategorisierung === false` (Basic-Pakete).

---

## 4. Abhängigkeiten

| Abhängigkeit                  | Genutzt für                                  |
|-------------------------------|----------------------------------------------|
| Claude API                    | KI-Kategorisierung (Tool-Use)                |
| Postgres (Stammdaten)         | `suppliers_global`, `categories`, `accounts` |
| Hook-System                   | before/after-Hooks                           |

---

## 5. Input / Output

### 5.1 Input

```json
{
  "receipt": { "...inkl. extraction.fields..." },
  "customer_profile": { "...inkl. routing.skr_chart, custom.supplier_overrides..." }
}
```

### 5.2 Output

```json
{
  "ok": true,
  "module": "M03",
  "receipt_patch": {
    "status": "categorized",
    "categorization": {
      "engine": "claude_sonnet_4_6",
      "engine_version": "2026-04",
      "confidence": 0.91,
      "category": "wareneinkauf_food",
      "category_label": "Wareneinkauf Lebensmittel",
      "skr_account": "3100",
      "tax_key": "9",
      "cost_center": "kueche",
      "rationale": "Lieferant ist Lebensmittel-Großhandel; Positionen 'Mehl', 'Olivenöl' sind Wareneinsatz."
    }
  },
  "events_to_emit": ["pp.receipt.categorized"]
}
```

---

## 6. n8n-Workflow `WF-M03`

| #  | Node                | Name                          | Endpoint                                                  |
|----|---------------------|-------------------------------|-----------------------------------------------------------|
| 1  | Execute Workflow    | `Trigger`                     |                                                           |
| 2  | Code                | `Function: assert_status`     | nur `extracted`                                           |
| 3  | HTTP Request        | `Backend: Categorize`         | POST `/api/v1/receipts/{id}/categorize`                   |
| 4  | IF                  | `IF: ok`                      |                                                           |
| 5  | Set                 | `Build: Result`               |                                                           |
| 6  | Respond to Workflow | `Respond`                     |                                                           |

---

## 7. Backend-API

### 7.1 `POST /api/v1/receipts/{receipt_id}/categorize`

Backend-Logik (Pseudocode):

```ts
async function categorize(receiptId: string, profile: CustomerProfile) {
  let receipt = await receiptRepo.findById(receiptId, profile.customer_id);
  assertStatus(receipt, ['extracted']);

  receipt = await hookRunner.run('before_categorization', { receipt, profile });

  const supplier = receipt.extraction.fields.supplier_name;

  // Strategie 1: Customer-Override
  const override = profile.custom?.supplier_overrides?.[supplier];
  if (override) {
    receipt.categorization = applyOverride(override, profile);
    receipt.categorization.engine = 'override';
    receipt.categorization.confidence = 1.0;
  }
  // Strategie 2: Globale Stammdaten
  else {
    const known = await supplierRepo.find(supplier, { fuzzy: true });
    if (known?.default_category && known.confidence >= 0.9) {
      receipt.categorization = applyStammdaten(known, profile);
      receipt.categorization.engine = 'master_data';
    }
    // Strategie 3: Claude
    else {
      const claudeResult = await claudeCategorizer.categorize(receipt, profile);
      receipt.categorization = mapClaude(claudeResult, profile);
      receipt.categorization.engine = 'claude_sonnet_4_6';
    }
  }

  // Cost Center via branch_rules
  const branch = receipt.meta?.branch ?? profile.custom?.default_branch;
  if (branch && profile.custom?.branch_rules?.[branch]?.cost_center) {
    receipt.categorization.cost_center ??= profile.custom.branch_rules[branch].cost_center;
  }

  // Threshold check
  const threshold = profile.routing.low_confidence_threshold ?? 0.75;
  receipt.status = receipt.categorization.confidence < threshold ? 'requires_review' : 'categorized';

  receipt = await hookRunner.run('after_categorization', { receipt, profile });

  const saved = await receiptRepo.update(receipt);
  await audit.log(saved, 'categorized', { engine: saved.categorization.engine, confidence: saved.categorization.confidence });
  await events.emit(receipt.status === 'categorized' ? 'pp.receipt.categorized' : 'pp.receipt.requires_review', saved);
  return saved;
}
```

---

## 8. Claude-Kategorisierer

### 8.1 Prompt (System)

```
Du bist ein Buchhaltungs-Assistent. Du kategorisierst Belege für ein Gastronomieunternehmen
nach den vorgegebenen Kategorien und SKR-Konten.

Antworte AUSSCHLIESSLICH über das Tool `categorize_receipt`.
Wenn du dir unsicher bist, gib eine niedrigere Confidence (< 0.75) zurück und schreibe in
`rationale`, was unklar ist.
```

### 8.2 Tool-Schema (Anthropic Tool-Use)

```json
{
  "name": "categorize_receipt",
  "description": "Kategorisiert einen Beleg und liefert das passende SKR-Konto.",
  "input_schema": {
    "type": "object",
    "properties": {
      "category": { "type": "string", "enum": ["wareneinkauf_food","wareneinkauf_drink","betriebskosten_energie","betriebskosten_wasser","miete","reinigung","wartung","personal","fortbildung","versicherung","kfz","werbung","beratung","sonstige_betriebskosten","sonstige_aufwand"] },
      "category_label": { "type": "string" },
      "skr_account": { "type": "string", "pattern": "^\\d{4}$" },
      "tax_key": { "type": "string" },
      "cost_center": { "type": "string", "nullable": true },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
      "rationale": { "type": "string", "maxLength": 500 }
    },
    "required": ["category","category_label","skr_account","tax_key","confidence","rationale"]
  }
}
```

### 8.3 User-Message (pro Beleg)

```
Lieferant: {supplier_name}
USt-ID: {supplier_vat_id}
Datum: {document_date}
Brutto: {total_gross} {currency}
MwSt-Sätze: 19% Anteil={...}, 7% Anteil={...}
Positionen:
  - {item1.description} ({item1.qty}x {item1.unit_price})
  - ...

Kontenrahmen: {profile.routing.skr_chart}
Branche: {profile.custom.industry_hint}
Bekannte Mappings für ähnliche Lieferanten:
  - "Metro AG" → wareneinkauf_food / SKR03 3100
  - "Stadtwerke" → betriebskosten_energie / SKR03 4240

Bitte kategorisiere.
```

### 8.4 Few-Shot über `profile.custom.ai_categorization_examples`

Falls der Kunde spezifische Beispiele pflegt, werden sie als zusätzliche `assistant`-Demos in den Claude-Call injiziert. Maximal 5 Beispiele, älteste zuerst rotiert.

### 8.5 Caching

Cache-Key: `sha256(prompt + supplier + total + items)`. TTL: 30 Tage. Bei Cache-Hit wird `engine = 'claude_cached'` gesetzt.

---

## 9. Stammdaten-Tabellen

### 9.1 `categories` (global)

```sql
CREATE TABLE categories (
  category_id      TEXT PRIMARY KEY,                    -- 'wareneinkauf_food'
  label_de         TEXT NOT NULL,
  default_skr03    TEXT,
  default_skr04    TEXT,
  default_tax_key  TEXT,
  description      TEXT
);
```

Initial-Seed: 14 Standardkategorien (Gastronomie). Erweiterbar.

### 9.2 `customer_categories` (Override)

```sql
CREATE TABLE customer_categories (
  customer_id      TEXT NOT NULL REFERENCES customers,
  category_id      TEXT NOT NULL,
  override_skr     TEXT,
  override_tax_key TEXT,
  PRIMARY KEY (customer_id, category_id)
);
```

Erlaubt einem Kunden, einzelne Konten umzubiegen, ohne den globalen Datensatz zu ändern.

### 9.3 `customer_cost_centers`

```sql
CREATE TABLE customer_cost_centers (
  customer_id      TEXT NOT NULL,
  cost_center_id   TEXT NOT NULL,
  label            TEXT NOT NULL,
  PRIMARY KEY (customer_id, cost_center_id)
);
```

---

## 10. Tax-Keys

`profile.routing.tax_keys_map` mappt MwSt-Satz → DATEV-Steuerschlüssel:

```json
{
  "0.19": "9",
  "0.07": "8",
  "0.00": "0"
}
```

M03 nimmt den dominanten Satz aus `extraction.fields.tax_lines` (höchster Anteil) und mappt.

---

## 11. Events

| Event                          | Wann                                |
|--------------------------------|-------------------------------------|
| `pp.receipt.categorized`       | Erfolgreiche Kategorisierung        |
| `pp.receipt.requires_review`   | Confidence unter Schwelle           |

---

## 12. Fehlerbehandlung

| Fehler                              | Klasse        | Handling                                       |
|-------------------------------------|---------------|------------------------------------------------|
| Claude-API 5xx / Timeout            | Recoverable   | Retry 2×, dann Fallback auf Stammdaten/`sonstige_aufwand` mit Confidence 0.5 |
| Claude liefert ungültiges JSON      | Recoverable   | 1× Re-Prompt mit "respond ONLY via tool"; sonst `requires_review` |
| Lieferant fehlt komplett            | Validation    | Status `requires_review`                       |
| Override liefert ungültiges SKR     | Validation    | Status `requires_review`                       |
| Token-Limit erreicht                | Fatal         | Operator-Alert, Status `error`                 |

---

## 13. Code-Struktur

```
backend/src/modules/m03-categorization/
├── routes.ts
├── handlers/
│   └── categorize.handler.ts
├── services/
│   ├── claude-categorizer.ts
│   ├── override-resolver.ts
│   ├── master-data-resolver.ts
│   ├── skr-mapper.ts
│   └── confidence-scorer.ts
├── prompts/
│   └── categorize.system.md
├── tests/
└── README.md
```

---

## 14. ENV-Variablen

| Variable          | Beispiel              |
|-------------------|-----------------------|
| `CLAUDE_API_KEY`  | `sk-ant-...`          |
| `CLAUDE_MODEL`    | `claude-sonnet-4-6`   |
| `M03_CACHE_TTL_DAYS` | `30`                |

---

## 15. Acceptance Criteria

- [ ] Override-Strategie greift vor Claude (Test mit `supplier_overrides`).
- [ ] SKR03/04-Mapping ist korrekt (Test pro Kategorie).
- [ ] Cache verhindert doppelte Claude-Calls für identische Inputs.
- [ ] Bei niedriger Confidence wird `requires_review` gesetzt.
- [ ] Hooks werden aufgerufen, Patch wird gemerged.
- [ ] Tax-Key-Mapping korrekt aus `profile.routing.tax_keys_map`.
- [ ] Tests: 90% Genauigkeit auf 50 echten Test-Belegen mit Goldstandard-Labels.
