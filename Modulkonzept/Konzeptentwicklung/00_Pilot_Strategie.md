# 00 — Pilot-Strategie

> **Status:** Erstfassung 2026-05-15
> **Zielgruppe:** Geschäftsführung, Entwickler (Andreas), Pilot-Wirt (vereinfachte Variante als Auszug)
> **Verhältnis zu anderen Dokumenten:** Setzt `00_Strategie_Gastro.md` voraus. Operationalisiert den Pilot-Start. Roadmap-Details siehe `05_Roadmap.md`.

---

## 1. Pilot-Wirt-Profil

Der Pilot-Kunde ist ein bekannter Gastro-Kleinunternehmer aus dem persönlichen Umfeld von Steve. Folgende Eckdaten sind aus dem Onboarding-Gespräch bekannt:

| Eigenschaft | Wert |
|---|---|
| Persona-Einordnung | Solo bis Standard-Wirt (genaue Belegmenge zu erfassen in P1.1) |
| Tech-Affinität | Gering — kennt sich mit Tools wenig aus, gibt alles in Schuhkarton-Modus |
| Kassensystem | **SumUp Lite** (Hauptkasse, Karten + Bargeld) |
| Steuerberater | Externe Steuerberaterin mit **Lexware Office** (Cloud) |
| Steuerberater-Kosten heute | **650 €/Monat** |
| Aktuelle Belegerfassung | Wirt gibt alles direkt an Steuerberaterin (Schuhkarton/Mail) |
| Persönliche Beziehung | Wirt ist im persönlichen Umfeld von Steve → direkte Kommunikation, hohes Vertrauen |
| Pilot-Bereitschaft | Sofortiger Start möglich |

### 1.1 Warum dieser Wirt der ideale Pilot ist

1. **Maximales Spar-Potenzial:** Bei 650 €/Mt Steuerberater-Honorar und realistischer 40–60 % Reduktion durch ProzessPilot ergibt sich eine **Ersparnis von 260–390 €/Mt** — das ist eine **Demonstrations-Spar-Rechnung** die du in jedem zukünftigen Sales-Gespräch zeigen kannst. "Hier ein echter Wirt: zahlte 650 €, zahlt jetzt unter 400 € — minus 79 € ProzessPilot = ca. 200 €/Mt netto Vorteil."

2. **Lexware Office Cloud → API-Push möglich:** Steuerberaterin nutzt das Cloud-Tool mit REST-API. ProzessPilot kann via M05-Modul Buchungen **direkt** in ihr System pushen, statt CSV-Mail-Kette. Premium-Variante des Pilot-Setups ohne Mehraufwand.

3. **Tech-Geringe Affinität als Stresstest:** Wenn ProzessPilot bei diesem Wirt funktioniert, funktioniert es bei der Mehrheit des Gastro-Markts. Self-Service-Onboarding-Wizard wird hier nicht gebraucht — Steve macht Premium-Setup manuell (ist im persönlichen Umfeld eh möglich).

4. **Persönliche Beziehung = ehrliches Feedback:** Pilot-Wirte aus dem Sales-Funnel sind oft zurückhaltend mit Kritik. Persönlicher Kontakt liefert ungefiltertes Feedback — das ist Gold wert für Iterationen.

5. **Sofortiger Start:** Keine Marketing-Vorlauf, keine Akquise-Wochen. Server hochziehen, Setup machen, los geht's.

### 1.2 Was wir noch beim Wirt klären müssen

Aus der bisherigen Klärung sind zwei Details offen, die unmittelbar in P1.1 erfasst werden:

- **Belegmenge pro Monat:** Solo (≤50) oder Standard (50–250)? Davon hängt das passende Paket ab. Erfassung über erste 4 Wochen Belege-Stand.
- **SumUp Lite API-Zugang:** Welcher Login-Pfad existiert? Was kann via API gepullt werden (nur Karten-Transaktionen oder auch Tagesabschluss inkl. Bargeld)? Zu prüfen im SumUp-Developer-Portal.

---

## 2. Erfolgskriterien des Pilots

Der Pilot ist erfolgreich, wenn nach 12 Wochen folgende Kriterien erfüllt sind:

### 2.1 Technische Erfolgskriterien

| # | Kriterium | Messbar an |
|---|---|---|
| T1 | OCR-Genauigkeit ≥ 92 % über alle eingereichten Belege | Auswertung in der Mitarbeiter-Webapp |
| T2 | Kategorisierung-Genauigkeit ≥ 88 % (Bewirtung, MwSt-Splitting, Pfand) | Manuelle Korrekturquote in Webapp |
| T3 | DATEV-/Lexware-Export läuft fehlerfrei und wird von der Steuerberaterin akzeptiert | Bestätigung Steuerberaterin per Mail nach erstem Monatsexport |
| T4 | Keine kritischen Datenpannen, keine GoBD-Verstöße | Audit-Log-Auswertung |
| T5 | Verfügbarkeit ≥ 99 % über Pilot-Zeitraum | Uptime-Monitoring |

### 2.2 Geschäftliche Erfolgskriterien

| # | Kriterium | Messbar an |
|---|---|---|
| B1 | Wirt nutzt das System mindestens 2× pro Woche nach Onboarding-Phase | Discord-Notifications + Customer-Chat-Aktivität |
| B2 | Wirt ist mit dem Service zufrieden (qualitatives Interview Woche 8) | Strukturiertes Interview, dokumentiert |
| B3 | Steuerberaterin akzeptiert das System ohne aktive Ablehnung | Schriftliche Rückmeldung |
| B4 | Wirt wäre bereit, ProzessPilot weiterzuempfehlen | Frage am Pilot-Ende |
| B5 | Konkrete Spar-Rechnung lässt sich nachweisen (Steuerberater-Stunden gesenkt) | Auswertung mit Steuerberaterin |

### 2.3 Lernziele (qualitativ, nicht binäres "erfolgreich/nicht")

- Welche OCR-Sonderfälle in Gastro hatten wir nicht auf dem Schirm?
- Welche Schritte im Onboarding-Wizard waren unklar / zu kompliziert?
- Welche Discord-Workflows in der Mitarbeiter-Webapp passen, welche nicht?
- Wie viel Mitarbeiter-Touch pro Tenant pro Monat ist realistisch (für Skalierungs-Rechnung)?
- Welche Wirt-Anfragen sind häufig (für FAQ-Aufbau)?

---

## 3. Pilot-Sub-Phasen

Der Pilot ist in drei aufeinander aufbauende Sub-Phasen gegliedert.

### 3.1 P1.1 — Solo-Test (KW 21–22, ~2 Wochen)

**Setup:**
- Server auf Hetzner CX22 hochgezogen, EU-Region
- Mitarbeiter-Webapp läuft auf `admin.prozesspilot.net`
- Discord-Server angelegt mit Channel-Struktur
- Discord-Webhooks aktiv (Phase 1 ohne Bot)
- Steve hat OAuth-Login via Discord
- Pilot-Tenant manuell in der Webapp angelegt mit allen Stammdaten

**Belegeingang:**
- **Steve sammelt physisch Belege vom Wirt** (z.B. wöchentlich, in der ersten Phase)
- **Lädt diese in der Mitarbeiter-Webapp hoch** (Drag-and-Drop, Tenant-Auswahl)
- Belege durchlaufen den vollen Backend-Pipeline (OCR → Kategorisierung → Archiv)
- Bewirtungsbelege werden im Backend-Korrektur-View manuell mit Anlass + Teilnehmer angereichert
- Z-Bon-Daten von SumUp werden vorerst manuell hochgeladen (Screenshot/PDF aus SumUp-Dashboard)

**Was getestet wird:**
- OCR-Qualität bei echten Belegen
- Kategorisierung-Tiefe bei Gastro-Sonderfällen (Bewirtung, Pfand, MwSt-Splitting)
- Workflow Webapp ↔ Discord (Tasks, Alerts)
- Erster DATEV/Lexware-Export-Test

**Was bewusst nicht im Scope:**
- Customer-Web-Chat-Widget (kommt P1.2)
- Discord-Bot mit Buttons (Webhooks reichen)
- WhatsApp-Eingang
- Vertriebsagentur-Anbindung

**Aufwand:** ~2 Wochen, primär Andreas (Tech-Setup + Webapp-Upload-Anpassung) + Steve (Tenant-Setup + Belege einsammeln + Feedback).

### 3.2 P1.2 — Twilio-WhatsApp-Bridge + Discord-Bot live (KW 23–28, ~6 Wochen)

**Setup-Ergänzungen:**
- Twilio WhatsApp-Sandbox eingerichtet
- Wirt bekommt eine Twilio-Nummer / sendet an einen Sandbox-Bot
- Wirt fotografiert Lieferscheine selbst direkt mit WhatsApp
- M10 WhatsApp-Modul empfängt Belege automatisch
- **Discord-Bot ist live** mit Buttons (One-Click-Claim), Slash-Commands
- Customer-Web-Chat-Widget ist live auf `prozesspilot.net/c/<token>`
- Magic-Link-Mechanik: WhatsApp/Mail-Reply mit Chat-Link bei unklaren Belegen
- Lexware Office API-Push aktiv (M05) — monatliche Buchungen gehen direkt in das System der Steuerberaterin

**Was getestet wird:**
- WhatsApp-Workflow aus Wirt-Sicht
- Discord-Bot-Interaktion aus Mitarbeiter-Sicht
- Magic-Link-Customer-Chat in der Praxis
- Lexware-Direct-Push mit echter Steuerberaterin
- Monatliche Übergabe an Steuerberaterin (M08 erweitert)
- Spar-Rechnung wird zum ersten Mal real gemessen (Steuerberaterin-Stunden vorher/nachher)

**Übergang Steve → Wirt:**
- Steve hört auf, Belege manuell hochzuladen
- Wirt übernimmt komplett via WhatsApp
- Steve eskaliert nur noch bei Problemen

**Aufwand:** ~6 Wochen, davon Andreas (Bot + WhatsApp-Connector + Lexware-API), Steve (Wirt-Schulung, Steuerberater-Abstimmung, Feedback-Sammlung).

### 3.3 P1.3 — Meta-Cloud-API ersetzt Twilio (KW 29+, kontinuierlich)

**Setup-Ergänzungen:**
- Meta WhatsApp Business Cloud API freigegeben (Antrag bereits in KW 21 gestellt)
- Tenant migriert von Twilio-Sandbox auf eigene WhatsApp-Business-Nummer
- Phone-Number-Setup bei Meta abgeschlossen
- Conversation-History nicht migriert (Neustart der WhatsApp-Konversation)

**Was getestet wird:**
- Stabilität der Meta-API (vs. Twilio)
- Skalierbarkeits-Potenzial (Meta erlaubt mehr Volumen als Twilio-Sandbox)
- Cost-per-Conversation-Reality

**Aufwand:** ~1 Woche Migration, plus 4-Wochen-Beobachtung.

---

## 4. Pilot-Setup-Schritte konkret

### 4.1 Vor Pilot-Start (KW 21, Vorbereitungs-Woche)

| Schritt | Verantwortlich | Geschätzt |
|---|---|---|
| Hetzner-Server bestellen + Docker-Compose deployen | Andreas | 0,5 Tag |
| Domain DNS-Setup (admin/setup/api/prozesspilot.net) | Andreas | 0,5 Tag |
| Postgres-Migrations + Bootstrap-Admin | Andreas | 0,5 Tag |
| Discord-Server angelegt + Webhooks konfiguriert + Channel-Struktur | Steve | 0,5 Tag |
| Discord-OAuth-App registriert bei Discord Developer Portal | Andreas | 0,5 Tag |
| OAuth-Login in Mitarbeiter-Webapp implementiert | Andreas | 1 Tag |
| Steve + Andreas können sich via Discord einloggen | Andreas | — |
| Pilot-Tenant in Webapp anlegen, alle Stammdaten erfassen | Steve | 0,5 Tag |
| Berufshaftpflicht abgeschlossen | Steve | 0,5 Tag (Recherche + Abschluss) |
| AVV mit Pilot-Wirt unterschrieben (Vorlage vom Anwalt) | Steve | 0,5 Tag |
| Lexware Office API-Zugang bei Steuerberaterin angefragt + Tokens generiert | Steve + Steuerberaterin | 1 Tag |
| SumUp API-Zugang anfragen / OAuth einrichten | Andreas | 0,5 Tag |
| Belegerfassung-Upload in Webapp testen (Test-Belege) | Andreas + Steve | 0,5 Tag |

**Gesamtaufwand KW 21:** ~5 Personentage Andreas + ~3 Personentage Steve

### 4.2 P1.1 Start (KW 22, Pilot-Woche 1)

- Steve holt erste echte Belege vom Wirt (idealerweise 10–20 Stück Querschnitt: Lieferanten, Bewirtung, Tankquittungen, etc.)
- Lädt sie in Webapp hoch
- Beobachtet OCR-Ergebnisse, korrigiert wo nötig
- Erste Discord-Notifications, beobachten ob Channel-Struktur funktioniert
- Daily Standup-Discord-Call zwischen Steve und Andreas (15 Min, abends)

### 4.3 P1.1 Woche 2 (KW 23)

- Volumen erhöhen (alle Belege der Woche)
- Erste BWA-/Reporting-Tests
- Erstes vorläufiges Lexware-Office-Push-Test (kleines Sample, mit Steuerberaterin abstimmen)
- Erste M03-Hooks aktivieren: Bewirtungs-Detection, MwSt-Splitting, Pfand-Erkennung

### 4.4 P1.2 Start (KW 24, Pilot-Woche 3)

- Twilio-Sandbox aktiv
- Discord-Bot mit Buttons live
- Wirt-Schulung: 30-Min-Call wie er Belege per WhatsApp schickt
- Wirt schickt erste echten Belege selbst
- Steve hört auf, manuell hochzuladen — nur noch bei Problemen

### 4.5 P1.2 Mitte (KW 26, Pilot-Woche 5)

- Monatsabschluss April → Steuerberaterin bekommt ersten echten Lexware-Office-Push
- Schriftliches Feedback von Steuerberaterin einholen
- Wirt-Zwischenfeedback: 30-Min-Call

### 4.6 P1.2 Ende (KW 28, Pilot-Woche 8)

- Strukturiertes Wirt-Interview (45 Min): was läuft, was nicht, was fehlt
- Strukturiertes Steuerberaterin-Interview (30 Min)
- Erste Spar-Rechnung: wie viel Zeit spart Steuerberaterin tatsächlich?

### 4.7 P1.3 Start (KW 29, sobald Meta-Freigabe da)

- Migration auf Meta-Cloud-API
- Twilio dekommissioniert
- Wirt nutzt jetzt offizielle WhatsApp-Business-Nummer

---

## 5. Spar-Versprechen für diesen konkreten Wirt

Konkrete Spar-Rechnungs-Hypothese für den Pilot-Wirt (basierend auf bekannten 650 €/Mt Steuerberater-Kosten):

### 5.1 Optimistisch (50 % Steuerberater-Reduktion)

| Position | Heute | Mit ProzessPilot | Differenz |
|---|---|---|---|
| Steuerberaterin-Honorar | 650 €/Mt | 325 €/Mt | **+325 €/Mt** |
| Eigene Wirt-Zeit (Schuhkarton ordnen) | ~3 Std × 25 € = 75 €/Mt | ~30 Min = 12,50 €/Mt | **+62,50 €/Mt** |
| ProzessPilot Standard | 0 € | -79 €/Mt | -79 €/Mt |
| Setup-Fee anteilig (499 € / 12 Mt) | 0 € | -41,58 €/Mt | -41,58 €/Mt |
| **Netto-Vorteil pro Monat** | — | — | **+266,92 €/Mt** |

→ **Jahres-Ersparnis: 3.203 € für den Wirt** (oder bei monatlicher Sicht: ~270 € mehr in der Tasche).

### 5.2 Konservativ (30 % Steuerberater-Reduktion)

| Position | Heute | Mit ProzessPilot | Differenz |
|---|---|---|---|
| Steuerberaterin-Honorar | 650 €/Mt | 455 €/Mt | +195 €/Mt |
| Eigene Wirt-Zeit | 75 €/Mt | 12,50 €/Mt | +62,50 €/Mt |
| ProzessPilot Standard | 0 € | -79 €/Mt | -79 €/Mt |
| Setup-Fee anteilig | 0 € | -41,58 €/Mt | -41,58 €/Mt |
| **Netto-Vorteil pro Monat** | — | — | **+136,92 €/Mt** |

→ **Jahres-Ersparnis: 1.643 €** auch in konservativer Variante.

### 5.3 Was wir messen werden

- Tatsächliche Steuerberater-Stunden vor Pilot (vergangene 3 Monate, retrospektiv)
- Steuerberater-Stunden Monat 3, 6, 12 nach Pilot-Start
- Wirt-Eigenzeit für Belege (vorher per Selbstreport, nachher messbar an Webapp/WhatsApp-Logs)
- ProzessPilot-Volumen pro Monat (Anzahl Belege, OCR-Confidence, Korrektur-Quote)

Diese Daten werden in `pilot_messungen.md` (im `_pilot/`-Unterordner) laufend geführt — am Pilot-Ende ergibt sich die **erste echte Sales-Spar-Rechnung** für künftige Wirte.

---

## 6. Steuerberater-Kommunikation

Die Steuerberaterin ist eine zentrale Stakeholder im Pilot — wenn sie das System ablehnt, fällt der Wirt aus. Strategie:

### 6.1 Vor Pilot-Start

- Steve ruft Steuerberaterin an und erklärt: "Wir testen ein Tool, das Belege vorbereitet und in Ihr Lexware Office pusht. Das soll Ihnen Sortier-Aufwand sparen, nicht Ihre Arbeit ersetzen."
- Bei Bedarf: 30-Min Demo-Call mit Steuerberaterin (Screenshare-Demo des Standard-Workflows)
- Schriftliche Zusage Steuerberaterin: bereit am Pilot teilzunehmen
- Lexware Office API-Token wird generiert (durch Steuerberaterin oder Wirt, je nach Berechtigung)

### 6.2 Während Pilot

- Monatlich: Mail mit Übergabe-Bericht — was hat ProzessPilot geliefert, was wurde gepusht, gibt's Fragen?
- Bei Fehlern in Buchung: Steuerberaterin kann jederzeit Mail schreiben, Steve klärt
- Pilot-Wirt unterzeichnet, dass Steuerberaterin Zugang zur Customer-Konversation hat (falls relevant)

### 6.3 Nach Pilot

- Strukturiertes Interview Steuerberaterin (KW 28):
  - Wie viel Stunden hat sie tatsächlich gespart?
  - Was war die Qualität der Übergabe-Daten?
  - Würde sie ProzessPilot anderen Mandanten empfehlen?
  - Was würde sie an der Übergabe-Struktur ändern?
- Falls positives Interview: **Steuerberaterin als Pilot-Referenz** für künftige Sales-Gespräche der Vertriebsagentur

---

## 7. Abbruch-Kriterien

Der Pilot wird abgebrochen / pausiert, wenn folgende Indikatoren auftreten:

| Kriterium | Was wir tun |
|---|---|
| OCR-Genauigkeit < 75 % über 4 Wochen | Architektur-Review, Mindee-Adapter als Backup priorisieren |
| Wirt nutzt das System nicht (< 1 Beleg/Woche nach Onboarding) | Persönliches Gespräch, Onboarding-Problem klären — falls grundlegende Skepsis: Pilot beenden |
| Steuerberaterin lehnt System ab | Anhalten, alternativen Pilot-Wirt mit DATEV-Steuerberater suchen |
| Datenpanne / DSGVO-Vorfall | Pilot sofort pausieren, Incident-Response-Plan |
| Wirt verlangt Geld zurück | Abbrechen, Geld zurück, Lessons learned dokumentieren |

---

## 8. Nach erfolgreichem Pilot

Wenn alle Erfolgskriterien (T1–T5, B1–B5) erfüllt sind, wird folgender Übergang in den Regelbetrieb durchgeführt:

### 8.1 KW 30–32 — Pilot in Regelbetrieb überführen

- Pilot-Wirt wechselt vom Sub-Phase-Stand auf reguläres Standard-Paket
- Vertrag wird auf Standard-Konditionen umgestellt
- Setup-Fee wird nachträglich erlassen (war Pilot-Vorteil)
- Wirt bekommt normales monatliches Rechnungs-/Übergabe-Setup

### 8.2 KW 30–32 parallel — Direkt-Akquise von 2–3 weiteren Wirten

- Über persönliches Netzwerk (Steve + Andreas)
- Mit Pilot-Wirt als Referenz ("Hier ein echter Wirt im Hintergrund")
- Ziel: 3 zahlende Tenants vor Reseller-Launch

### 8.3 KW 32+ — Vertriebsagentur-Onboarding

- Mit 3 Referenz-Kunden im Sales-Material
- Schulung der Agentur
- Erste Pitch-Calls begleitend

---

## 9. Pilot-Doku-Struktur im Repo

Während des Pilots wird ein eigener Unterordner geführt:

```
Modulkonzept/Konzeptentwicklung/_pilot/
├── pilot_protokoll.md          # Wöchentliche Notizen, Meetings, Entscheidungen
├── pilot_messungen.md          # Erfassungs-Tabelle Belege, Stunden, Fehler
├── lessons_learned.md          # Was haben wir gelernt — wird kontinuierlich ergänzt
├── wirt_interview_kw28.md      # Strukturiertes Interview Wirt
├── steuerberater_interview.md  # Strukturiertes Interview Steuerberaterin
└── pilot_abschluss_bericht.md  # Finaler Bericht nach Pilot-Ende
```

Diese Docs sind **vertraulich** (Pilot-Wirt-Daten) und werden nicht in das öffentliche Repo gepusht. Im Hauptkonzept werden nur anonymisierte Lessons Learned + Spar-Rechnung-Aggregat referenziert.

---

## 10. Zusammenfassung in einem Absatz

Der ProzessPilot-Pilot startet ab KW 21/22 mit einem bekannten Gastro-Wirt aus dem persönlichen Umfeld von Steve. Der Wirt zahlt heute 650 €/Mt an seine Steuerberaterin (Lexware Office), nutzt SumUp Lite als Kasse. In drei Sub-Phasen (P1.1 Solo-Test mit manuellem Upload, P1.2 Twilio-WhatsApp + Discord-Bot live, P1.3 Meta-Cloud-API) wird ProzessPilot von Steve persönlich aufgebaut, dem Wirt schrittweise übergeben und nach 12 Wochen evaluiert. Erfolgskriterien sind technische OCR/Kategorisierung-Genauigkeit, Akzeptanz durch Wirt und Steuerberaterin, und messbare Spar-Rechnung (Ziel: 270 €/Mt Netto-Vorteil für den Wirt). Bei Erfolg: Übergang in Regelbetrieb, parallele Akquise 2–3 weiterer Direkt-Kunden, danach Vertriebsagentur-Launch in KW 32+.

---

**Letzte Aktualisierung:** 2026-05-15
**Verantwortlich:** Steve Bernhardt (Geschäftsführung) + Andreas (Technik)
