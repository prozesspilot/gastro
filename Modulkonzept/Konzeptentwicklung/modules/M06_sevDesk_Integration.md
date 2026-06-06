# M06 — sevDesk-Integration

> ⚠️ **EINGEFROREN (Stand 2026-06-06)** — beschreibt ein ungebautes/totes Modul, das aktuell gegen nicht-existente (Geister-)Tabellen läuft (HTTP 500). Stand veraltet; diese Spec gilt erst nach Reaktivierung (Post-Pilot). Was wirklich läuft, steht in `.claude/CLAUDE.md` §3.

> **Paket:** Standard, Pro
> **Phase:** 2
> **Verantwortlich:** Push der kategorisierten Belege als Voucher nach sevDesk
> **Spec-Version:** 1.0

---

## 1. Zweck

M06 ist die Schwesterimplementierung zu M05 für Kunden, die sevDesk statt Lexoffice nutzen. Funktional identisch — nur der Zielservice ist ein anderer.

---

## 2. Verantwortlichkeit

Identisch zu M05, aber:
- Aufruf der sevDesk-API (`https://my.sevdesk.de/api/v1`).
- Andere Voucher-Datenstruktur (`Voucher` + `VoucherPos`).
- Anderer Auth-Flow (API-Token-only).

---

## 3. Trigger

- Sub-Workflow aus `WF-MASTER-RECEIPT`.
- Akzeptierter Status: `archived` oder `categorized`.
- Aktiv nur wenn `M06` in `modules_enabled` UND `integrations.booking.providers` enthält `sevdesk`.

---

## 4. n8n-Workflow `WF-M06`

Identische Struktur wie `WF-M05`. Endpoint: `POST /api/v1/receipts/{id}/exports/sevdesk`.

---

## 5. Backend-API

### 5.1 `POST /api/v1/receipts/{receipt_id}/exports/sevdesk`

```ts
async function pushToSevDesk(receiptId: string, profile: CustomerProfile) {
  let receipt = await receiptRepo.findById(receiptId, profile.customer_id);
  assertStatus(receipt, ['archived', 'categorized']);

  const existing = receipt.exports?.find(e => e.target === 'sevdesk' && e.status === 'pushed');
  if (existing) return receipt;

  const voucher = buildSevDeskVoucher(receipt, profile);
  const hookResult = await hookRunner.run('before_export.sevdesk', { receipt, profile, voucher });

  const client = await sevdeskClient.forCustomer(profile.customer_id);

  // 1. Voucher anlegen
  const created = await client.saveVoucher(hookResult.voucher);    // POST /Voucher/Factory/saveVoucher
  // 2. Datei hochladen
  const fileBytes = await pickAttachmentBytes(receipt);
  const uploaded = await client.uploadTempFile(fileBytes, `${receipt.receipt_id}.pdf`);
  await client.attachFileToVoucher(created.objects.voucher.id, uploaded.filename);

  receipt.exports = [...(receipt.exports ?? []).filter(e => e.target !== 'sevdesk'), {
    target: 'sevdesk',
    status: 'pushed',
    external_id: String(created.objects.voucher.id),
    external_url: `https://my.sevdesk.de/#/fi/edit/type/VOU/id/${created.objects.voucher.id}`,
    pushed_at: new Date().toISOString(),
  }];
  receipt.status = 'exported';

  receipt = await hookRunner.run('after_export.sevdesk', { receipt, profile, result: created });
  const saved = await receiptRepo.update(receipt);
  await audit.log(saved, 'exported.sevdesk', { external_id: created.objects.voucher.id });
  await events.emit('pp.receipt.exported', { ...saved, target: 'sevdesk' });
  return saved;
}
```

---

## 6. sevDesk-Voucher-Mapping

```ts
function buildSevDeskVoucher(r: Receipt, p: CustomerProfile): SevDeskVoucherFactory {
  const f = r.extraction.fields;
  const c = r.categorization;
  const dominantTax = dominantTaxRate(f.tax_lines);

  return {
    voucher: {
      voucherDate: f.document_date,
      supplier: lookupSupplierObject(f.supplier_vat_id) ?? null,
      supplierName: f.supplier_name,
      description: `${f.supplier_name} ${f.document_number}`,
      payDate: null,
      status: 50,                      // 50 = offen
      taxRule: { id: mapTaxRuleId(dominantTax, p), objectName: 'TaxRule' },
      creditDebit: 'C',                // Eingangsrechnung
      voucherType: 'VOU',
      currency: f.currency,
    },
    voucherPosSave: [{
      accountingType: { id: mapSkrToSevDeskAccountId(c.skr_account, p), objectName: 'AccountingType' },
      taxRate: dominantTax * 100,
      net: false,                      // Beträge sind brutto
      sumNet: f.total_net,
      sumGross: f.total_gross,
      sumTax: sum(f.tax_lines.map(t => t.amount)),
      comment: c.cost_center ? `Kostenstelle: ${c.cost_center}` : '',
    }],
    voucherPosDelete: null,
    filename: null,                    // wird separat im 2. Step gehängt
  };
}
```

### 6.1 Stammdaten-Mappings

```sql
CREATE TABLE sevdesk_account_map (
  customer_id        TEXT NOT NULL,
  skr_account        TEXT NOT NULL,
  sevdesk_account_id INT  NOT NULL,
  PRIMARY KEY (customer_id, skr_account)
);
CREATE TABLE sevdesk_tax_rule_map (
  customer_id        TEXT NOT NULL,
  tax_rate_pct       NUMERIC NOT NULL,
  sevdesk_tax_rule_id INT NOT NULL,
  PRIMARY KEY (customer_id, tax_rate_pct)
);
```

Initialer Sync beim Onboarding über `GET /AccountingType` und `GET /TaxRule`.

---

## 7. sevDesk-Client (Backend)

```
backend/src/core/adapters/booking/sevdesk/
├── sevdesk.client.ts
├── voucher.builder.ts
└── tests/
```

- Auth: API-Token im Header `Authorization: <token>` (kein Bearer-Prefix).
- Rate-Limit: 250 Req/min pro Mandant. Token-Bucket im Backend.
- Anhang-Flow: zweistufig (`/Voucher/Factory/uploadTempFile` → `/Voucher/{id}/saveAttachmentToVoucher`).

---

## 8. Code-Struktur

```
backend/src/modules/m06-sevdesk/
├── routes.ts
├── handlers/
│   └── push.handler.ts
├── services/
│   ├── voucher-builder.ts
│   ├── tax-mapper.ts
│   └── account-mapper.ts
├── tests/
└── README.md
```

---

## 9. Fehlerbehandlung & Events

Identisch zu M05, mit sevDesk-spezifischen Fehlercodes (`401`, `400 ValidationError`, `429`).

---

## 10. ENV-Variablen

| Variable                  | Beispiel                              |
|---------------------------|---------------------------------------|
| `SEVDESK_API_BASE`        | `https://my.sevdesk.de/api/v1`        |
| `SEVDESK_DEFAULT_TIMEOUT_MS` | `15000`                            |

API-Token pro Kunde in `customer_credentials` (kind=`sevdesk_api_token`).

---

## 11. Wiederverwendung

Voucher-Builder-Logik und Mapping-Pattern teilen sich mit M05 ein gemeinsames Interface in `backend/src/core/adapters/booking/`:

```ts
export interface BookingAdapter {
  readonly id: 'lexoffice' | 'sevdesk';
  pushVoucher(receipt: Receipt, profile: CustomerProfile): Promise<ExportEntry>;
}
```

Damit kann der Master-Workflow blind beide Adapter verwenden — die Wahl trifft das Routing.

---

## 12. Acceptance Criteria

- [ ] Voucher in sevDesk korrekt sichtbar (Brutto/Netto/Steuer).
- [ ] PDF angehängt.
- [ ] Idempotenz, Hooks, Rate-Limit korrekt.
- [ ] Tax-Rule-Mapping pro Kunde.
- [ ] BookingAdapter-Interface ist mit M05 austauschbar.
