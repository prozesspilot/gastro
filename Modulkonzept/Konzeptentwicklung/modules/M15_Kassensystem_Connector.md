# M15 — Kassensystem-Connector

> **Status (2026-05-15):** Teilimplementiert. OAuth-Flow + POS-Credentials implementiert; Tagesabschluss-Pull in Arbeit.
> **Code-Zielort:** `backend/src/modules/m15-pos-connector/`, `n8n/workflows/WF-M15-*.json`
> **Migration:** `022_pos_credentials.sql` (POS-OAuth-Credentials-Tabelle) + `040_kasse.sql` (Kasse-Integrationen + Tagesabschluss-Tabelle `kasse_transactions`).
> **Audit-Finding F14 (2026-05-26):** Spec hatte fälschlicherweise `040_pos_credentials.sql` + `041_pos_daily_close.sql` angegeben. Real existieren `022_pos_credentials.sql` und `040_kasse.sql`. Die Tabelle `pos_daily_close` heißt im Code `kasse_transactions` (nähere Erklärung in §3.2).
> **Paket:** Standard, Pro, Filiale (nicht Solo — Solo-Wirte haben oft keine Cloud-Kasse)
> **Vorausgesetzt durch:** Pilot-Wirt nutzt SumUp Lite

---

## 1. Zweck

Automatischer Import von Tagesabschluss-Daten aus Cloud-Kassensystemen. Ergänzt manuell hochgeladene Belege um automatische Tagesumsatz-Buchungen. Reduziert Wirt-Aufwand auf nahe null bei Cloud-Kassen-Nutzern.

### 1.1 Was M15 löst

- **Z-Bon-Erfassung:** Tagessumme + MwSt-Splitting aus der Kasse — automatisch statt manuell
- **TSE-Konformität:** Daten kommen direkt aus dem TSE-konformen System, kein Foto nötig
- **Bargeld-Dokumentation:** Bargeld-Tagessumme wird mit erfasst (sonst Lücke)
- **Tagesabschluss-Pflicht:** Wirt muss täglich Z-Bon erstellen (Kassennachschau-Pflicht), wir machen das automatisch dokumentierbar
- **Kombination mit Belegen:** Wareneinsatz-Belege (von M01–M03) + Tageserlös (M15) ergeben vollständiges Bild

### 1.2 Was M15 nicht ist

- **Kein Kassensystem-Ersatz** — die Kasse bleibt die Kasse, wir lesen nur aus
- **Kein POS-Einstellungs-Tool** — keine Artikel-Pflege, keine Preise ändern
- **Kein Inventur-Tool** — auch wenn theoretisch aus Daten ableitbar
- **Kein Teilen-Modul** — keine Trinkgeld-Verteilung pro Servicekraft

---

## 2. Unterstützte Kassensysteme

### 2.1 MVP (Pilot-Start)

| Kasse | Variante | API-Verfügbarkeit | Aufwand Adapter |
|---|---|---|---|
| **SumUp Lite** | Mobiles Kartenterminal mit App | REST-API über SumUp Developer-Portal | ~1 Woche |
| **SumUp POS Pro** | Voll-Kassensystem | REST-API gleicher Endpoint | minimal extra (gleiche API) |

### 2.2 Phase 2 (nach Pilot, ab ~10 Tenants Bedarf)

| Kasse | Anteil Markt | API-Aufwand |
|---|---|---|
| **orderbird** | hoch in Berlin/München | ~1 Woche, REST-API verfügbar |
| **Lightspeed Restaurant** | mittel | ~1 Woche |
| **ready2order** | mittel-hoch in DE/AT | ~1 Woche |

### 2.3 Phase 3 (TSE-Datei-Import für klassische Kassen)

| Kasse | Workflow |
|---|---|
| **Vectron** | TSE-Export-Datei (XML) per E-Mail-Forwarding hochladen |
| **Hypersoft** | TSE-Export-Datei manuell hochladen |
| **Casio TSE** | analog |

### 2.4 Klassische Papier-Kassen

Diese bekommen kein Modul — Wirt fotografiert Z-Bon einmal täglich, M01 OCR + M03 mit Tag "z_bon" reicht.

---

## 3. Datenmodell

### 3.1 Tabelle `pos_credentials`

```sql
CREATE TABLE pos_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pos_system VARCHAR(30) NOT NULL,                  -- 'sumup_lite' / 'sumup_pos_pro' / 'orderbird' / ...
  pos_account_id VARCHAR(100) NOT NULL,             -- ID des Wirts-Accounts beim POS-Anbieter
  access_token_encrypted BYTEA NOT NULL,            -- pgcrypto AES
  refresh_token_encrypted BYTEA NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[],                                    -- gewährte OAuth-Scopes
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ NULL,
  UNIQUE (tenant_id, pos_system)                    -- ein POS-System pro Tenant
);

CREATE INDEX idx_pos_credentials_tenant ON pos_credentials(tenant_id);

ALTER TABLE pos_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pos_credentials
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

### 3.2 Tabelle `kasse_transactions` (Spec-Name war `pos_daily_close`)

> **Hinweis (Audit-Finding F14, 2026-05-26):** Die Spec verwendete ursprünglich den Namen `pos_daily_close`. Im realen Code (Migration `040_kasse.sql`) heißt diese Tabelle `kasse_transactions`. Die Migration enthält außerdem eine Tabelle `kasse_integrations` (entspricht `pos_credentials` aus der Spec, ergänzt `022_pos_credentials.sql`). Die Spec-Struktur unten bleibt als Soll-Referenz — der Code weicht im Tabellennamen ab, nicht in der Semantik.

```sql
-- Real-Name im Code: kasse_transactions (in backend/migrations/040_kasse.sql)
-- Spec-Name: pos_daily_close (veraltet)
CREATE TABLE pos_daily_close (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pos_system VARCHAR(30) NOT NULL,
  business_date DATE NOT NULL,                      -- Geschäftstag (kann von Kalendertag abweichen, z.B. 5 Uhr morgens)
  total_brutto DECIMAL(10,2) NOT NULL,
  total_netto DECIMAL(10,2) NOT NULL,
  ust_19_brutto DECIMAL(10,2) DEFAULT 0,            -- Speisen vor Ort, Alkohol, Getränke
  ust_19_netto DECIMAL(10,2) DEFAULT 0,
  ust_19_amount DECIMAL(10,2) DEFAULT 0,
  ust_7_brutto DECIMAL(10,2) DEFAULT 0,             -- Speisen außer Haus
  ust_7_netto DECIMAL(10,2) DEFAULT 0,
  ust_7_amount DECIMAL(10,2) DEFAULT 0,
  ust_0_brutto DECIMAL(10,2) DEFAULT 0,             -- Pfand, durchlaufende Posten
  payment_method_split JSONB,                        -- {"cash": 234.50, "card": 1837.00, "other": 12.00}
  transaction_count INTEGER DEFAULT 0,
  raw_data JSONB,                                    -- Original-API-Response für Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  exported_to_accounting BOOLEAN DEFAULT false,
  exported_at TIMESTAMPTZ NULL,
  UNIQUE (tenant_id, pos_system, business_date)
);

CREATE INDEX idx_pos_daily_close_tenant_date ON pos_daily_close(tenant_id, business_date);
CREATE INDEX idx_pos_daily_close_unexported ON pos_daily_close(tenant_id) WHERE exported_to_accounting = false;

ALTER TABLE pos_daily_close ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pos_daily_close
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

### 3.3 Erweiterung `tenants`

Bereits in `Onboarding_Wizard.md` vorgesehen:

```sql
ALTER TABLE tenants ADD COLUMN pos_system VARCHAR(30) NULL;
-- Werte: 'sumup_lite' / 'sumup_pos_pro' / 'orderbird' / 'lightspeed' / 'ready2order' / NULL
```

---

## 4. SumUp-Adapter (MVP)

### 4.1 Setup bei SumUp Developer Portal

- App registriert: "ProzessPilot POS-Connector"
- OAuth-Redirect-URI: `https://api.prozesspilot.net/api/v1/m15/oauth/sumup/callback`
  > **Korrektur (Audit-Finding F16, 2026-05-26):** Spec hatte fälschlicherweise `/api/m15/…` angegeben. Realer Pfad laut `backend/src/app.ts` und `.env.example`: `/api/v1/m15/oauth/sumup/callback` (mit `/v1/`-Präfix).
- Scopes: `transactions.history.read`, `user.profile_readonly`
- Client-ID + Secret in `.env.prod`

### 4.2 OAuth-Flow

```
1. Wirt im Onboarding-Wizard Schritt 6: "Mit SumUp verbinden"
   → Frontend: GET /api/v1/m15/oauth/sumup/start?wizard_token=<TOKEN>
2. Backend:
   a. Generiert state-Token, speichert in Redis
   b. Redirect zu SumUp:
      https://api.sumup.com/authorize?
        response_type=code&
        client_id=<CLIENT_ID>&
        redirect_uri=<URI>&
        scope=transactions.history.read user.profile_readonly&
        state=<state>
3. Wirt loggt sich bei SumUp ein, bestätigt Berechtigungen
4. SumUp redirected zu /api/v1/m15/oauth/sumup/callback?code=<code>&state=<state>
5. Backend:
   a. Validiert state
   b. Tauscht code gegen Tokens:
      POST https://api.sumup.com/token
   c. Holt User-Info: GET /v0.1/me
      → pos_account_id (= SumUp Merchant-Code)
   d. Speichert in pos_credentials (encrypted)
   e. Test-Pull: GET /v0.1/me/transactions/history?limit=1
      → bestätigt Verbindung funktioniert
   f. Setzt tenants.pos_system = 'sumup_lite'
   g. Redirect zurück zum Wizard mit Bestätigung
```

### 4.3 Daily-Pull

- **Cron:** täglich 23:30 Uhr (per `WF-CRON-DAILY-POS-PULL.json` in n8n)
- Für jeden Tenant mit `pos_credentials.active = true`:
  - n8n triggert `POST /api/m15/pull/{tenant_id}`
  - Backend pullt SumUp-API: `GET /v0.1/me/transactions/history?from={today_start}&to={today_end}`
  - Aggregiert: total_brutto, MwSt-Splitting, Zahlungsweise-Splitting
  - Speichert in `pos_daily_close`
  - Triggert Event `pp.pos.daily_close_imported`
  - Event-Listener (in M04/M05) erzeugt entsprechende Buchung

### 4.4 Manueller Pull (aus Mitarbeiter-Webapp)

- Mitarbeiter in Tenant-Detail: "POS-Pull jetzt durchführen" Button
- POST /api/m15/pull/{tenant_id}?date=2026-05-15
- Gleicher Code-Pfad wie Cron-Pull

### 4.5 Token-Refresh

- SumUp-Token läuft ab (typisch 60 Tage)
- Background-Job alle 24h prüft `token_expires_at`
- Bei < 7 Tage Restlaufzeit: Refresh via Refresh-Token
- Bei Refresh-Token expired oder revoked:
  - `pos_credentials.active = false` setzen
  - Auto-Task: "SumUp-Reauth bei Tenant X"
  - Mitarbeiter sendet Magic-Link an Wirt für Re-OAuth

---

## 5. MwSt-Splitting-Logik

### 5.1 Wie SumUp die Daten liefert

SumUp-Transaktionen haben pro Position:
- Beschreibung
- Brutto-Preis
- MwSt-Satz (vom Wirt im Kassensystem konfiguriert)

### 5.2 Wie wir splitten

```typescript
interface DailyClose {
  ust_19: { brutto: number; netto: number; amount: number };
  ust_7: { brutto: number; netto: number; amount: number };
  ust_0: { brutto: number; netto: number; amount: number };  // Pfand etc.
}

function aggregateDailyClose(transactions: SumUpTransaction[]): DailyClose {
  const result = {
    ust_19: { brutto: 0, netto: 0, amount: 0 },
    ust_7: { brutto: 0, netto: 0, amount: 0 },
    ust_0: { brutto: 0, netto: 0, amount: 0 },
  };

  for (const tx of transactions) {
    for (const item of tx.line_items) {
      const rate = item.vat_rate;
      const brutto = item.total_amount;
      const netto = brutto / (1 + rate / 100);
      const tax = brutto - netto;

      if (rate === 19) {
        result.ust_19.brutto += brutto;
        result.ust_19.netto += netto;
        result.ust_19.amount += tax;
      } else if (rate === 7) {
        result.ust_7.brutto += brutto;
        result.ust_7.netto += netto;
        result.ust_7.amount += tax;
      } else if (rate === 0) {
        result.ust_0.brutto += brutto;
        result.ust_0.netto += brutto;
      }
      // unbekannte Sätze: in audit_log + Mitarbeiter-Task
    }
  }

  return result;
}
```

### 5.3 Wenn Wirt MwSt-Sätze in SumUp falsch konfiguriert hat

Auto-Task: "Tenant X — Beleg mit unerwartetem MwSt-Satz Y%". Mitarbeiter prüft + korrigiert ggf. mit Wirt zusammen.

---

## 6. Buchungs-Übergabe an Steuerberater

### 6.1 In DATEV-CSV-Export (M04)

Der Tagesabschluss wird als Sammel-Buchung an den Steuerberater übergeben:

```
Tagesabschluss 2026-05-15 Müller-Bistro
- Konto 8400 Erlöse 19% USt: 1.234,56 € netto / 234,57 € USt
- Konto 8300 Erlöse 7% USt: 567,89 € netto / 39,75 € USt
- Konto 1000 Kasse Bargeld: 234,50 €
- Konto 1361 Kreditkarte: 1.837,00 €
- Konto 1730 Pfand-Forderungen: 12,00 €
```

### 6.2 In Lexware Office API-Push (M05)

Analog, aber via Lexware-Buchungs-API direkt.

### 6.3 Z-Bon als PDF

- Pro Tag: PDF mit Tagesabschluss-Detail (für GoBD-Archiv)
- Speicherung in MinIO unter `tenants/<tenant_id>/zbon/<date>.pdf`
- Verlinkt im Steuerberater-Übergabe-Mail (M08)

---

## 7. n8n-Workflows

### 7.1 `WF-CRON-DAILY-POS-PULL.json`

- Trigger: Cron 23:30 Uhr täglich
- Loop: alle aktiven Tenants mit POS-Connector
- HTTP-Call: POST `/api/m15/pull/{tenant_id}` mit HMAC-Auth
- Bei Fehler: Retry 3× (5min/30min/3h), dann Auto-Task

### 7.2 `WF-M15-SUMUP-PULL.json` (Sub-Workflow)

- Wird von Master gerufen
- Bekommt tenant_id + Datum
- Ruft Backend, das die SumUp-API anspricht
- Gibt Ergebnis-JSON an Master zurück

---

## 8. API-Endpoints

> **Pfad-Korrektur (Audit-Finding F16):** Alle Pfade verwenden den `/api/v1/`-Präfix (wie in `backend/src/app.ts` und `.env.example`). Spec hatte fälschlicherweise `/api/` ohne `v1` angegeben.

| Methode | Pfad | Zweck | Auth |
|---|---|---|---|
| GET | /api/v1/m15/oauth/sumup/start | OAuth-Flow initiieren | Wizard-Token oder Mitarbeiter |
| GET | /api/v1/m15/oauth/sumup/callback | OAuth-Callback verarbeiten | öffentlich |
| POST | /api/v1/m15/pull/:tenant_id | Manueller Pull | HMAC oder Mitarbeiter |
| GET | /api/v1/m15/daily-close/:tenant_id | Tagesabschluss-Liste | Mitarbeiter |
| GET | /api/v1/m15/daily-close/:tenant_id/:date | einzelner Tagesabschluss | Mitarbeiter |
| POST | /api/v1/m15/reauth/:tenant_id | Re-OAuth-Link generieren | Mitarbeiter |
| DELETE | /api/v1/m15/connection/:tenant_id | Verbindung trennen | Mitarbeiter |

---

## 9. Externe Abhängigkeiten

- **SumUp API:** https://developer.sumup.com — OAuth 2.0, REST
- **Rate-Limits:** SumUp erlaubt 60 Requests/Min — sehr großzügig für unseren Use-Case
- **Subunternehmer-Eintrag:** SumUp Payments S.A.S. (Frankreich, EU) — DSGVO-relativ einfach

---

## 10. Tests

### 10.1 Unit-Tests

- MwSt-Splitting-Logik mit verschiedenen Szenarien
- Token-Encryption/Decryption
- Aggregation bei leerem Tag (kein Umsatz)
- Datum-Logik bei Geschäftstag-Übergang nach Mitternacht

### 10.2 Integration-Tests

- Voller OAuth-Flow gegen SumUp-Sandbox
- Daily-Pull mit Mock-Daten
- Token-Refresh bei abgelaufenem Token
- Webhook-Retry bei SumUp-Ausfall

### 10.3 E2E-Tests

- Wizard-Schritt 6: Wirt verbindet SumUp-Sandbox
- Test-Pull aus Mitarbeiter-Webapp triggert
- Daten erscheinen in `kasse_transactions` (Code-Name, Spec-Name war `pos_daily_close`)

---

## 11. Implementations-Reihenfolge

### 11.1 P1.1 (KW 22)

- DB-Migration `022_pos_credentials.sql` (POS-Credentials) + `040_kasse.sql` (Kasse-Integrationen + `kasse_transactions`) — Spec hatte fälschlicherweise `040_pos_credentials.sql` + `041_pos_daily_close.sql`
- SumUp-Developer-Account anlegen
- OAuth-Endpoints implementieren
- Manueller Pull-Endpoint

### 11.2 P1.2 (KW 24)

- n8n-Workflow `WF-CRON-DAILY-POS-PULL`
- Token-Refresh-Background-Job
- Wizard-Integration (Schritt 6)
- Tests

### 11.3 P1.2 / 1.3

- Echter Pilot-Wirt verbindet SumUp Lite
- Daily-Pull läuft täglich
- Erste Steuerberater-Übergabe enthält Tagesabschlüsse

### 11.4 Phase 2 (M3+)

- orderbird-Adapter
- Lightspeed-Adapter
- ready2order-Adapter

### 11.5 Phase 3

- TSE-Datei-Import für klassische Kassen
- Reconciliation-Funktion (Vergleich erwartet vs. tatsächlich)

---

## 12. Sonderfälle / Edge-Cases

| Fall | Handling |
|---|---|
| Wirt hat 2 Tage keinen Umsatz (Ruhetag) | Leerer Tagesabschluss-Eintrag (alle 0,00) wird angelegt — gut für Lückenlosigkeits-Nachweis |
| SumUp-API down | Retry 3×, dann Task an Mitarbeiter, manuelle Wiederholung am nächsten Tag möglich |
| Wirt ändert MwSt-Sätze in SumUp während Tag läuft | Daten werden mit Sätzen zum Transaktions-Zeitpunkt importiert (SumUp liefert das so) |
| Wirt deaktiviert SumUp-Account | Bei nächstem Pull: 401-Fehler, `pos_credentials.active = false`, Mitarbeiter-Task |
| Wirt hat mehrere SumUp-Geräte | Alle Transaktionen kommen über den gleichen Account, kein Setup-Aufwand |
| Tag mit Stornierungen | Stornierungen werden negativ gewertet, Tagesabschluss zeigt Netto-Summe nach Storno |

---

## 13. Bezug zu anderen Dokumenten

- `Onboarding_Wizard.md` — Schritt 6: SumUp-Verbindung
- `M04_DATEV_Export.md` — Tagesabschluss als DATEV-Buchung
- `M05_Lexoffice_Integration.md` — Lexware-Push
- `M08_Monatsreporting.md` — Tagesabschlüsse im Monatsbericht
- `Mitarbeiter_Webapp.md` — Tenant-Detail-View zeigt POS-Status

---

## 14. Was bewusst nicht in M15 ist

- **Trinkgeld-Verteilung pro Servicekraft** — zu komplex, eigenes Lohn-Modul
- **Live-Status der Kasse** (Verkäufe in Echtzeit) — wir sind Tagesabschluss-Tool
- **Artikel-Stamm-Sync** — wir sind nicht POS-Manager
- **Inventur-Ableitung** — eigenes Themengebiet
- **Bargeld-Bestands-Abgleich** — Wirt muss selbst zählen, wir sind nur Übergabe-Tool

---

## 15. Zusammenfassung in einem Absatz

M15 ist ein neues Modul, das Tagesabschluss-Daten aus Cloud-Kassensystemen automatisch importiert und an die Steuerberater-Übergabe (M04/M05) anbindet. MVP mit SumUp-Adapter (Lite + POS Pro) für Pilot-Wirt. OAuth-Flow im Onboarding-Wizard, täglicher Cron-Pull um 23:30, MwSt-Splitting (19% / 7% / 0%), Zahlungsweise-Splitting (Bargeld / Karte / Sonstige). Tagesabschluss wird als Sammel-Buchung in DATEV-CSV oder Lexware-Push übergeben. Z-Bon-PDFs werden für GoBD-Archiv generiert. Phase-2-Adapter geplant für orderbird, Lightspeed, ready2order. Phase-3 für TSE-Datei-Import bei klassischen Kassen.

---

**Letzte Aktualisierung:** 2026-05-15 (Erstfassung)
**Verantwortlich:** Andreas (Backend + n8n), Steve (Wirt-Onboarding)
