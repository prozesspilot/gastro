# Onboarding-Wizard — Customer-Setup-Frontend

> **Status:** Erstfassung 2026-05-15
> **Zielgruppe:** Steve (Frontend), Andreas (Backend), Vertriebsagentur (Sales-Argument)
> **Verhältnis zu anderen Dokumenten:** Setzt `00_Architektur_Hauptdokument.md`, `Mitarbeiter_Webapp.md` voraus.

---

## 1. Was der Onboarding-Wizard ist

Der **Onboarding-Wizard** ist ein **einmaliger, geführter Setup-Flow** für neue Endkunden (Wirte). Erreichbar unter `setup.prozesspilot.net/{token}`.

### 1.1 Was der Wizard ist

- **Einmaliger Klick-Flow** für die Setup-Phase eines neuen Tenants
- **Magic-Link-basiert** — keine Account-Erstellung, kein Passwort
- **Self-Service-Variante** im Setup-Fee enthalten
- **Premium-Setup-Variante** als Aufpreis: ProzessPilot-Mitarbeiter macht alles, Wirt schickt nur Logins

### 1.2 Was der Wizard NICHT ist

- **Kein Customer-Portal** — nach Setup-Abschluss ist der Wizard für den Wirt vorbei
- **Kein Login-System** — Wirt loggt sich nie wieder ein
- **Keine laufende Customer-UI** — für Klärungen kommt das Web-Chat-Widget
- **Kein Modul** — eigenständiges Frontend mit Backend-Service

### 1.3 Übergangs-Zustand

```
[Vertrag unterschrieben]
        │
        │ Backend erstellt Tenant + Magic-Link
        │ Setup-Mail an Wirt mit Link
        ▼
[Wirt klickt Magic-Link → Wizard öffnet]
        │
        │ Wirt klickt durch Schritte
        │ ODER bei Premium-Setup: PP-Mitarbeiter macht es im Backend
        ▼
[Wizard abgeschlossen → Auto-Task in Mitarbeiter-Dashboard]
        │
        │ PP-Mitarbeiter prüft + schaltet frei
        ▼
[Tenant ist live → Wirt nutzt nur noch WhatsApp + Web-Chat-Widget]
```

---

## 2. Wizard-Schritte (Self-Service-Variante)

### 2.1 Übersicht

Sieben Schritte, geschätzt 15–25 Minuten Wirt-Zeit:

1. **Stammdaten** (5 Min) — Firma, USt-ID, Steuernummer, Adresse
2. **Steuerberater-Setup** (3 Min) — Kontakt, System-Auswahl
3. **OAuth Steuerberater-Tool** (5 Min, optional je nach System)
4. **Eingangskanal Setup** (5 Min) — WhatsApp ODER E-Mail
5. **Archiv-Verbindung** (3 Min) — Google Drive ODER Dropbox
6. **Kassensystem-Verbindung** (5 Min, optional) — SumUp OAuth
7. **Test-Beleg + Bestätigung** (3 Min)

Jeder Schritt mit:
- Klare Erklärung am Anfang ("Was passiert in diesem Schritt?")
- Help-Bubble bei jedem Eingabefeld ("Wo finde ich das?")
- "Weiter"-Button erst aktiv wenn Pflichtfelder ausgefüllt
- Möglichkeit "Schritt überspringen — wir machen es für dich" (löst Premium-Setup-Aufgabe aus)
- Fortschritts-Anzeige oben (Schritt X von 7)

### 2.2 Schritt 1 — Stammdaten

**Was abgefragt wird:**

| Feld | Pflicht | Validation |
|---|---|---|
| Firmenname | ja | mind. 3 Zeichen |
| Rechtsform | ja | Dropdown (Einzelunternehmen / GbR / UG / GmbH / GmbH&Co.KG / Sonstige) |
| Inhaber/Geschäftsführer | ja | Name |
| Adresse | ja | Straße, PLZ, Stadt |
| USt-ID | optional (nicht jeder hat) | Format-Prüfung "DE..." |
| Steuernummer | ja | Format-Prüfung deutsche Steuernummer |
| Telefon | ja | Mobilnummer für Rückfragen |
| E-Mail | ja | Format-Prüfung |
| Branche | ja | Dropdown — Default: Restaurant / Café / Bar / Imbiss / Foodtruck / Catering / Sonstige Gastro |
| Mitarbeiter-Anzahl | ja | Range-Slider 1–50 |
| Geschätztes Belegvolumen pro Monat | ja | Range-Slider 0–800 (für Paket-Empfehlung) |
| Aktuelle Steuerberater-Kosten pro Monat | optional | für Spar-Rechner |

**Help-Bubbles:**
- USt-ID: "Falls du noch keine hast: in Schritt 2 fragt dein Steuerberater dich danach."
- Steuernummer: "Steht auf jedem Brief vom Finanzamt — Format z.B. 11/123/45678"
- Belegvolumen: "Schätze ungefähr — wir korrigieren in Monat 1 anhand deiner echten Daten."

### 2.3 Schritt 2 — Steuerberater-Setup

**Was abgefragt wird:**

| Feld | Pflicht | Hinweis |
|---|---|---|
| Steuerberater-Kanzlei | ja | Name |
| Ansprechpartner | ja | Name |
| E-Mail Steuerberater | ja | für monatliche Übergabe |
| Telefon Steuerberater | optional | für Notfall |
| Welches System nutzt der Steuerberater? | ja | Dropdown |

**Dropdown-Optionen Steuerberater-System:**

- **Lexware Office** (Cloud, früher Lexoffice) — empfohlen
- **DATEV Unternehmen Online** (DUO) — sehr verbreitet
- **DATEV klassisch** — nur CSV-Übergabe per Mail
- **sevDesk** — eher selten bei Steuerberatern
- **Lexware Pro / Premium / büro easy** — Desktop-Variante, nur CSV
- **Stotax** — nur CSV
- **Addison** — nur CSV
- **Anderes / weiß ich nicht** — wir kontaktieren ihn

**Help-Bubble bei "weiß ich nicht":**
> "Kein Problem — Premium-Setup wählen oder einfach Schritt überspringen, wir kontaktieren deinen Steuerberater direkt und klären das."

**Auto-Aktion:** Bei Auswahl wird das passende Backend-Modul (M04 / M05 / M06 / Fallback-CSV) automatisch für diesen Tenant aktiviert.

### 2.4 Schritt 3 — OAuth Steuerberater-Tool

**Nur sichtbar wenn:** Steuerberater-System unterstützt API-Push (Lexware Office, DATEV Online, sevDesk).

**Bei Lexware Office:**

- Erklärung: "Wir verbinden uns direkt mit dem Lexware-Konto deines Steuerberaters. Das spart deinem Steuerberater Zeit und dir Geld."
- Button "Mit Lexware Office verbinden"
- Redirect zu Lexware OAuth
- Wirt loggt sich entweder selbst ein (wenn er Mitzugang hat) oder leitet den Link an Steuerberater weiter
- Nach Authorisierung: Token in Backend gespeichert (verschlüsselt)
- Bestätigung: "✓ Verbindung mit Lexware Office hergestellt"

**Bei DATEV Online (DUO):**

- Hinweis: "DATEV Direct-Push ist Phase 3 (geplant Q4 2027). Derzeit übergeben wir die Buchungen monatlich per Mail an deinen Steuerberater."
- Button "Verstanden — weiter"
- Auto-Setup: M04 DATEV-CSV-Export für monatliche Mail aktiviert

**Bei DATEV klassisch / Lexware Desktop / Stotax / Addison / Anderes:**

- Hinweis: "Dein Steuerberater nutzt ein Desktop-System. Wir generieren monatlich eine DATEV-CSV-Datei und schicken sie per Mail an ihn — das kann jedes dieser Systeme problemlos importieren."
- Button "Verstanden — weiter"

### 2.5 Schritt 4 — Eingangskanal Setup

**Was abgefragt wird:**

> "Wie schickst du uns am liebsten deine Belege?"

**Optionen:**

- 📱 **WhatsApp** (empfohlen) — "Foto vom Lieferschein, abschicken, fertig"
- 📧 **E-Mail** — "Foto/PDF an deine eigene Beleg-Mail-Adresse"
- 🔄 **Beide** (für maximale Flexibilität)

**Bei WhatsApp ausgewählt:**

- Erklärung: "Wir geben dir gleich eine WhatsApp-Nummer. Du speicherst sie als 'ProzessPilot' im Handy und schickst Foto vom Lieferschein. Fertig."
- Während Pilot-Phase: Hinweis "Wir nutzen Twilio bis Meta-Verifizierung durch ist (~6–10 Wochen). Danach wechselst du auf eine offizielle WhatsApp-Business-Nummer ohne Datenverlust."
- Vorgemerkt: bei P1.3 erfolgt Migration

**Bei E-Mail ausgewählt:**

- Wirt bekommt automatisch generierte Mail-Adresse: `t-{tenant-id}@beleg.prozesspilot.net`
- Anleitung: "Lade Beleg als Foto/PDF hoch → schick an diese Mail. Mehrere Anhänge in einer Mail OK."
- Optional: Eigenes Mail-Forwarding einrichten (z.B. Wirts-Lieferanten-Rechnungs-Mail forwarden)

### 2.6 Schritt 5 — Archiv-Verbindung

**Was abgefragt wird:**

> "Wo sollen deine Belege als Original archiviert werden? (10 Jahre GoBD-Pflicht)"

**Optionen:**

- 🟢 **Google Drive** (empfohlen) — kostenlos bis 15 GB
- 🔵 **Dropbox** — alternative Cloud
- ⚪ **ProzessPilot-eigenes Archiv** (erst Phase 3)

**Bei Google Drive ausgewählt:**

- Button "Mit Google Drive verbinden"
- OAuth-Flow zu Google
- Wirt bestätigt Berechtigungen (nur Schreibzugriff auf einen einzigen Ordner "ProzessPilot/")
- Bestätigung: "✓ Drive-Ordner 'ProzessPilot/' angelegt"

**Bei Dropbox ausgewählt:**

- Analoger OAuth-Flow zu Dropbox

### 2.7 Schritt 6 — Kassensystem-Verbindung (optional)

**Was abgefragt wird:**

> "Hast du ein Kassensystem? Dann können wir Tagesabschlüsse automatisch importieren."

**Optionen:**

- ✅ **Ja, SumUp** — direkt verbinden
- ⏳ **Ja, anderes Cloud-System** (orderbird / Lightspeed / ready2order) — "Wir bauen den Adapter wenn der erste Kunde fragt — meld dich beim Support."
- 📃 **Nein / klassische Kasse** — "Ok, Z-Bon einfach täglich fotografieren wie andere Belege auch."
- ⏭️ **Überspringen** — "Mache ich später."

**Bei SumUp ausgewählt:**

- Auswahl SumUp-Variante (Solo / Lite / POS Pro / Standalone-Kartenterminal)
- Button "Mit SumUp verbinden"
- OAuth-Flow zu SumUp
- Test-Pull: Tagesabschluss heute holen
- Bestätigung: "✓ SumUp verbunden — letzter Tagesabschluss Datum X, Brutto Y €"

### 2.8 Schritt 7 — Test-Beleg + Bestätigung

**Was passiert:**

- Erklärung: "Lass uns einen Test-Beleg durchspielen, damit du siehst wie's funktioniert."
- Bei WhatsApp: "Mach jetzt ein Foto von einem alten Beleg und schick es an die ProzessPilot-Nummer. Wir warten."
- Bei E-Mail: "Schick eine Mail mit einem alten Beleg-PDF an [generierte Adresse]."
- Live-Polling: sobald der Test-Beleg im Backend ankommt, wird das im Wizard angezeigt
- "✓ Erster Beleg empfangen!"
- Vorschau: erkannter Lieferant, Betrag, Datum
- Wirt kann Korrekturen eintragen (Lerneffekt)

**Abschluss-Zusammenfassung:**

```
✅ Setup abgeschlossen!

Was als nächstes passiert:
- Innerhalb 24h prüft ein ProzessPilot-Mitarbeiter dein Setup.
- Du bekommst eine Bestätigungs-Mail wenn alles klar ist.
- Ab dann kannst du täglich Belege schicken.
- Erste Übergabe an deinen Steuerberater am 1. nächsten Monats.

Bei Fragen: Antworte einfach auf eine unserer Mails oder WhatsApps.
```

**Auto-Aktion:**

- Backend setzt Tenant-Status auf "wartet_auf_freischaltung"
- Auto-Task im Mitarbeiter-Dashboard: "Tenant X freischalten + Test-Beleg validieren"
- Discord-Notification in `#onboarding`

---

## 3. Premium-Setup-Variante

### 3.1 Wann angeboten

- Im Vertrags-Abschluss als "+199 € einmalig" Add-On
- Während des Wizards: Bei jedem Schritt "Schritt überspringen — wir machen es für dich" Button
- Wenn Wirt im Wizard hängenbleibt (z.B. > 5 Min auf einem Schritt): Auto-Vorschlag "Möchtest du Premium-Setup buchen? Wir machen alles für dich."

### 3.2 Wie Premium-Setup abläuft

1. Wirt füllt nur Schritt 1 (Stammdaten) selbst aus
2. Klickt "Premium-Setup buchen" — Setup-Fee wird auf €499 + €199 = €698 erhöht
3. Auto-Task in Mitarbeiter-Dashboard: "Premium-Setup für Tenant X durchführen"
4. PP-Mitarbeiter:
   - Ruft Wirt an, sammelt fehlende Daten
   - Kontaktiert Steuerberater telefonisch wenn nötig
   - Macht OAuth-Flows selbst (Wirt schickt Logins per Mail/WhatsApp)
   - Schaltet Tenant frei
5. Bestätigungs-Mail an Wirt: "Setup komplett, du kannst loslegen."

### 3.3 Wirtschaftlichkeit

- Aufpreis €199, davon 50% an Vertriebsagentur = €99,50 für PP
- ~1.5 Std PP-Mitarbeiter-Aufwand
- Effektiver Stundensatz für PP: ~€66/Std — knapp aber rentabel wenn als Skalierungs-Vehikel

---

## 4. Tech-Stack

| Schicht | Technologie |
|---|---|
| Frontend | React + Vite + TypeScript + TailwindCSS |
| State | TanStack Query + Zustand |
| Forms | react-hook-form + Zod |
| OAuth | OAuth-Buttons direkt im Frontend mit PKCE für sichere Token-Übergabe |
| Real-Time (Test-Beleg-Empfang) | Server-Sent Events (SSE) — leichter als WebSocket |
| Build-Output | Static HTML + JS, deployt auf `setup.prozesspilot.net` |

### 4.1 Verzeichnisstruktur (`onboarding-wizard/`)

```
onboarding-wizard/
├── src/
│   ├── App.tsx              # Token-Validierung + Router
│   ├── main.tsx
│   ├── steps/
│   │   ├── Step1Stammdaten.tsx
│   │   ├── Step2Steuerberater.tsx
│   │   ├── Step3OAuthAccountant.tsx
│   │   ├── Step4InputChannel.tsx
│   │   ├── Step5Archive.tsx
│   │   ├── Step6POSConnector.tsx
│   │   └── Step7TestReceipt.tsx
│   ├── components/
│   │   ├── ProgressBar.tsx
│   │   ├── HelpBubble.tsx
│   │   ├── FormField.tsx
│   │   └── PremiumUpsellBanner.tsx
│   ├── lib/
│   │   ├── api.ts
│   │   └── oauth.ts
│   └── hooks/
│       └── useWizardSession.ts
└── tests/
```

---

## 5. Datenmodell (relevante Tabellen)

### 5.1 Tabelle `onboarding_sessions`

```sql
CREATE TABLE onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  token VARCHAR(64) UNIQUE NOT NULL,
  status VARCHAR(30) DEFAULT 'started',         -- started / completed / abandoned / premium_handoff
  current_step INTEGER DEFAULT 1,
  step_data JSONB,                              -- gespeicherte Antworten pro Schritt
  premium_setup_requested BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,              -- default: created_at + 30 Tage
  completed_at TIMESTAMPTZ NULL,
  last_activity_at TIMESTAMPTZ DEFAULT now()
);
```

### 5.2 Tabelle `tenants` (relevante Spalten für Wizard-Output)

```sql
-- Auszug, vollständig in 02_Kundenprofil_System.md
ALTER TABLE tenants ADD COLUMN onboarding_status VARCHAR(30) DEFAULT 'pending'; -- pending / wizard_done / activated
ALTER TABLE tenants ADD COLUMN setup_premium BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN advisor_system VARCHAR(30);                       -- 'lexware_office' / 'datev_csv' / 'sevdesk' / ...
ALTER TABLE tenants ADD COLUMN input_channels VARCHAR(30)[];                     -- ['whatsapp', 'email']
ALTER TABLE tenants ADD COLUMN archive_provider VARCHAR(20);                     -- 'google_drive' / 'dropbox' / 'pp_internal'
ALTER TABLE tenants ADD COLUMN pos_system VARCHAR(30) NULL;                      -- 'sumup_lite' / 'sumup_pos_pro' / NULL
```

---

## 6. Magic-Link-Mechanik

### 6.1 Token-Generierung

- Bei Vertragsabschluss: Backend erstellt `onboarding_sessions`-Record
- Token = 32 Zeichen Base64URL (192 Bit Entropie)
- Gültigkeit: 30 Tage ab Erstellung
- Versendet per E-Mail an Tenant-Kontakt-Adresse

### 6.2 URL-Format

```
https://setup.prozesspilot.net/{token}

Beispiel:
https://setup.prozesspilot.net/Xa9Kp2nM4vQ7sR8tV1wY3zB6cD0eF5gH
```

### 6.3 Session-Persistenz

- Bei jedem Schritt-Abschluss: `step_data`-JSON wird in DB gespeichert
- Wirt kann Wizard zwischendurch verlassen, später mit gleichem Link fortsetzen
- Last-Activity-Timestamp wird aktualisiert

### 6.4 Bei abgelaufenem/abgebrochenem Token

- Klar verständliche Fehlermeldung: "Dieser Setup-Link ist abgelaufen. Klick hier um einen neuen zu bekommen."
- Button → triggert Auto-Task in Mitarbeiter-Dashboard
- Mitarbeiter generiert neuen Link, sendet manuell

---

## 7. UI-Design-Prinzipien

### 7.1 Mobile-First

- Wirt nutzt das wahrscheinlich am Handy
- Vollbild-Schritt-Layout (kein Multi-Column)
- Große Buttons (mind. 56px Höhe)
- Eingabefelder weit auseinander

### 7.2 Sprache

- Du-Anrede konsequent
- Einfache Sprache, keine Tech-Jargon
- "Wir" für ProzessPilot
- "Dein Steuerberater" statt "der Steuerberater" (Beziehung betonen)

### 7.3 Visualisierung

- Fortschritts-Balken oben (immer sichtbar)
- Check-Häkchen für abgeschlossene Schritte
- Aktueller Schritt blau hervorgehoben
- Nächste Schritte grau (Vorschau)

### 7.4 Sicherheit + Vertrauen

- Hinweise auf Datensicherheit ("Daten in EU, verschlüsselt")
- DSGVO-Hinweis kurz aber klar
- Setup-Mitarbeiter wird namentlich vorgestellt ("Steve aus dem ProzessPilot-Team prüft dein Setup")

---

## 8. Help-Bubbles und Hilfe-System

Jedes Eingabefeld hat eine Help-Bubble (Tooltip oder ausklappbar) mit:

- Was genau gefragt ist
- Wo der Wirt es findet
- Beispiel-Wert
- Was passiert wenn falsch eingegeben

Bei kniffligen Schritten zusätzlich:

- "📞 Lieber telefonieren? Klick hier um Premium-Setup zu buchen"
- "🎥 Video-Anleitung ansehen" (Phase 2: kurze Loom-Videos pro Schritt)

---

## 9. Backend-API (Auszug)

| Methode | Pfad | Zweck |
|---|---|---|
| GET | /api/wizard/{token} | Session laden, Step-Daten zurückgeben |
| POST | /api/wizard/{token}/step/{n} | Schritt-Daten speichern, zu Schritt n+1 |
| POST | /api/wizard/{token}/complete | Wizard abschließen, Status auf 'completed' |
| POST | /api/wizard/{token}/premium | Premium-Setup buchen, Status auf 'premium_handoff' |
| GET | /api/wizard/{token}/oauth/lexware | OAuth-Flow Lexware initiieren |
| GET | /api/wizard/{token}/oauth/google-drive | OAuth-Flow Google Drive initiieren |
| GET | /api/wizard/{token}/oauth/sumup | OAuth-Flow SumUp initiieren |
| GET | /api/wizard/{token}/test-receipt-status | Polling für Test-Beleg-Empfang (SSE) |

---

## 10. Tests

### 10.1 Unit-Tests (Vitest)

- Form-Validation pro Schritt
- Schritt-Reihenfolge-Logik
- Token-Validierung
- OAuth-Callback-Handling

### 10.2 E2E-Tests (Playwright)

Kritische Flows:

- Vollständiger Wizard-Durchlauf (Schritt 1–7) mit gemockten OAuth-Calls
- Wizard verlassen + zurückkehren (Session-Persistenz)
- Premium-Setup-Buchung
- Abgelaufener Token
- Test-Beleg-Empfang via SSE

---

## 11. Implementations-Reihenfolge

### 11.1 Vor Pilot-Start (KW 21)

- Backend: Magic-Link-Generierung + Session-API
- Frontend-Skelett mit Routing

### 11.2 Pilot-Start (KW 22+)

- **Im Pilot wird der Wizard NICHT aktiv genutzt** — Steve macht Setup manuell für Pilot-Wirt
- Wizard wird parallel gebaut, getestet mit Demo-Daten

### 11.3 Vor Reseller-Launch (KW 30+)

- Vollständiger Wizard live
- Erste Direkt-Kunden durchlaufen Wizard
- Lessons learned eingearbeitet

### 11.4 Phase 2

- Video-Anleitungen pro Schritt (Loom)
- Multi-Sprache (Englisch, Türkisch — nach Bedarf)
- A/B-Testing der Conversion-Quote

---

## 12. Bezug zu anderen Dokumenten

- `Mitarbeiter_Webapp.md` — Tenant-Freischaltung-Workflow nach Wizard-Abschluss
- `M14_User_Verwaltung_Auth.md` — kein Customer-Login, aber Magic-Link-Token-System
- `Web_Chat_Widget.md` — derselbe Magic-Link-Mechanismus
- `Discord_Integration.md` — Auto-Task + Discord-Notification bei Wizard-Abschluss
- `00_Vertriebsmodell.md` — Premium-Setup-Aufpreis und Provision

---

## 13. Was bewusst nicht im Wizard ist

- **Login / Account-Erstellung** — Wirt loggt sich nie ein
- **Belegerfassung** — geht über WhatsApp/Mail, nicht über Wizard
- **Vertragsdaten** — sind schon vor Wizard im System (aus Vertragsabschluss)
- **Pricing-Auswahl** — Paket steht im Vertrag, kann nicht im Wizard geändert werden
- **Bezahlung** — Setup-Fee ist schon bezahlt vor Wizard-Start

---

## 14. Zusammenfassung in einem Absatz

Der Onboarding-Wizard ist ein einmaliger, geführter Setup-Flow für neue Endkunden, erreichbar via Magic-Link unter setup.prozesspilot.net/{token}. Sieben Schritte (Stammdaten, Steuerberater-Setup, OAuth, Eingangskanal, Archiv, Kassensystem, Test-Beleg), geschätzte Wirt-Zeit 15–25 Minuten. Self-Service im Setup-Fee enthalten, Premium-Setup als €199-Aufpreis (PP-Mitarbeiter macht alles, Wirt schickt nur Logins). React + Vite + Mobile-First, OAuth zu Lexware Office / Google Drive / SumUp eingebaut. Session-Persistenz via DB, Token gültig 30 Tage. Nach Abschluss: Auto-Task in Mitarbeiter-Webapp + Discord-Notification → PP-Mitarbeiter prüft + schaltet frei innerhalb 24h.

---

**Letzte Aktualisierung:** 2026-05-15
**Verantwortlich:** Steve (Frontend), Andreas (Backend + OAuth-Flows)
