# Web-Chat-Widget — Customer-Chat-Frontend

> **Status:** Erstfassung 2026-05-15
> **Zielgruppe:** Andreas (Frontend-Entwicklung), Steve (Customer-Kommunikation), Anwalt (Datenschutz-Hinweise)
> **Verhältnis zu anderen Dokumenten:** Setzt `Discord_Integration.md` voraus (für Backend-Bridge). Wird referenziert von `Mitarbeiter_Webapp.md`, `M14_User_Verwaltung_Auth.md` (für Magic-Link-Auth-Flow).

---

## 1. Zweck und Abgrenzung

### 1.1 Was das Web-Chat-Widget ist

Ein leichtgewichtiges, browser-basiertes Chat-Fenster, mit dem **Endkunden (Wirte)** mit dem ProzessPilot-Support kommunizieren können — primär bei Klärungs-Bedarf zu Belegen, Bewirtungs-Notizen, Steuerberater-Übergabe oder allgemeinen Fragen.

### 1.2 Was das Widget ausdrücklich nicht ist

- **Kein Customer-Portal** — Wirte haben keinen Login, keine eigene Account-Verwaltung, keine Beleg-Übersicht im Web
- **Kein Self-Service-Onboarding** — das macht der separate Onboarding-Wizard (siehe `Onboarding_Wizard.md`)
- **Kein Belegerfassungs-Kanal** — Belege gehen über WhatsApp / E-Mail, nicht über Web-Upload
- **Kein Live-Chat-Tool wie Crisp oder Intercom** — eigene, schlanke Lösung mit Discord-Backend-Bridge

### 1.3 Warum eigenes Widget statt fertige Tools (Crisp, Tawk.to, Intercom)

| Aspekt | Eigenes Widget | Crisp / Tawk.to / Intercom |
|---|---|---|
| Datenhaltung | EU-eigene DB, volle Kontrolle | Drittanbieter (oft US), AVV-Komplexität |
| Kosten | 0 € (eigener Code) | 0–199 €/Monat zusätzlich |
| Discord-Integration | direkt eingebaut | nur teilweise verfügbar, oft Custom-Webhook-Aufwand |
| Magic-Link-Identifikation | wie wir's brauchen | nicht Standard |
| Gastro-Sonderfälle | UI für Bewirtungs-Eingabe etc. einbaubar | nicht möglich |
| Aufwand Erstbau | ~5–8 Tage | ~1 Tag Setup |

**Entscheidung:** Eigenes Widget, weil Datenhoheit und Tenant-spezifische UX-Erweiterungen wichtiger sind als der Setup-Zeit-Vorteil eines Drittanbieters.

---

## 2. Customer-Workflow

### 2.1 Trigger — wann der Customer den Link bekommt

Der Customer **wird zum Chat eingeladen**, statt selbst aktiv hinzugehen. Trigger-Szenarien:

| Trigger | Wer löst aus | Versand-Kanal | Beispiel |
|---|---|---|---|
| OCR-Beleg unklar | System (auto) | WhatsApp / E-Mail | "Dein letzter Beleg ist unklar. Hier klären: prozesspilot.net/c/Xa9..." |
| Bewirtungs-Notiz fehlt | System (auto) | WhatsApp / E-Mail | "Hi Müller, dein Restaurant-Beleg vom Mittwoch — wer war dabei? Hier eintragen: ..." |
| Mitarbeiter aktive Frage | Mitarbeiter (manuell) | WhatsApp / E-Mail | "Wir haben eine kurze Frage zu deinem Setup: ..." |
| Monats-Spar-Bericht | System (auto, monatlich) | E-Mail | Mit eingebautem Chat-Link am Ende: "Fragen? Hier antworten: ..." |
| Setup-Klärung im Onboarding | System (auto) | E-Mail | "Bitte ergänze noch deine Steuernummer: ..." |

### 2.2 Magic-Link-Aufbau

```
URL: prozesspilot.net/c/{token}
oder Subdomain: chat.prozesspilot.net/{token}

Wo:
- token = kryptographisch sicherer Random-String (32 Zeichen Base64URL)
- gültig 14 Tage ab Erstellung
- bei Klick: Browser-Session 24h
```

### 2.3 Nach Klick — was sieht der Customer

1. Token wird beim ersten Aufruf validiert
2. Falls valid: Browser bekommt HttpOnly-Cookie mit Session-Token (24h Lebensdauer)
3. Web-Widget öffnet sich:
   - Tenant-Branding (z.B. "Hi Müller-Bistro")
   - Konversations-History dieses Tenants (chronologisch, neueste unten)
   - Eingabe-Feld unten
   - Optional: Beleg-Vorschau (wenn der Trigger ein bestimmter Beleg war)
   - Status-Indikator: "Wir antworten meist innerhalb 4 Stunden"

### 2.4 Customer-Eingabe-Möglichkeiten

| Input-Typ | Verwendung |
|---|---|
| Text | Standard-Antwort |
| Quick-Reply-Buttons | Bei strukturierten Fragen ("War das Bewirtung?") — Buttons "Ja" / "Nein" / "Anders" |
| Datei-Upload (Bilder) | Wenn Wirt Beleg-Foto im Chat statt WhatsApp schicken will (optional, Phase 2) |
| Mehrfach-Auswahl | Z.B. "Welche Lieferanten-Gruppe?" — Liste mit Checkboxen |

---

## 3. UI-Konzept (Wireframe-Beschreibung)

### 3.1 Initial-Screen (nach Klick auf Magic-Link)

```
┌────────────────────────────────────────────────┐
│ ProzessPilot Chat                          [×] │
├────────────────────────────────────────────────┤
│                                                 │
│   Hi Müller-Bistro 👋                           │
│   Wir antworten meist innerhalb 4 Stunden.     │
│                                                 │
│ ┌────────────────────────────────────────────┐ │
│ │ Vor 5 Min:                                  │ │
│ │ Wir konnten deinen letzten Beleg nicht     │ │
│ │ vollständig erkennen. Lieferant: Metro?    │ │
│ │ Betrag: 127,30 €?                           │ │
│ │ [📷 Beleg-Foto öffnen]                      │ │
│ └────────────────────────────────────────────┘ │
│                                                 │
│ ┌────────────────────────────────────────────┐ │
│ │ Schnellantworten:                           │ │
│ │ [✓ Stimmt, war Metro]                       │ │
│ │ [✗ War nicht Metro]                         │ │
│ │ [📝 Anderes klären]                          │ │
│ └────────────────────────────────────────────┘ │
│                                                 │
├────────────────────────────────────────────────┤
│ 💬 Antwort eingeben...               [Senden]  │
└────────────────────────────────────────────────┘
```

### 3.2 Nach Sendung — Empfang Mitarbeiter-Antwort

```
┌────────────────────────────────────────────────┐
│ ProzessPilot Chat                          [×] │
├────────────────────────────────────────────────┤
│                                                 │
│ ┌──────────────────────────────────┐            │
│ │ Du, vor 30 Sek:                  │            │
│ │ Stimmt, war Metro                │            │
│ └──────────────────────────────────┘            │
│                                                 │
│            ┌────────────────────────────────┐  │
│            │ ProzessPilot, vor 5 Sek:       │  │
│            │ ✓ Super, hab's gebucht. Kommt  │  │
│            │ am Monatsende mit dem Rest zur │  │
│            │ Steuerberaterin.               │  │
│            └────────────────────────────────┘  │
│                                                 │
├────────────────────────────────────────────────┤
│ 💬 Antwort eingeben...               [Senden]  │
└────────────────────────────────────────────────┘
```

### 3.3 Mobile-Responsive

- Vollbild auf Mobile (kein Floating-Widget)
- Tap-friendly Buttons (mind. 44×44 Pixel)
- WhatsApp-/SMS-Standard-Styling-Vibe

### 3.4 Branding

- Discreter "Powered by ProzessPilot"-Footer
- ProzessPilot-Hauptfarben (zu definieren)
- Tenant-Branding optional in Phase 2 (z.B. Logo des Wirts)

---

## 4. Backend-Datenmodell

### 4.1 Tabelle `chat_sessions`

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  token VARCHAR(64) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  trigger_type VARCHAR(50),                -- 'beleg_unklar', 'bewirtung_fehlt', 'manual', etc.
  trigger_reference_id UUID NULL           -- z.B. receipt_id wenn Trigger ein Beleg war
);
```

### 4.2 Tabelle `chat_messages`

```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  thread_id UUID NULL REFERENCES chat_threads(id),
  from_type VARCHAR(20) NOT NULL,          -- 'customer' / 'mitarbeiter' / 'system'
  from_user_id UUID NULL REFERENCES users(id),  -- nur wenn from_type = 'mitarbeiter'
  content TEXT NOT NULL,
  attachments JSONB NULL,                  -- Liste von Datei-URLs (Bilder, PDFs)
  discord_message_id VARCHAR(20) NULL,     -- Mapping zur Discord-Spiegelung
  created_at TIMESTAMPTZ DEFAULT now(),
  read_by_customer_at TIMESTAMPTZ NULL,
  read_by_mitarbeiter_at TIMESTAMPTZ NULL
);
```

### 4.3 Tabelle `chat_threads` (optional, gruppiert Konversationen pro Thema)

```sql
CREATE TABLE chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  topic VARCHAR(120),                      -- z.B. "Beleg-Klärung Mai 2026"
  status VARCHAR(20) DEFAULT 'aktiv',      -- 'aktiv' / 'archiviert' / 'erledigt'
  created_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ NULL,
  discord_thread_id VARCHAR(20) NULL       -- Mapping zum Discord-Thread
);
```

---

## 5. Frontend-Architektur

### 5.1 Tech-Stack

- **React + Vite** (konsistent mit existierender Webapp-Tech)
- **WebSocket** für Real-Time-Updates (Socket.io oder native WebSocket)
- **TailwindCSS** für UI (oder shadcn/ui Components)
- **Build-Output:** Static-HTML + JS-Bundle, deployt auf `chat.prozesspilot.net` / `prozesspilot.net/c/`

### 5.2 State-Management

- **React useState/useReducer** für lokalen UI-State
- **WebSocket-Subscription** für Server-Pushes
- Kein Redux nötig (Komplexität nicht gerechtfertigt)

### 5.3 Routing

- `/c/{token}` → Chat-Widget mit Token-Validierung
- `/c/{token}/beleg/{beleg_id}` → Direkt zur Beleg-Klärung-View

### 5.4 Datei-Upload (Phase 2)

- Drag-and-Drop oder Tap-to-Upload für Bilder/PDFs
- Max. 10 MB pro Datei
- Upload via S3-Presigned-URL → MinIO
- Discord-Bridge zeigt nur Filename, nicht Inhalt

---

## 6. Real-Time-Mechanik

### 6.1 WebSocket-Verbindung

```
1. Customer öffnet Widget mit gültiger Session
2. Frontend stellt WebSocket-Verbindung her zu wss://api.prozesspilot.net/chat
3. Backend validiert Session-Cookie → akzeptiert / rejected
4. Backend abonniert den Tenant-Channel: chat:tenant:{tenant_id}
5. Bei neuer Mitarbeiter-Message:
   - Backend speichert in DB
   - Backend pusht über WebSocket an alle aktiven Customer-Sessions dieses Tenants
   - Frontend rendert neue Message
```

### 6.2 Fallback ohne WebSocket

Wenn WebSocket blockiert (manche Firmen-Firewalls):
- Polling alle 5 Sekunden auf neue Messages
- Schlechtere UX, aber funktionsfähig

### 6.3 Offline-Verhalten

- Wenn Customer offline: Mitarbeiter-Messages werden in DB gespeichert, beim nächsten Widget-Öffnen sichtbar
- Optionale E-Mail-Benachrichtigung an Customer: "Du hast eine neue Antwort. Hier öffnen: ..."

---

## 7. Datenschutz und Compliance

### 7.1 Was über WebSocket geht

- Nur **Customer-Konversationen des eigenen Tenants** — strikte Trennung
- Backend validiert bei jeder Subscription, dass der Token zum Tenant gehört
- Keine globalen Channels, keine Cross-Tenant-Möglichkeit

### 7.2 Magic-Link-Sicherheit

- Token = 32 Zeichen Base64URL = 192 Bit Entropie (praktisch nicht brute-forcebar)
- Tokens sind tenant-gebunden, kein wechselseitiger Zugriff
- Bei Tenant-Kündigung: alle Tokens werden revoziert
- Bei Tenant-Lösch-Anfrage (DSGVO Art. 17): chat_sessions + chat_messages werden komplett gelöscht

### 7.3 Aufbewahrungsdauer

- **Aktive Konversationen:** unbegrenzt (Customer hat Recht auf Einsicht)
- **Nach Tenant-Kündigung:** 30 Tage Aufbewahrung, dann Auto-Lösch-Job (in Sync mit AVV)
- **Backup:** wie restliche DB (täglich, 30 Tage Retention)

### 7.4 Discord-Spiegelung — DSGVO-Kontext

- Customer-Message wird in Discord-Thread im internen Server geposted
- Discord ist im AVV als Subunternehmer genannt (siehe `Discord_Integration.md`)
- Customer hat Recht zu widersprechen → Backend kann Discord-Spiegelung pro Tenant deaktivieren (in Tenant-Settings)
- Bei Lösch-Anfrage: Bot löscht Discord-Messages parallel zur DB-Löschung

---

## 8. Mitarbeiter-Sicht (kurzer Auszug — Details in `Mitarbeiter_Webapp.md`)

Mitarbeiter haben **drei Wege**, mit Customer-Konversationen zu interagieren:

1. **Webapp Customer-Chat-View** — vollständige Konversations-Übersicht aller Tenants, Filter, Such-Funktion
2. **Discord-Thread in `#support-tickets`** — schneller Reply ohne Kontext-Wechsel
3. **Discord-Slash-Command** `/chat reply <tenant>` — gezieltes Antworten aus jedem Channel

Alle drei Wege schreiben in dieselbe DB (single source of truth). Jeder Antwort-Pfad wird in `chat_messages.from_user_id` getrackt.

---

## 9. Performance und Skalierung

### 9.1 Verbindungs-Limits

- Pro Tenant max. 5 gleichzeitige Customer-Verbindungen (verhindert Missbrauch)
- Pro Backend-Instanz max. 5.000 WebSocket-Verbindungen (Hetzner CX22 packt das locker)

### 9.2 Bei 500 Tenants und Annahme 10 % aktiv

- 50 gleichzeitige Verbindungen — kein Problem
- Bei 5.000 Tenants und 10 % aktiv: 500 Verbindungen — auch ok
- Bei 10.000+ Tenants: Horizontale Skalierung über Redis-Pub-Sub und mehrere Backend-Instanzen

### 9.3 Message-Volumen

- Realistische Schätzung: 10–50 Customer-Messages pro Tenant pro Monat
- Bei 1.000 Tenants: 10.000–50.000 Messages/Monat = ~30–150 Messages/Tag-Spitze
- Backend-Last: vernachlässigbar

---

## 10. Implementations-Reihenfolge

### 10.1 P1.1 (KW 21–22) — Vorbereitung

1. Datenmodell-Migrations (`chat_sessions`, `chat_messages`, `chat_threads`)
2. Magic-Link-Generierungs-Service implementiert
3. WhatsApp-Reply-Template mit Chat-Link erweitert (M10)
4. E-Mail-Reply-Template mit Chat-Link erweitert (M11)

### 10.2 P1.2 (KW 23) — Frontend-Bau

5. React-Widget-Skelett auf `chat.prozesspilot.net`
6. Token-Validierung-Endpoint im Backend
7. Konversations-History-Lade-Endpoint
8. Send-Message-Endpoint
9. WebSocket-Server (Socket.io) im Backend integriert
10. Frontend-WebSocket-Client mit Auto-Reconnect
11. UI-Polish (Mobile-Responsive, Quick-Reply-Buttons)
12. Tenant-Branding einbinden

### 10.3 P1.2 (KW 23) — Discord-Bridge

13. Webhook-Endpoint, der bei jedem `chat_messages.insert` Discord-Bot triggert
14. Bot legt/aktualisiert Thread im `#support-tickets` Channel
15. Bot empfängt Discord-Message-Events im Thread
16. Bot ruft Backend-API zur Speicherung der Mitarbeiter-Reply

### 10.4 Phase 2 — Erweiterungen

17. Datei-Upload aus Widget (Bilder, PDFs)
18. Voice-Notes (analog WhatsApp-Sprachnachrichten)
19. Tenant-Branding (Logo des Wirts)
20. Multi-Sprache (englisch, türkisch — wenn Bedarf)

---

## 11. Risiken und Mitigation

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| Customer verliert Magic-Link | hoch | Bei nächstem Trigger (z.B. nächster Beleg unklar) wird automatisch neuer Link generiert; alternativ Mitarbeiter manuell auslösen |
| Magic-Link wird weitergeleitet (Foto-Posten in fremder Gruppe) | niedrig | Token-Lebensdauer 14 Tage, bei Kompromittierung Token-Revoke + neuer Link |
| Backend-DB voll mit Spam-Messages | niedrig | Rate-Limit pro Token (max. 50 Messages/Tag), Auto-Mod bei wiederholter Spam |
| Discord-Bridge fällt aus | mittel | Customer-Chat funktioniert weiter über Webapp-Mitarbeiter-View, Bridge automatisch wieder synchronisiert nach Discord-Recovery |
| Customer erwartet sofortige Antwort 24/7 | hoch | Klarer Hinweis "Wir antworten meist innerhalb 4 Stunden", Auto-Reply nach Geschäftszeiten |
| WebSocket blockiert in Wirts-Netzwerk | mittel | Polling-Fallback (alle 5s) eingebaut |

---

## 12. Zusammenfassung in einem Absatz

Das Web-Chat-Widget ermöglicht Customer-Kommunikation ohne Customer-Account: der Wirt erhält bei Bedarf einen Magic-Link via WhatsApp/E-Mail, klickt drauf, sieht im Browser die Konversations-History seines Tenants und kann antworten. Die Daten leben in der ProzessPilot-EU-Datenbank; Discord ist nur eine Spiegelung für Mitarbeiter-Komfort. WebSocket-basierte Real-Time-Updates, Quick-Reply-Buttons für strukturierte Fragen, Mobile-Responsive. Aufwand für Erstbau ~5–8 Tage. Pilot-Start in P1.2 (KW 23).

---

**Letzte Aktualisierung:** 2026-05-15
**Verantwortlich:** Andreas (Frontend + Backend), Steve (Customer-Kommunikations-Strategie)
