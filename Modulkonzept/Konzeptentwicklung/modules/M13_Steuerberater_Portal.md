# M13 — Steuerberater-Portal

> **Status (2026-05-07):** ✅ implementiert. Spec wurde nachgezogen, weil das Modul im Code unter dem etwas irreführenden Pfad `m06-advisor-portal/` liegt — historisch bedingt, kein Submodul von M06 (sevDesk).
> **Code:** `backend/src/modules/m06-advisor-portal/`
> **Migration:** Kein eigener Migration-File. Die Tabellen `tax_advisor_accounts` und `tax_advisor_audit` wurden ad-hoc angelegt oder existieren im Code-Kontext des Moduls. Eine eigenständige Migration `028_tax_advisor_portal.sql` existiert **nicht** in `backend/migrations/` — die Spec-Referenz war fehlerhaft (Audit-Finding F15). Nächste freie Migrationsnummer für eine Nachrüstung wäre ≥ 120.
> **Paket:** Pro

---

## 1. Zweck

Externer Lese-Zugang für Steuerberater des Kunden. Der Berater kann monatliche Belegexporte herunterladen — ohne eigenen Login in der Haupt-Webapp und ohne Zugriff auf Live-Daten.

Vermeidet, dass der Tenant Belege manuell per E-Mail rumschickt, und stellt sicher, dass der Berater immer die aktuelle Version hat.

## 2. Verantwortlichkeit

- Ein Token-basiertes Read-Only-Portal pro Berater pro Tenant
- Listet **fertiggestellte Export-Pakete** (DATEV-CSV, Lexoffice-Bestätigungen, Beleg-PDFs als Zip)
- Kein Zugriff auf in-flight-Belege (`status` ∈ {received, extracting, extracted, categorizing, …}) — nur abgeschlossene Monatspakete
- Audit-Log jeder Berater-Aktion (Login, Download)

## 3. Status — was lebt, was ist DEPRECATED

Aus `routes.ts`:

```
AKTIV:
  GET /api/v1/advisor/exports/:customerId    → Liste herunterladbarer Exporte

DEPRECATED (X-Deprecated-Header, A3-Scope-Reduktion):
  GET  /api/v1/advisor/overview               → entfernt im nächsten Major
  GET  /api/v1/advisor/receipts/pending       → entfernt im nächsten Major
  POST /api/v1/advisor/receipts/bulk-approve  → entfernt im nächsten Major
```

Ursprünglich war das Portal interaktiver gedacht (Live-Belege approven), wurde dann auf reine Download-Sicht reduziert (DSGVO + steuerrechtliche Klarheit: Berater darf nicht in laufenden Buchungen "korrigieren").

## 4. Authentifizierung

- Pro Berater: ein langlebiger Bearer-Token, im Tenant-Profil gepflegt
- Token-Rotation per Webapp-Operator möglich
- IP-Allowlist optional (Tenant-Setting)

## 5. Datenmodell

> **Hinweis (Audit-Finding F15, 2026-05-26):** Eine Migration `028_tax_advisor_portal.sql` existiert **nicht** in `backend/migrations/`. Die nachstehenden Tabellen sind entweder noch nicht per Migration angelegt oder wurden ad-hoc erstellt. Bei der nächsten Überarbeitung dieses Moduls muss eine saubere Migration erstellt werden (nächste freie Nr. ≥ 120).

Benötigte Tabellen:

- `tax_advisor_accounts` (id, customer_id, name, email, token_hash, created_at, last_login_at)
- `tax_advisor_audit` (id, advisor_id, action, target_resource, ip, user_agent, occurred_at)

## 6. Endpoints

| Methode | Pfad                                                     | Zweck                                       |
|---------|----------------------------------------------------------|---------------------------------------------|
| GET     | `/api/v1/advisor/exports/:customerId`                    | Liste fertiger Monatspakete                 |
| GET     | `/api/v1/advisor/exports/:customerId/:export_id/download`| Zip-Download (DATEV + Belege)               |

Auth: `Authorization: Bearer <token>`

## 7. Webapp-Sicht (für Operator + Tenant)

- Tenant-Settings → "Steuerberater" → Berater anlegen, Token erzeugen, Token-Link kopieren
- Berater bekommt eine schlichte separate Login-Seite (`/advisor/login`) → Token eingeben → Liste seiner Pakete

## 8. Abhängigkeiten

- M04 (DATEV-Export) — produziert die Monatspakete, die hier verfügbar gemacht werden
- M07 / M08 — optionale Zusatz-Reports im Paket
- Audit-Service

## 9. Bekannte Grenzen

- Aktuell ein Berater pro Tenant (mehrere Berater technisch möglich, UI nur eine Liste)
- Keine 2FA für Berater — Token reicht (akzeptiertes Risiko, Berater haben nur Read-Only)
- Berater-UI ist sehr schlicht (kein Branding-Customizing pro Tenant)

## 10. Acceptance Criteria

- [x] Berater kann sich mit Token einloggen
- [x] Liste zeigt nur Tenant-eigene Exporte
- [x] Download enthält DATEV-CSV + alle referenzierten Beleg-PDFs als Zip
- [x] DEPRECATED-Endpoints liefern weiter Daten, setzen aber `X-Deprecated: true` Header
- [x] Audit-Log erfasst jeden Login + Download
- [x] Token-Rotation invalidiert alten Token sofort

---

## Hinweis zur Umbenennung

Sinnvoll wäre, das Code-Verzeichnis von `m06-advisor-portal/` auf `m13-advisor-portal/` umzubenennen, damit die Konvention (Modul-ID = Ordner-Prefix) wieder stimmt. Aktuell unterlassen, weil:

1. Es bedeutet `app.ts`-Imports + Test-Pfade umbiegen
2. Die Tests sind grün, der Code stabil
3. Konzeptionell ist M13 hier dokumentiert, das ist die Quelle der Wahrheit

**Empfehlung für nächsten Refactor-Sprint:** Umbenennen, wenn ohnehin am Modul gearbeitet wird.
