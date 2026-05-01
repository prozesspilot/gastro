# 04 — Erweiterbarkeit (Pro-Paket)

> Pro-Kunden bekommen individuelle Anpassungen, **ohne** dass der Kern angefasst wird.
> Dieses Dokument definiert die Erweiterungspunkte und das Plugin-System.

---

## 1. Drei Ebenen der Erweiterbarkeit

| Ebene                   | Was                                                              | Wer baut          | Beispiel                                              |
|-------------------------|------------------------------------------------------------------|-------------------|-------------------------------------------------------|
| 1. **Konfiguration**    | Bestehendes Verhalten parametrisieren                            | ProzessPilot-Admin| Eigener Kontenrahmen, eigene Lieferantenliste         |
| 2. **Hooks**            | Code an definierten Punkten in der Pipeline einklinken           | Engineering Team  | "Vor Lexoffice-Push: prüfe bestimmte SKR-Konten"      |
| 3. **Custom Modules**   | Komplett neues Modul nur für einen Kunden                        | Engineering Team  | Schnittstelle zu kundeneigenem Warenwirtschaftssystem |

Jede neue Anforderung wird **zuerst** auf Ebene 1 versucht, dann 2, erst zuletzt 3.

---

## 2. Ebene 1: Konfigurations-Erweiterungen

Konfiguration läuft über das Feld `customer_profiles.custom` (JSONB) und wird **nicht** schemaseitig validiert (Schema ist `additionalProperties: true` für diesen Block).

### 2.1 Beispiele

```json
{
  "custom": {
    "supplier_overrides": {
      "Metro AG":             { "category": "wareneinkauf_food",       "skr": "3100" },
      "Stadtwerke München":   { "category": "betriebskosten_energie",  "skr": "4240" }
    },
    "ai_categorization_examples": [
      { "supplier": "BackHaus Schmidt", "items_pattern": "Brot|Brötchen", "category": "wareneinkauf_food", "skr": "3100" }
    ],
    "branch_rules": {
      "muenchen-altstadt": { "cost_center": "loc_muc_alt" },
      "muenchen-west":     { "cost_center": "loc_muc_west" }
    },
    "report_overrides": {
      "include_chart_supplier_top10": true,
      "comparison_to_previous_month": true
    }
  }
}
```

### 2.2 Wo greift das?

- `supplier_overrides` → in M03 (Kategorisierung) wird **vor** dem Claude-Call geprüft, ob ein Supplier hardcoded gemappt ist.
- `branch_rules` → in M03 wird der Cost-Center anhand `payload.meta.branch` gesetzt.
- `report_overrides` → in M08 wird die Reporting-Template-Konfiguration ergänzt.

Jedes Modul liest seine relevanten `custom.*`-Felder aus dem Profil und integriert sie. Ist nichts gesetzt, gilt der Default.

---

## 3. Ebene 2: Hook-System

Das Hook-System ist eine geordnete Liste von Erweiterungspunkten, die das Backend an definierten Stellen in der Pipeline aufruft.

### 3.1 Definierte Hook-Points

| Hook-Point                     | Wo                          | Payload                          | Erlaubter Effekt                                                    |
|--------------------------------|-----------------------------|----------------------------------|---------------------------------------------------------------------|
| `before_extraction`            | M01, vor OCR-Call           | `{ receipt, profile }`           | Receipt anreichern (z. B. eigene language hints)                    |
| `after_extraction`             | M01, nach OCR-Postprocess   | `{ receipt, profile }`           | Felder korrigieren/überschreiben (z. B. Lieferant aus Stammdaten)   |
| `before_categorization`        | M03, vor Claude-Call        | `{ receipt, profile, prompt }`   | Prompt anpassen, Beispiele injizieren                               |
| `after_categorization`         | M03, nach Claude-Call       | `{ receipt, profile }`           | Kategorie/SKR überschreiben, Cost-Center setzen                     |
| `before_archive`               | M02, vor Storage-Write      | `{ receipt, profile, target_path }` | Zielpfad/Filename anpassen                                       |
| `after_archive`                | M02, nach Storage-Write     | `{ receipt, profile }`           | Side-Effect (z. B. Backup auf zweites Storage)                      |
| `before_export.lexoffice`      | M05, vor Lexoffice-Push     | `{ receipt, profile, voucher }`  | Voucher-Payload anpassen                                            |
| `before_export.sevdesk`        | M06                         | `{ receipt, profile, voucher }`  | dito                                                                 |
| `before_export.datev`          | M04                         | `{ receipts[], profile, csv }`   | CSV anpassen                                                        |
| `after_export.*`               | M04..M07                    | `{ receipt, profile, result }`   | Side-Effect                                                         |
| `on_requires_review`           | überall, bei `requires_review`| `{ receipt, profile, reason }`  | Custom-Notification, Custom-Queue                                   |
| `on_export_failed`             | M04..M07                    | `{ receipt, profile, error }`    | Custom-Retry, Eskalation                                            |
| `before_report.monthly`        | M08                         | `{ receipts[], profile, draft }` | Reporting-Daten ergänzen                                            |
| `after_report.monthly`         | M08                         | `{ report, profile }`            | Custom-Distribution                                                 |

### 3.2 Hook-Implementierungsarten

Jeder Hook-Eintrag in `customer_hooks` hat ein `implementation`-Feld:

#### A) `http_webhook` (bevorzugt für komplexe Custom-Logik)

```json
{
  "hook_id": "hk_a3f4b2_001",
  "customer_id": "cust_a3f4b2",
  "hook_point": "after_categorization",
  "implementation": "http_webhook",
  "config": {
    "url": "https://customer-system.example.com/prozesspilot/webhook",
    "secret_ref": "cred_hook_a3f4b2_001",
    "timeout_ms": 5000,
    "method": "POST"
  },
  "enabled": true,
  "priority": 100
}
```

Backend ruft den Webhook mit `payload`, signiert mit HMAC. Response-Body kann ein **Patch** zurückgeben:

```json
{
  "ok": true,
  "patch": {
    "categorization": {
      "skr_account": "3120",
      "cost_center": "loc_muc_alt"
    }
  }
}
```

Backend merged den Patch (RFC 7396 JSON Merge Patch). Bei Timeout/Error: Hook wird ignoriert (im Profil konfigurierbar: `on_failure: ignore | abort`).

#### B) `js_inline` (für einfache Transformationen)

```json
{
  "hook_id": "hk_a3f4b2_002",
  "hook_point": "before_export.lexoffice",
  "implementation": "js_inline",
  "config": {
    "code": "if (input.receipt.extraction.fields.total_gross > 5000) { return { patch: { meta: { tags: ['high_value'] } } }; } return null;"
  }
}
```

Code läuft in einer **isolated VM** (`isolated-vm`-NPM-Package), ohne Netzwerk-, Filesystem- oder Process-Zugriff. CPU/Memory-Limits: 100ms / 16MB.

#### C) `plugin_id` (für vom Engineering Team gebaute Erweiterungen)

```json
{
  "hook_id": "hk_a3f4b2_003",
  "hook_point": "after_extraction",
  "implementation": "plugin_id",
  "config": {
    "plugin": "supplier-master-data-v2",
    "version": "1.3.0",
    "settings": { "fuzzy_match_threshold": 0.85 }
  }
}
```

Plugins liegen in `backend/src/plugins/<plugin-id>/`. Sie implementieren ein Standard-Interface (`HookHandler`). Versioniert über NPM-private oder Git-Submodule. Im Customer-Profil wird die exakte Version gepinnt.

### 3.3 Hook-Ausführungsreihenfolge

- Hooks zum gleichen Hook-Point werden nach `priority` (asc) ausgeführt.
- Patches werden nacheinander gemerged.
- Audit-Log schreibt für jeden Hook: `hook_id`, `before`, `after`, `duration_ms`, `error`.

### 3.4 Hook-Testing

Im Admin-UI gibt es einen "Hook-Sandbox":
- Wähle Beleg + Hook → Backend führt Hook aus → zeigt Diff (Before/After).
- Erlaubt sicheres Testen, bevor Hook auf Live-Pipeline aktiviert wird.

---

## 4. Ebene 3: Custom Modules

Wenn Konfiguration und Hooks nicht reichen — z. B. Anbindung an ein ERP, ein eigenes Lager-System, Spezialformate für eine Branchen-Software.

### 4.1 Plugin-Struktur

Ein Custom Module wird als eigenständiges Backend-Plugin gebaut:

```
backend/src/plugins/customer-foo-warenwirtschaft/
├── manifest.json
├── src/
│   ├── index.ts               # entry: register hooks + endpoints
│   ├── handler.ts             # Business-Logik
│   └── schemas/
│       └── input.schema.json
├── tests/
└── README.md
```

`manifest.json`:
```json
{
  "id": "customer-foo-warenwirtschaft",
  "version": "1.0.0",
  "kind": "custom_module",
  "compatible_core": ">=2.0.0 <3.0.0",
  "registers": {
    "endpoints": [
      { "method": "POST", "path": "/api/v1/custom/foo/sync-receipt" }
    ],
    "hooks": [
      { "point": "after_export.lexoffice", "handler": "src/handler.ts#syncToWWS" }
    ],
    "events": {
      "publishes": ["pp.custom.foo.synced"],
      "subscribes": ["pp.receipt.exported"]
    }
  },
  "config_schema": "src/schemas/config.schema.json"
}
```

### 4.2 Custom-Module in n8n

Wenn das Custom Module einen eigenen n8n-Workflow braucht, kommt er in `n8n/workflows/custom/<customer_id>/WF-CUSTOM-FOO.json`. Master-Workflow ruft Custom-Workflows nur auf, wenn das Profil das Module aktiv hat:

```ts
// im RoutePlan
if (profile.custom?.modules?.includes('customer-foo-warenwirtschaft')) {
  steps.push({ module: 'CUSTOM:customer-foo-warenwirtschaft', required: false });
}
```

### 4.3 Datenmodell-Erweiterung

Custom-Modules dürfen **eigene Tabellen** anlegen, aber:
- Tabellennamen mit Prefix: `cust_<plugin-id>_<table>`.
- Pflicht-Spalte `customer_id` mit RLS.
- Migrations laufen in eigener Folder `prisma/migrations/custom/<plugin-id>/`.

### 4.4 Stabilität / SLA

Core-API wird als semver-versioniert garantiert. Custom Modules pinnen `compatible_core` und werden bei Core-Major-Update geprüft/migriert.

---

## 5. Beispiel: Custom-Logik für einen Pro-Kunden

Pizzeria Bella Italia hat folgende Anforderungen:

1. Belege > 1000 € gehen nicht direkt zu Lexoffice, sondern erst in einen "Approval-Status" (Inhaber muss freigeben).
2. Wenn Lieferant = "Metro AG" → automatisch Cost-Center "kueche".
3. Eigenes Reporting-Format (PDF mit Logo).

Lösung **ohne Code-Änderung am Kern**:

### 5.1 Anforderung 1: Approval-Schwelle

Bereits per Konfiguration:
```json
{ "routing": { "min_amount_review": 1000.00 } }
```

Backend setzt automatisch `requires_review` für Beträge ≥ Schwelle.

### 5.2 Anforderung 2: Metro → kueche

Per Konfiguration:
```json
{
  "custom": {
    "supplier_overrides": {
      "Metro AG": { "cost_center": "kueche" }
    }
  }
}
```

M03 hat Standardlogik dafür eingebaut (siehe Modul-Spec).

### 5.3 Anforderung 3: Eigenes Reporting-PDF

Hier reicht Konfiguration nicht — eigene Template-Datei nötig. Lösung: Hook-Plugin.

```json
{
  "hook_id": "hk_a3f4b2_004",
  "hook_point": "before_report.monthly",
  "implementation": "plugin_id",
  "config": {
    "plugin": "branded-report-v1",
    "settings": {
      "logo_url": "s3://prozesspilot-assets/cust_a3f4b2/logo.png",
      "primary_color": "#C8102E",
      "include_supplier_top_10": true
    }
  }
}
```

Plugin liest die Settings, generiert ein eigenes PDF, ersetzt das Standard-PDF im Reporting-Output.

---

## 6. Sicherheits- und Stabilitätsregeln

| Regel                                                                    | Begründung                                  |
|--------------------------------------------------------------------------|---------------------------------------------|
| Hooks dürfen den Receipt-Status **nicht** auf `completed` setzen.        | Status-Transitions kontrolliert nur das Backend |
| Hooks haben max. 5s Timeout.                                             | Pipeline darf nicht ausgebremst werden       |
| Hook-Failure default = `ignore` (loggen, weitermachen).                  | Kein Single-Point-of-Failure durch Custom    |
| Custom Modules dürfen die Core-DB nur via Service-API ansprechen.        | Schemastabilität, kein direkter SQL-Zugriff  |
| Pro Plugin/Hook ein eigener Audit-Log-Entry.                             | Nachvollziehbarkeit                          |
| `js_inline`-Hooks laufen in `isolated-vm` mit Limits.                    | Sicherheit                                   |
| `http_webhook`-Hooks brauchen HMAC-Validierung in beide Richtungen.      | Authentizität                                |

---

## 7. Lifecycle eines Custom-Wunsches

```
[Anfrage Pro-Kunde]
    │
    ▼
[Triage: Konfiguration ausreichend?]
    │
    ├── Ja → Profil-Edit, Done.
    │
    └── Nein
        │
        ▼
[Triage: Hook ausreichend?]
    │
    ├── Ja → Hook bauen (http_webhook | js_inline | plugin)
    │        Sandbox-Test → Aktivieren
    │
    └── Nein
        │
        ▼
[Custom Module bauen]
    │
    ▼
[manifest.json + Tests + Docs]
    │
    ▼
[Deploy in Customer-Profil aktivieren]
```

---

## 8. Was das für Claude Code bedeutet

Wenn Claude Code ein Modul generiert, **muss** es:

1. Hook-Points an den definierten Stellen aufrufen (siehe `before_*`/`after_*` in Modul-Specs).
2. `custom.*`-Konfigurationsfelder lesen und respektieren.
3. Nichts hartcodieren, was kundenindividuell sein könnte (Pfade, Namen, Mappings).

Beispiel-Pseudo-Code:

```ts
// backend/src/modules/m03-categorization/categorize.ts
async function categorize(receipt: Receipt, profile: CustomerProfile): Promise<Receipt> {
  receipt = await runHooks('before_categorization', { receipt, profile });

  // Custom Override prüfen
  const supplier = receipt.extraction?.fields?.supplier_name;
  const override = profile.custom?.supplier_overrides?.[supplier];
  if (override) {
    receipt.categorization = applyOverride(receipt, override);
  } else {
    receipt.categorization = await callClaudeAPI(receipt, profile);
  }

  receipt = await runHooks('after_categorization', { receipt, profile });
  return receipt;
}
```

So ist jedes Modul out-of-the-box pro-tauglich, ohne dass Code für einzelne Kunden in den Kern muss.
