# Webapp-Status (final, Session 2026-05-01)

## Was diese Session geliefert hat

### Pflicht-Lektüre
- `Konzeptentwicklung/05_Roadmap.md` — Phasen, kritischer Pfad
- `Konzeptentwicklung/modules/M03_Kategorisierung.md` — Strategie-Stufen (Override → Stammdaten → Claude)
- `Konzeptentwicklung/modules/M05_Lexoffice_Integration.md` — Voucher-Push-Endpoint, Idempotenz
- aktueller Code (types/api/Pages/data/tasks)

### Modul-Numerierung — Konflikt-Hinweis

User-Spec und `data/tasks.ts` verwenden eine **vereinfachte Numerierung**:
- M03 = OCR/Extraktion · M04 = Kategorisierung · M05 = Lexoffice

Das Konzept (Modulkonzept-Ordner) nutzt die ursprüngliche:
- M01 = Belegerfassung_OCR (enthält Extraktion) · M03 = Kategorisierung · M05 = Lexoffice

Die Webapp folgt der **User-Spec**. `MODULE_META` in `types.ts` ist die Single
Source of Truth dafür — Konzept-Begriffe wurden dort umsortiert.

### Geänderte Dateien

| Datei                                        | Änderung                                                  |
|----------------------------------------------|-----------------------------------------------------------|
| `src/types.ts`                               | **komplett ersetzt** — schlanke Domain-Types nach Spec    |
| `src/api/_client.ts`                         | NEU — fetch-Wrapper mit `x-pp-tenant-id`, ApiError-Klasse |
| `src/api/receipts.ts`                        | NEU — getReceipts/getReceipt/upload/updateStatus/reprocess/download/Stats + Backend-Mapper |
| `src/api/customers.ts`                       | NEU — getCustomers/getCustomer/create/delete + Profile-CRUD + Lexoffice-Test |
| `src/api/categories.ts`                      | NEU — Fallback-Liste mit 14 SKR03/04-Kategorien           |
| `src/api/tenants.ts`                         | NEU                                                       |
| `src/api/health.ts`                          | NEU                                                       |
| `src/api/index.ts`                           | NEU — Barrel + Backwards-Kompat-Aliase                    |
| `src/api.ts`                                 | gelöscht                                                  |
| `src/pages/ReceiptDetailPage.tsx`            | **komplett neu** — Status-Timeline, Confidence-Bar, Action-Buttons, requires_review-Banner |
| `src/pages/CustomerProfilePage.tsx`          | **komplett neu** — Stammdaten / Module mit Abhängigkeiten / Lexoffice (mit Test) / Benachrichtigungen, optimistic Update |
| `src/pages/ReceiptsPage.tsx`                 | **komplett neu** — Status-Filter-Dropdown, Konfidenz/Kategorie-Spalten, Klick→Detail, requires_review-Highlight |
| `src/pages/UploadPage.tsx`                   | Migration auf neue API + Receipt-Schema                   |
| `src/pages/StatsPage.tsx`                    | Migration auf `extracted_data` + `categorization`         |
| `src/pages/DashboardPage.tsx`                | Migration auf `enabled_modules` Bool-Object               |
| `src/pages/CustomersPage.tsx`                | Migration auf `display_name` + ohne entfallene Felder     |
| `src/pages/CustomerDetailPage.tsx`           | Vereinfacht — Stammdaten-Edit zog ins Profile             |
| `src/pages/SettingsPage.tsx`                 | API-Aufrufe migriert                                      |
| `src/pages/TenantsPage.tsx`                  | Tenant ohne `active`/`updated_at`                         |
| `src/components/Layout.tsx`                  | Sidebar-Pending-Counter auf neue Status-Werte             |
| `src/components/GlobalSearch.tsx`            | Receipt/Customer-Felder migriert                          |
| `src/components/OnboardingModal.tsx`         | API-Aufrufe migriert                                      |
| `src/App.tsx`                                | + `/tenants/:tid/customers/:cid/receipts` Route           |
| `src/index.css`                              | + Status-Timeline + row-review-Highlight                  |

### Verifikation

- `npm run build` → **erfolgreich** (294 KB JS / gzip 88 KB)
- 0 TypeScript-Fehler in strict mode
- Keine neuen npm-Pakete (keine Tailwind/Axios-Installation, wie gefordert)
- Alle neuen Routes registriert, Verlinkungen prüfen sich gegen die Route-Tabelle

### Aufgaben-Mapping

| Aufgabe                                | Status       |
|----------------------------------------|--------------|
| 1 — types.ts ersetzen                  | ✅ erledigt  |
| 2 — ReceiptDetailPage                  | ✅ erledigt  |
| 3 — CustomerProfilePage                | ✅ erledigt  |
| 4 — ReceiptsListPage Verbesserungen    | ✅ erledigt  |
| 5 — src/api/ Struktur                  | ✅ erledigt  |
| 6 — App.tsx Routes                     | ✅ erledigt  |

## Backend-Endpoints, die das UI heute aufruft

Das UI ist defensiv: 404 → leeres Ergebnis (kein Crash). Folgende Endpoints
sind im Konzept vorgesehen, im Backend aber teils noch nicht implementiert:

| Methode | Pfad                                              | Konzept-Quelle           | Status |
|---------|---------------------------------------------------|--------------------------|--------|
| GET     | `/receipts?customer_id=…`                         | bestehend                | ✅      |
| GET     | `/receipts/:id`                                   | bestehend                | ✅      |
| POST    | `/receipts`                                       | M01                       | ✅      |
| PUT     | `/receipts/:id/status`                            | bestehend                | ✅      |
| POST    | `/receipts/:id/reprocess`                         | Konzept §9 (re-run)      | ⚠ TODO  |
| GET     | `/receipts/:id/download`                          | M02                       | ⚠ TODO  |
| GET     | `/customers`                                      | bestehend                | ✅      |
| GET     | `/customers/:id/profile` / PUT                    | bestehend                | ✅      |
| POST    | `/integrations/lexoffice/test`                    | M05 §7                    | ⚠ TODO  |
| GET     | `/categories`                                     | M03 §9.1                  | ⚠ TODO (Fallback aktiv) |

## Offene Punkte für nächste Session

- `/tenants/:tid/customers/:cid/receipts` rendert ReceiptsPage ohne URL-basiertes
  Customer-Filtering. Optional: ReceiptsPage so erweitern, dass `useParams().customerId`
  gelesen und an `getReceipts()` übergeben wird.
- ReceiptsPage löscht den Detail-Slide-Panel-Code aus der vorherigen Session
  zugunsten einer dedizierten Detail-Route — dieser Teil wurde nicht abgeschaltet
  (er kommt nicht zurück, weil er entfernt wurde).
- Re-Process-Button in ReceiptDetailPage erwartet Backend-Endpoint, der noch nicht
  existiert — UI ist vorbereitet, blockt aber im Fehlerfall mit Toast.
- Tax-ID-Maskierung speichert beim Bearbeiten Klartext im Draft; das ist by design
  (Backend verschlüsselt at-rest), kann aber für Operator-UI-Logs noch maskiert werden.
- OnboardingModal nutzt weiter den alten Flow; bei nächster Migration auf
  CustomerProfile-Schema anpassen.
