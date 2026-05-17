# 05 — Roadmap (Mai 2026, Gastro-Reboot)

> **Status:** Komplette Neufassung 2026-05-15
> **Ersetzt:** vorherige Roadmap-Version vom 2026-05-07 (verschoben nach `_archive/05_Roadmap_alt_2026-05-07.md`)
> **Verhältnis zu anderen Dokumenten:** Setzt `00_Strategie_Gastro.md`, `00_Vertriebsmodell.md`, `00_Pilot_Strategie.md` voraus.

---

## 1. Was sich gegenüber der alten Roadmap geändert hat

Die alte Roadmap war Dev-Phasen-orientiert (Phase A "Aufräumen", Phase B "Server-Deployment", Phase C "Erster Pilotkunde", Phase D "Skalierung"). Sie war technisch korrekt, aber **nicht customer-outcome-orientiert** und ignorierte die Vertriebs- und Geschäftsmodell-Fragen.

Die neue Roadmap ist:

- **Customer-Outcome-orientiert** (M-Meilensteine pro Kunden-Stand statt Dev-Phasen)
- **Mit konkreten Pilot-Sub-Phasen** (P1.1 Solo-Test, P1.2 Twilio+Bot, P1.3 Meta-Migration)
- **Discord-Integration eingearbeitet** (kommt in P1.1, voll live in P1.2)
- **Vertriebsagentur-Onboarding mit Mindestleistung** (geplant für M2)
- **Realistische Zeitrahmen** mit Wochen-Granularität für die ersten 12 Wochen
- **GbR/GmbH-Wechsel** als Meilensteine an Tenant-Stand gekoppelt

---

## 2. Roadmap-Übersicht (Stand Mai 2026)

| Meilenstein | Bezeichnung | Tenant-Ziel | Geplanter Zeitraum | Status |
|---|---|---|---|---|
| **M0** | Konzept-Reboot abgeschlossen | – | KW 20 (jetzt) | ✅ läuft |
| **M1** | Pilot-Wirt produktiv | 1 zahlend / kostenlos | KW 21–32 | offen |
| **M2** | Vertriebsagentur-Launch | 5 zahlende Tenants | Q4 2026 | offen |
| **M3** | Etabliert, GbR-Umwandlung | 25 zahlende Tenants | Q2 2027 | offen |
| **M4** | Self-Service-tauglich | 50 zahlende Tenants | Q4 2027 | offen |
| **M5** | Skalierungsfähig, GmbH-Prüfung | 100 zahlende Tenants | Q3 2028 | offen |
| **M6** | Markt-erprobt | 200+ zahlende Tenants | 2029+ | offen |

---

## 3. Detail-Plan M0 → M1 (Konzept bis Pilot-Ende, KW 20–32)

### 3.1 KW 20 — Konzept-Reboot (jetzt)

| # | Aufgabe | Status |
|---|---|---|
| 1 | `00_Strategie_Gastro.md` schreiben | ✅ |
| 2 | `00_Vertriebsmodell.md` schreiben | ✅ |
| 3 | `00_Pilot_Strategie.md` schreiben | ✅ |
| 4 | `Discord_Integration.md` schreiben | ✅ |
| 5 | `Web_Chat_Widget.md` schreiben | ✅ |
| 6 | `00_Architektur_Hauptdokument.md` aktualisieren | ✅ |
| 7 | `05_Roadmap.md` neu (dieses Dokument) | ✅ |
| 8 | T2: Modul-Updates (M03, M08, M12, M14, M15) | offen |
| 9 | T3: Legal-Vorlagen (AGB, AVV, TOMs) | offen |
| 10 | T4: Doku-Hygiene (Status-Archiv, Prompt-Konsolidierung) | offen |

### 3.2 KW 21 — Pilot-Vorbereitung

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Hetzner-Server CX22 bestellen, EU-Region | Andreas |
| 2 | Domain-DNS für admin/setup/api/prozesspilot.net | Andreas |
| 3 | Postgres-Migrations + Bootstrap-Admin | Andreas |
| 4 | Discord-Server angelegt + Channel-Struktur | Steve |
| 5 | Discord-OAuth-App registriert | Andreas |
| 6 | Mitarbeiter-Webapp Discord-Login implementiert | Andreas |
| 7 | Discord-Webhooks aktiv (Phase 1 ohne Bot) | Andreas |
| 8 | Berufshaftpflicht abschließen | Steve |
| 9 | Anwalt-Termin: SaaS-AGB neu beauftragen | Steve |
| 10 | Pilot-Tenant in Webapp anlegen, Stammdaten erfassen | Steve |
| 11 | Lexware-Office-API-Token mit Steuerberaterin abstimmen | Steve |
| 12 | SumUp-Developer-Account anfragen | Andreas |
| 13 | Belegerfassung-Upload in Webapp testen | Andreas + Steve |
| 14 | Erster Vertriebsagentur-Erstkontakt mit neuem Konzept | Steve |
| 15 | Meta WhatsApp Business API Antrag stellen (parallel, dauert 6–10 Wochen) | Andreas |

### 3.3 KW 22 — P1.1 Start (Solo-Test, Steve lädt Belege manuell)

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Erste echte Belege vom Wirt einsammeln | Steve |
| 2 | In Webapp hochladen, OCR-Ergebnisse beobachten | Steve |
| 3 | M03 Bewirtungs-Hook aktivieren | Andreas |
| 4 | Erste Discord-Notifications validieren | Steve + Andreas |
| 5 | Daily Discord-Standup | Steve + Andreas |

### 3.4 KW 23 — P1.1 Woche 2 + Bot-Entwicklung parallel

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Volumen erhöhen (alle Belege der Woche) | Steve |
| 2 | M03 MwSt-Splitting + Pfand-Hook aktivieren | Andreas |
| 3 | Erster Lexware-Office-Push-Test (kleines Sample, mit Steuerberaterin) | Steve + Andreas |
| 4 | Discord-Bot mit discord.js initialisiert | Andreas |
| 5 | Slash-Commands `/task list`, `/task claim` implementiert | Andreas |
| 6 | Interactive Buttons für Task-Claim implementiert | Andreas |
| 7 | Customer-Web-Chat-Widget Frontend-Skelett | Andreas |
| 8 | M11 E-Mail-Eingang freigeschaltet | Andreas |

### 3.5 KW 24 — P1.2 Start (Twilio + Bot live)

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Twilio WhatsApp-Sandbox aktiv | Andreas |
| 2 | Wirt-Schulung: 30-Min-Call zu WhatsApp-Workflow | Steve |
| 3 | Wirt schickt erste echte Belege selbst | Wirt |
| 4 | Discord-Bot voll live mit Buttons + Slash-Commands | Andreas |
| 5 | Web-Chat-Widget live auf chat.prozesspilot.net | Andreas |
| 6 | Magic-Link-Mechanik in WhatsApp/E-Mail-Templates | Andreas |
| 7 | Discord-Bridge zu Customer-Chat funktional | Andreas |
| 8 | Steve hört auf, manuell hochzuladen | – |
| 9 | Notfall-Login-Setup für Steve + Andreas (TOTP) | Andreas |

### 3.6 KW 25–27 — P1.2 läuft

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Wirt nutzt System produktiv | Wirt |
| 2 | M15 SumUp-Connector implementiert | Andreas |
| 3 | M08 Spar-Counter-Berechnung läuft | Andreas |
| 4 | M12 GoBD-Verfahrensdoku-Generator läuft | Andreas |
| 5 | Wöchentliches Status-Update | Steve + Andreas |

### 3.7 KW 28 — Erster Monatsabschluss + Steuerberater-Übergabe

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Monatsabschluss April → Steuerberaterin | Steve + System |
| 2 | Steuerberaterin-Feedback einholen (Mail oder Call) | Steve |
| 3 | Spar-Bericht-Mail an Wirt versendet | System |
| 4 | Wirt-Zwischenfeedback (30-Min-Call) | Steve |

### 3.8 KW 29–31 — P1.3 Vorbereitung + Lessons Learned

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Meta-WhatsApp-Freigabe abwarten | – |
| 2 | Bei Freigabe: Migration Twilio → Meta-Cloud-API | Andreas |
| 3 | Lessons-Learned-Dokumentation | Steve + Andreas |
| 4 | M03-Hooks nachschärfen anhand Pilot-Daten | Andreas |
| 5 | UI-Verbesserungen am Mitarbeiter-Dashboard | Andreas |

### 3.9 KW 32 — Pilot-Abschluss-Bewertung (M1 erreicht)

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Strukturiertes Wirt-Interview (45 Min) | Steve |
| 2 | Strukturiertes Steuerberaterin-Interview (30 Min) | Steve |
| 3 | Spar-Rechnung final ausgewertet | Steve |
| 4 | Pilot-Abschlussbericht erstellt | Steve |
| 5 | Entscheidung: Übergang in Regelbetrieb? | Steve + Andreas |
| 6 | Pilot-Wirt wechselt auf reguläres Standard-Paket | Steve |
| 7 | Vorbereitung M2 — Vertriebsagentur-Schulung | Steve + Andreas |

**M1 ist erreicht wenn:** Pilot-Wirt zahlt regulär, ist zufrieden, Steuerberaterin akzeptiert das System, alle technischen Erfolgskriterien (T1–T5) erfüllt.

---

## 4. Detail-Plan M1 → M2 (Reseller-Launch, KW 33 bis Q4 2026)

### 4.1 KW 33–36 — Direkt-Akquise + Sales-Material

Parallel zur Vertriebsagentur-Vorbereitung werden 2–3 weitere Direkt-Kunden gewonnen, um die Referenz-Basis zu schaffen.

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Sales-Pitch-Deck finalisieren (basierend auf Pilot-Erfahrung) | Steve |
| 2 | Spar-Rechner-Tool als Web-App | Andreas |
| 3 | Demo-Tenant mit realistischen Beispiel-Daten einrichten | Andreas |
| 4 | Einwand-Handbuch schreiben | Steve |
| 5 | 2–3 Direkt-Kunden über persönliches Netzwerk gewinnen | Steve |
| 6 | Vertriebsagentur-Vertrag finalisieren mit Anwalt | Steve + Anwalt |
| 7 | Vertragsverhandlung mit Vertriebsagentur | Steve |

### 4.2 KW 37–40 — Vertriebsagentur-Onboarding

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Vertragsunterzeichnung Vertriebsagentur | Steve |
| 2 | Sales-Schulung Agentur (1–2 Tage) | Steve + Andreas |
| 3 | Demo-Tenant + Sales-Material an Agentur übergeben | Steve |
| 4 | Agentur startet erste Pitch-Calls | Agentur |
| 5 | Begleitende Pitch-Calls mit Agentur (Qualitäts-Sicherung) | Steve |

### 4.3 KW 41–48 — Reseller-Vertrieb läuft

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Wöchentliches Status-Call mit Agentur | Steve |
| 2 | Erste Tenants über Agentur akquiriert | Agentur |
| 3 | Onboarding der neuen Tenants | Steve + Andreas |
| 4 | Manuelle Rechnungsstellung läuft routinemäßig | Steve |
| 5 | Provisions-Auszahlungen monatlich am 15. | Steve |

**M2 ist erreicht wenn:** mindestens 5 zahlende Tenants gesamt (inkl. Pilot + Direkt-Kunden + Agentur-vermittelt), Agentur erfüllt Quartal-Mindestleistung, Cashflow läuft sauber.

---

## 5. Detail-Plan M2 → M3 (Etablierung + GbR-Umwandlung, Q1–Q2 2027)

### 5.1 Q1 2027 — Skalierung Vertriebsagentur

- Mindestleistung Agentur erhöht auf 5 Tenants/Quartal
- Backend-Optimierungen (Caching, DB-Indizes)
- M15 SumUp-Connector wird ergänzt um orderbird-Adapter (sobald erster Kunde danach fragt)

### 5.2 Q2 2027 — GbR-Umwandlung

| # | Aufgabe | Verantwortlich |
|---|---|---|
| 1 | Steuerberater-Termin: Migration Einzelunternehmen → GbR | Steve + Steuerberater |
| 2 | GbR-Vertrag mit Andreas (Anteil 70/30 oder 60/40 — zu entscheiden) | Steve + Andreas + Anwalt |
| 3 | Gewerbe-Anmeldung GbR | Steve |
| 4 | Andreas wird Mitunternehmer mit Gewinn-Zurechnung | – |
| 5 | Buchhaltung umstellen | Steve + Steuerberater |

### 5.3 Q2 2027 — Skalierungs-Investitionen

- Zweiter Mitarbeiter teilweise (oder Andreas mehr Vollzeit)
- Hetzner-Server-Upgrade auf CX32
- Stripe-Subscriptions implementiert (ab 25 Tenants Schwelle)

**M3 ist erreicht wenn:** 25 zahlende Tenants, GbR aktiv, beide Gründer offiziell eingebunden, Cashflow trägt zumindest einen Mitarbeiter teilweise.

---

## 6. Detail-Plan M3 → M4 (Self-Service-Tauglich, Q3–Q4 2027)

| # | Aufgabe |
|---|---|
| 1 | Onboarding-Wizard auf Self-Service-Niveau ausbauen (ohne PP-Mitarbeiter-Touch) |
| 2 | UX-Verbesserungen für Wirt-Web-Chat (Datei-Upload, Mobile-Polish) |
| 3 | Mehrere Beleg-Sender pro Tenant (mehrere WhatsApp-Nummern) |
| 4 | M09 Lieferanten-Kommunikation aktivieren |
| 5 | Erste Custom-Plugins für Pro-Kunden (wenn Bedarf) |
| 6 | Mindee als zweiter OCR-Provider in Backup-Setup |

**M4 ist erreicht wenn:** 50 zahlende Tenants, Onboarding kann ohne Mitarbeiter-Beteiligung laufen (außer Endabnahme), erste Pro-Kunden mit Custom-Anpassungen.

---

## 7. Detail-Plan M4 → M5 (Skalierungs-Reife + GmbH-Prüfung, 2028)

| # | Aufgabe |
|---|---|
| 1 | Steuerberater-Termin: Lohnt sich GmbH-Umwandlung jetzt? |
| 2 | Bei GmbH-Entscheidung: 25.000 € Stammkapital aus thesaurierten Gewinnen |
| 3 | Notar-Gründung GmbH |
| 4 | Migration GbR → GmbH |
| 5 | DATEV-Unternehmen-Online (DUO) Direct-Push-Integration (M04 erweitert) |
| 6 | Erste Custom-Plugins von externen Entwicklern bezahlt |
| 7 | Eventuell Voll-/Teilzeit-Vertriebs-Mitarbeiter intern |

**M5 ist erreicht wenn:** 100 zahlende Tenants, ggf. GmbH gegründet, DUO-Integration live, mehrere Premium-Features für Pro-Kunden verfügbar.

---

## 8. Längerfristige Perspektive M5 → M6 (2029+)

- 200+ zahlende Tenants
- Erweiterung Zielgruppe über reine Gastro hinaus (Bäckereien? Handwerk?) — strategische Entscheidung
- Möglich: International (Österreich, Schweiz)
- Möglich: Eigene OCR-Engine wenn Volumen Cost-Senkung rechtfertigt
- Möglich: Migration Discord → Mattermost wenn Team > 15 MA

---

## 9. Phase 2 Erweiterungen (priorisiert nach Wichtigkeit aus User-Antwort F19)

### 9.1 Wichtig (priorisiert für M2–M3)

- **Skonto-Push-Reminder (a):** Wirt verpasst keine Skonto-Frist mehr. Erweiterung von M03. Aufwand: ~3 Tage. Großer Wow-Effekt für Sales-Pitch.
- **WhatsApp-Bot mit Quick-Reply für Bewirtungsbelege (d):** Reduziert Mitarbeiter-Touch bei Bewirtungs-Klärung. Aufwand: ~5 Tage. Sehr wertvoll bei Skalierung über 25 Tenants.

### 9.2 Mittel (für M3–M4)

- **USt-Voranmeldung-Vorbereitung (c):** Quartalsweise Vorab-Berechnung der USt-Last. Erweiterung von M08. Aufwand: ~5 Tage. Steuerberater-Mehrwert.

### 9.3 Später (für M4–M5)

- **Lieferanten-Whitelist Top-30 Gastro (b):** Auto-Erkennung Metro/Selgros/etc. ab Tag 1. Aufwand: ~2 Tage. Kann auch früher mitgenommen werden.
- **Mehrere Beleg-Sender pro Tenant (e):** Mehrere WhatsApp-Nummern pro Tenant. Aufwand: ~5 Tage.
- **Mahn-Eingangs-Erkennung (f):** Wirt wird informiert wenn Lieferanten-Mahnung reinkommt. Aufwand: ~3 Tage.
- **Lieferanten-Crowdsourcing (g):** Globale Lieferanten-DB. Aufwand: ~7 Tage. Network-Effect.

---

## 10. Risiken in der Roadmap-Umsetzung

| Risiko | Wahrscheinlichkeit | Wirkung | Mitigation |
|---|---|---|---|
| Pilot-Wirt verliert Interesse | gering (persönlich bekannt) | M1 verschiebt sich | Wirt-Pflege, schneller Wert demonstrieren |
| Meta-WhatsApp-Freigabe dauert > 10 Wochen | mittel | P1.3 verzögert | Twilio-Sandbox läuft weiter, Migration später unkritisch |
| Vertriebsagentur unterperformt nach Schulung | mittel | M2 verschiebt sich | Soft-Exklusiv-Klausel, Alternative Direkt-Vertrieb möglich |
| Steuerberaterin akzeptiert System nicht | gering | Pilot bricht ab | Premium-Setup mit Steuerberater-Erklärung, ggf. Wirt-Wechsel des Steuerberaters |
| Andreas verfügt über zu wenig Zeit | hoch im Aufbau | Roadmap verzögert sich | Realistische Aufwands-Schätzung, ggf. externer Entwickler-Sub punktuell |
| OCR-Genauigkeit niedriger als erwartet | mittel | Mehr Mitarbeiter-Touch | Mindee-Adapter beschleunigt einbauen |
| Stop-with-Cancel nicht durchsetzbar bei Agentur | gering (Steve klar) | Marge-Druck | Pricing erhöhen, Verhandlung neu |
| Krankheit / Lebensereignis Steve oder Andreas | unkalkulierbar | Roadmap kollabiert | Beide GF haben Notfall-Login + Doku, schriftliche Vertretungs-Regelung |

---

## 11. Was bewusst nicht in der Roadmap steht

- **Mobile App** für Wirt — WhatsApp deckt die Use-Cases ab
- **Eigene Buchhaltungs-Software** — wir sind Vorprodukt
- **Internationalisierung vor M5** — Deutschland-Fokus erst auslasten
- **Integration mit Steuersoftware der Steuerberater (Stotax, Addison)** — DATEV-CSV deckt 95 % ab
- **HA-Setup vor M4** — bei Pilot-Volumen nicht nötig
- **Eigenes Office** — Remote bleibt Standard
- **Komplexes Ticketsystem (Zendesk, Freshdesk)** — Discord trägt bis ~10 MA

---

## 12. Kritischer Pfad bis zum ersten zahlenden Kunden

```
[KW 20: Konzept-Reboot — 1 Woche]
        │
        ▼
[KW 21: Pilot-Vorbereitung — 1 Woche]
        │
        │ ├──► Meta-WhatsApp-Antrag (parallel, 6–10 Wochen)
        │ ├──► Anwalt-Termin SaaS-AGB (parallel, 2–3 Wochen)
        │
        ▼
[KW 22–23: P1.1 — Solo-Test mit Belegen, Discord-Webhooks live]
        │
        ▼
[KW 24: P1.2 — Twilio + Discord-Bot + Web-Chat live, Wirt schickt selbst]
        │
        ▼
[KW 25–28: Wirt nutzt produktiv, erste Monatsübergabe]
        │
        ▼
[KW 29–31: P1.3 Vorbereitung, Lessons Learned]
        │
        ▼
[KW 32: M1 — Pilot-Wirt produktiv, erster zahlender Kunde]
```

**Realistische Zeitschätzung bis erster echter zahlender Kunde:** ~12 Wochen ab KW 20 = bis Mitte August 2026.

---

## 13. Zusammenfassung in einem Absatz

ProzessPilot startet nach dem Konzept-Reboot in KW 20 (Mai 2026) sofort in die Pilot-Vorbereitung, mit dem Ziel Meilenstein M1 (erster zahlender Wirt produktiv) bis KW 32 (August 2026). Pilot läuft in drei Sub-Phasen: P1.1 Solo-Test mit manuellem Upload (KW 22–23), P1.2 Twilio + Discord-Bot live (KW 24+), P1.3 Meta-Cloud-API (sobald freigegeben). Vertriebsagentur-Launch (M2) folgt in Q4 2026 mit Ziel 5 zahlenden Tenants. Etablierung (M3) auf 25 Tenants + GbR-Umwandlung in Q2 2027. Self-Service-Reife (M4) mit 50 Tenants in Q4 2027. Skalierungs-Reife (M5) mit 100 Tenants und GmbH-Prüfung in Q3 2028. Discord-Integration ist von Tag 1 dabei, Webhook-Phase in P1.1, voller Bot ab P1.2.

---

**Letzte Aktualisierung:** 2026-05-15 (komplette Neufassung nach Konzept-Reboot)
**Verantwortlich:** Steve Bernhardt (Geschäftsführung) + Andreas (Technik)
