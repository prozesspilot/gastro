# Anwalt-Briefing — was wir von dir brauchen

> **Stand:** 2026-05-15
> **Auftraggeber:** Steve Bernhardt (Einzelunternehmer, später GbR mit Andreas), Schneverdingen, Niedersachsen
> **Empfänger:** [Anwalt-Name + Kanzlei]
> **Zweck:** Rechtssichere Vertragsdokumente für SaaS-Vertrieb an deutsche Gastronomie-Kleinunternehmer

---

## 1. Hintergrund — was ProzessPilot macht

ProzessPilot ist ein modulares **SaaS-System (Software-as-a-Service)** für deutsche Gastronomie-Kleinunternehmer (Imbisse, Cafés, Bistros, kleine Restaurants).

**Was das System tut:**

- Wirte schicken Belege (Lieferscheine, Kassenbons, Rechnungen) per WhatsApp, E-Mail oder Web-Upload an ProzessPilot
- ProzessPilot verarbeitet die Belege automatisch (OCR-Texterkennung, KI-Kategorisierung)
- Belege werden GoBD-konform archiviert (im Wirts-eigenen Cloud-Speicher: Google Drive oder Dropbox)
- Monatlich werden die aufbereiteten Buchungs-Daten an den Steuerberater des Wirts übergeben (per Mail oder direkt-Push in DATEV / Lexware Office / sevDesk)
- Endkunde bezahlt monatliches Abo (39–299 €/Monat) plus einmalige Setup-Fee (299–1499 €)
- Zielgruppe: B2B (Endkunden sind Unternehmer)

**Was ProzessPilot NICHT macht:**

- Keine Buchhaltungs-Beratung
- Keine Steuer-Beratung
- Keine Übernahme der Buchungs-Verantwortung (das bleibt beim Steuerberater des Wirts)
- Keine Ersetzung des Steuerberaters

---

## 2. Vorab-Hinweis: Bisheriger Vertragsentwurf nicht passend

Der von dir Anfang November 2025 gelieferte "Process Pilot Beratungsvertrag und AGB Erster Entwurf v 30.10.2025.odt" ist **nicht** für ProzessPilot geeignet, weil es ein generischer Beratungsvertrag ist (Stunden-Honorar, Reisekosten, Berichtspflicht "ganztägig im Hause"). Wir brauchen stattdessen **SaaS-Vertragsdokumente für ein Software-Abo-Modell** — siehe Liste in Abschnitt 5.

Die "Process Pilot Datenschutzerklärung Website Entwurf v 28.10.2025.odt" ist ein brauchbarer Anfang als **Marketing-Website-Datenschutzerklärung**, aber unvollständig (Cookies, Tracking-Tools fehlen, Platzhalter unausgefüllt) und ergänzungsbedürftig — siehe Abschnitt 5.

---

## 3. Unternehmens-Eckdaten

| Feld | Wert |
|---|---|
| Aktuelle Rechtsform | **Einzelunternehmen** Steve Bernhardt |
| Geplant ab ~25 Tenants (Q2 2027) | Umwandlung in GbR mit Andreas (geplante Aufteilung 70/30 oder 60/40) |
| Geplant ab ~75-100 Tenants (Q3-Q4 2028) | Eventuelle Umwandlung in GmbH oder UG (bei entsprechendem Cashflow) |
| Sitz | Schneverdingen, Niedersachsen |
| Aufsichtsbehörde DSGVO | Landesbeauftragte für Datenschutz und Informationsfreiheit Niedersachsen |
| Gerichtsstand | [Stadt Schneverdingen / Heidekreis-Lüneburg] |
| Anwendbares Recht | deutsches Recht |
| Berufshaftpflicht | aktuell noch abzuschließen, geplant: Hiscox / Markel / Allianz IT-Berufshaftpflicht ~300–800 €/Jahr |

---

## 4. Geschäftsmodell-Eckdaten (für Vertrags-Inhalte)

### 4.1 Pricing

| Paket | Brutto/Mt | Setup einmalig | Belege/Mt | Zielgruppe |
|---|---|---|---|---|
| Solo | 39 € | 299 € | bis 50 | Imbiss, Foodtruck |
| Standard | 79 € | 499 € | bis 250 | Café, Bistro, kleines Restaurant |
| Pro | 149 € | 799 € | bis 800 | Restaurant + 2. Standort |
| Filiale | 299 € | 1.499 € | unlimited | Mini-Kette, Gastronomie-Gruppe |

Optional: Premium-Setup für +199 € einmalig (ProzessPilot-Mitarbeiter macht komplettes Setup statt Self-Service-Wizard).

### 4.2 Vertragslaufzeit + Kündigung

- **Standard: monatlich kündbar** (Kündigungsfrist bis Monatsende, formlos in Schriftform per Mail)
- **30 Tage Geld-zurück-Garantie** ab Vertragsbeginn — Wirt bekommt Setup-Fee + alle gezahlten Beiträge zurück bei formloser Mail-Kündigung
- Optional als Wahltarif (später): 12-Monats-Vertrag mit 10% Rabatt

### 4.3 Vertriebskanal

- Vertrieb über **eine externe Vertriebsagentur als Handelsvertreter** (§§ 84 ff. HGB)
- Provision an Agentur: **50% einmalig + 50% recurring** auf alle Zahlungseingänge
- ProzessPilot bleibt **Vertragspartner des Endkunden** (nicht die Agentur)
- ProzessPilot stellt Rechnungen, betreibt Inkasso, trägt Zahlungsausfall-Risiko
- Stop-with-Cancel: Provision endet automatisch mit Endkunden-Vertrag

### 4.4 Zahlungsabwicklung

- Phase 1 (bis ~25 Tenants): manuelle Rechnung per Mail, SEPA-Überweisung
- Phase 2 (ab ~25 Tenants): Stripe-Subscriptions mit SEPA-Lastschrift + Kreditkarte
- Mahn-Workflow: 14 Tage Erinnerung, 30 Tage 1. Mahnung, 45 Tage 2. Mahnung mit Sperr-Ankündigung, 60 Tage automatische Tenant-Sperrung

### 4.5 Verarbeitete Daten + DSGVO

ProzessPilot ist **Auftragsverarbeiter** im Sinne Art. 28 DSGVO. Verarbeitete Datenkategorien:

- Stammdaten Endkunde-Wirt (Firmenname, USt-ID, Adresse, Steuernummer, Kontakt)
- Beleg-Daten (Lieferanten-Namen, Beträge, ggf. Bankverbindungen, ggf. Bewirtete-Personen-Namen)
- Steuerberater-Kontakt
- Kassen-Transaktionsdaten (via SumUp-API)
- Audit-Logs (Login-Events, Belegerfassungs-Status)
- Customer-Chat-Konversationen (zwischen Wirt und ProzessPilot-Support)

Subunternehmer (ausführliche Liste siehe `legal/Subunternehmer.md`):

- **IONOS SE** (Hosting, EU-Deutschland, Montabaur) — unkritisch
- **Google Cloud / Vision API** (USA mit EU-Region `europe-west3`) — SCCs nötig
- **Anthropic PBC** (USA, KI-Kategorisierung) — SCCs nötig
- **Discord Inc.** (USA, Mitarbeiter-Kommunikation, kein Customer-Daten-Touch) — SCCs nötig
- **SumUp Payments S.A.S.** (Frankreich, Kassen-Daten-Pull) — EU, unkritisch
- **Twilio Inc.** (USA, WhatsApp-Sandbox bis Meta-Verifizierung) — SCCs nötig
- **Meta Platforms** (USA, WhatsApp Business Cloud) — SCCs nötig
- **Stripe Payments Europe Ltd.** (Irland, später ab Phase 2) — EU, unkritisch
- **Postmark / SendGrid** (USA, Transaktionsmail) — SCCs nötig

---

## 5. Was wir konkret von dir brauchen

### 5.1 Pflicht (vor erstem zahlendem Endkunden)

1. **SaaS-AGB für Endkunden** (B2B, kein Verbraucherrecht)
   - Vorlage von uns: `legal/AGB_Endkunden_Vorlage.md`
   - Bitte rechtssicher anpassen, Form, Klauseln prüfen

2. **AVV (Auftragsverarbeitungsvertrag)** Art. 28 DSGVO
   - Vorlage von uns: `legal/AVV_Vorlage.md`
   - Mit aktuellem Subunternehmer-Verzeichnis als Anlage

3. **TOMs (Technische und Organisatorische Maßnahmen)** als AVV-Anhang
   - Vorlage von uns: `legal/TOMs_Vorlage.md`
   - Aktuelle Maßnahmen sind dort dokumentiert, bitte rechtlich prüfen

4. **Vertriebsagentur-Vertrag** (Handelsvertretervertrag)
   - Vorlage von uns: `legal/Vertriebsagentur_Vertrag_Vorlage.md`
   - Mit ausformulierten Klauseln zu Provision, Stop-with-Cancel, Soft-Exklusivität, Mindestleistung
   - Bitte rechtssicher prüfen, ggf. ergänzen

5. **Datenschutz-Hinweise Mitarbeiter-Webapp + Onboarding-Wizard + Web-Chat-Widget**
   - Vorlage von uns: `legal/Datenschutz_Webapp.md`
   - Diese sind separat von der Website-Datenschutzerklärung, weil andere Datenkategorien

6. **Cookie-Policy + Banner-Hinweistext**
   - Wir nutzen voraussichtlich nur essentielle Cookies (Auth-Session, kein Tracking)
   - Bitte Cookie-Policy-Text + Banner-Hinweistext liefern

7. **Verzeichnis Verarbeitungstätigkeiten** Art. 30 DSGVO
   - Pflicht bei jeder Datenverarbeitung
   - Wir füllen das selbst aus, brauchen aber Vorlage / Strukturvorgabe

### 5.2 Nice-to-have (nicht Pilot-Blocker)

8. **Datenschutzerklärung Marketing-Website** finalisieren (basierend auf bisherigem Entwurf vom 28.10.2025)
   - Verantwortliche-Daten ausfüllen (Steve Bernhardt, Schneverdingen)
   - Hoster (IONOS) eintragen
   - Cookies + Tracking-Hinweise ergänzen
   - Hinweis auf Webapp-DSE verlinken

9. **AGB-Update bei GbR-Umwandlung** (geplant Q2 2027) — kannst du dann bei Bedarf anpassen

10. **GbR-Vertrag** (zwischen Steve und Andreas, Q2 2027) — kommt später

---

## 6. Wichtige Klauseln die wir DRINGEND brauchen

### 6.1 Im SaaS-AGB

- **Haftungsbeschränkung Falsch-Buchung:** ProzessPilot ist Hilfsmittel, finale Buchungs-Verantwortung beim Wirt + Steuerberater. Haftung max. Jahresbeitrag, Ausschluss indirekter Schäden
- **Mitwirkungspflichten Wirt:** korrekte Stammdaten, korrekte Belege, Bewirtungs-Notizen liefern, keine Datenschutz-Verletzung im Foto-Hintergrund (z.B. Gast-Gesicht)
- **30-Tage-Geld-zurück-Garantie**: konkrete Bedingungen + Verfahren
- **Datenexport bei Kündigung**: was bekommt der Wirt zurück, in welchem Format, in welchen Fristen
- **Subunternehmer-Update-Klausel**: Wirt wird über neue Subunternehmer informiert, hat 30 Tage Widerspruchs-Recht
- **B2B-Klausel**: AGB gelten nur gegenüber Unternehmern (B2B)
- **Schriftformerfordernis**: für Kündigung Mail genügt
- **Salvatorische Klausel**

### 6.2 Im Vertriebsagentur-Vertrag

- **Stop-with-Cancel-Klausel** (zwingend, sonst geht Marge kaputt) — siehe `00_Vertriebsmodell.md` Abschnitt 4.2 für ausformulierte Klausel
- **Soft-Exklusivitäts-Klausel mit Mindestleistung** — siehe `00_Vertriebsmodell.md` Abschnitt 5.4
- **Pricing-Floor durch ProzessPilot** — Agentur darf höher, nicht niedriger verkaufen
- **Auszahlungs-Mechanik** mit Geld-zurück-Garantie-Berücksichtigung — siehe `00_Vertriebsmodell.md` Abschnitt 6
- **Stripe/Bank-Gebühren werden vollständig von ProzessPilot getragen** (nicht aus Agentur-Anteil)
- **Mindestlaufzeit 12 Monate, danach 3-Monats-Kündigungsfrist**

### 6.3 Im AVV

- **Subunternehmer-Verzeichnis als Anlage** mit Standard-Vertragsklauseln-Hinweis für US-Subunternehmer
- **Customer-Daten bleiben in EU-DB** — Discord ist nur Spiegelung, kein primärer Datenträger
- **Lösch-Pflicht 30 Tage nach Vertragsende**
- **Datenexport-Pflicht bei Kündigung**

---

## 7. Termin-Wunsch

- **Idealfall:** Erste Vertragsentwürfe in 2 Wochen ab Briefing-Übergabe (~KW 23, Ende Mai 2026)
- **Spätestens:** Pilot-Wirt unterschreibt im Juli 2026 (KW 28-30)
- **Reseller-Launch:** Ab Q4 2026 — bis dahin müssen alle Verträge final sein

---

## 8. Fragen, die wir gerne mit dir klären würden

1. Brauchst du mehr Details zu unserer Architektur? Wir haben ein vollständiges Konzept-Repo (Modulkonzept/Konzeptentwicklung/), das wir gerne teilen
2. Ist deine Kanzlei mit SaaS-Verträgen vertraut? Falls nicht, kannst du einen Kollegen einbinden oder wir müssen einen IT-/Wirtschaftsrechts-Anwalt zusätzlich konsultieren
3. Wie sind deine Stundensätze für SaaS-Verträge? Wir kalkulieren für T3 Legal-Vorlagen-Bearbeitung mit ~3.000–5.000 € einmalig
4. Empfiehlst du eine Cookie-Banner-Lösung (Cookiebot, Usercentrics) oder Eigenbau?
5. Was ist deine Empfehlung zur Berufshaftpflicht-Anbieter (Hiscox / Markel / Allianz oder andere)?
6. Brauchen wir bei Schneverdinger Sitz besondere lokale Regelungen (Heidekreis-spezifisch)?

---

## 9. Welche Konzept-Dokumente du parallel lesen solltest

Wenn du tiefer in unsere Architektur einsteigen willst, sind diese Dokumente nützlich:

| Dokument | Was du daraus brauchst |
|---|---|
| `00_Strategie_Gastro.md` | Geschäftsmodell, Zielgruppe, USP |
| `00_Vertriebsmodell.md` | **Pflicht-Lektüre** für Vertriebsagentur-Vertrag |
| `00_Architektur_Hauptdokument.md` | Tech-Stack, Subunternehmer, DSGVO-relevante Architektur |
| `Mitarbeiter_Webapp.md` | interne Zugriffs-Berechtigungen |
| `Discord_Integration.md` | Mitarbeiter-Kommunikation + Customer-Bridge |
| `Web_Chat_Widget.md` | Customer-Touchpoint |
| `Onboarding_Wizard.md` | Customer-Setup-Flow + Magic-Link-Mechanik |
| `modules/M12_DSGVO.md` | DSGVO-Workflows + GoBD-Verfahrensdoku |

---

## 10. Was wir von dir nicht brauchen

- **Kein Beratungsvertrag** (das war der bisherige Entwurf — passt nicht)
- **Keine Mitarbeiterverträge** (kommen später, frühestens 2027)
- **Keine Mietverträge** (Remote-Work, kein Büro)
- **Keine Internationalisierungs-Verträge** (nur Deutschland-Markt vorerst)

---

## 11. Kontakt für Rückfragen

- **Steve Bernhardt** (Geschäftsführer)
- E-Mail: steve@prozesspilot.net
- Telefon: [eintragen]
- Adresse: [eintragen Schneverdingen]
- Discord: für interne Kommunikation, externe nur per Mail/Telefon

---

**Letzte Aktualisierung:** 2026-05-15
**Verantwortlich:** Steve Bernhardt (Geschäftsführung)
