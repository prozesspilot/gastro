# Claude Prompt — ProzessPilot Website

> Diesen Prompt 1:1 in Claude (claude.ai) einfügen.
> Ersetze vor dem Einfügen alle `[PLATZHALTER]` mit deinen echten Werten.

---

```
Du bist ein erstklassiger Web-Designer und Conversion-Copywriter mit Erfahrung im B2B-SaaS-Bereich für deutschsprachige KMUs.

Erstelle eine vollständige, professionelle Website als eine einzige HTML-Datei (alles inline: CSS + JavaScript) für das Produkt "ProzessPilot".

---

## PRODUKT: ProzessPilot

ProzessPilot ist ein modulares KI-Automatisierungssystem für Buchhaltungsprozesse. Es richtet sich an Selbstständige, Freelancer, Gastronomie-Betriebe, Handwerker und kleine GmbHs in Deutschland, die ihre Belege heute noch manuell per Hand oder mit viel Aufwand verwalten.

**Kernversprechen:** Beleg per WhatsApp einschicken — ProzessPilot erledigt alles andere vollautomatisch: OCR-Erkennung, KI-Kategorisierung, GoBD-konforme Archivierung, Export in die Buchhaltungssoftware.

---

## PAKETE & LEISTUNGEN (exakt nach diesem Schema)

### Paket 1: BASIC
**Einmalpreis (Onboarding & Setup): [EINMALPREIS BASIC EINSETZEN]**
**Monatliche Gebühr: [MONATSPREIS BASIC EINSETZEN]**

Enthaltene Module:
- **M10 – WhatsApp Eingang:** Belege einfach per WhatsApp-Foto einschicken (WhatsApp Business Cloud API, direkt von Meta – kein Drittanbieter)
- **M01 – Belegerfassung & OCR:** Automatische Texterkennung via Google Cloud Vision API – Betrag, Datum, Lieferant, MwSt. werden zuverlässig extrahiert
- **M02 – Belegarchivierung (GoBD-konform):** Revisionssichere Ablage als PDF in Google Drive oder Dropbox, nach GoBD-Anforderungen, unveränderbar und mit Audit-Log
- **M07 – Excel / Google Sheets Export:** Jeder Beleg landet automatisch als Zeile in einer Excel-Tabelle oder Google Sheet – sofort steuerberater-fertig

Für wen: Selbstständige und Kleinunternehmer die einfach Ordnung in ihre Belege bringen wollen, ohne Buchhaltungssoftware.

---

### Paket 2: STANDARD ⭐ (Empfohlen)
**Einmalpreis (Onboarding & Setup): [EINMALPREIS STANDARD EINSETZEN]**
**Monatliche Gebühr: [MONATSPREIS STANDARD EINSETZEN]**

Alles aus Basic, plus:
- **M03 – KI-Kategorisierung & Buchungsvorbereitung:** Claude AI (von Anthropic) kategorisiert jeden Beleg automatisch nach Buchungskategorie und SKR-Kontenrahmen. Lieferanten-Overrides und branchenspezifische Regeln möglich. Genauigkeit ≥ 90% bei Standardbelegen.
- **M05 – Lexoffice-Integration:** Direkter Push aller kategorisierten Belege in Lexoffice – inkl. Beleganhang. Keine manuelle Datenübertragung mehr.
- **M06 – sevDesk-Integration:** Alternativ zu Lexoffice: vollautomatischer Export in sevDesk. Das Profil entscheidet welche Software genutzt wird.
- **M08 – Monatliches Reporting (PDF):** Automatisch generierter Ausgaben-Überblick als PDF, wird am 1. des Monats per WhatsApp und E-Mail zugestellt.

Für wen: Unternehmer die bereits Lexoffice oder sevDesk nutzen und die manuelle Datenübertragung vollständig eliminieren wollen.

---

### Paket 3: PRO
**Einmalpreis (Onboarding & Setup): [EINMALPREIS PRO EINSETZEN]**
**Monatliche Gebühr: [MONATSPREIS PRO EINSETZEN]**

Alles aus Standard, plus:
- **M04 – DATEV-Export:** Automatisch generierte DATEV-CSV-Datei (Format v2) inkl. aller Belegdateien, monatlich direkt an den Steuerberater verschickt. Keine manuelle Übergabe mehr.
- **M09 – Lieferanten-Kommunikation:** Bei unklaren oder unvollständigen Belegen schickt ProzessPilot automatisch eine Rückfrage-E-Mail an den Lieferanten und wartet auf die Antwort.
- **Custom Hooks & individuelle Anpassungen:** Eigene Kategorisierungsregeln, Cost-Center-Zuweisungen, Approval-Schwellen (z. B. "Belege über 1.000 € müssen manuell freigegeben werden"), Anbindung an Warenwirtschaftssysteme oder ERP.
- **Hook-Sandbox:** Sicheres Testen aller Automatisierungsregeln bevor sie live gehen.

Für wen: GmbHs und größere Betriebe mit Steuerberater, Filialen oder individuellen Anforderungen.

---

## SO FUNKTIONIERT ES (3 Schritte)

1. **Foto schicken** – Beleg fotografieren und per WhatsApp an die ProzessPilot-Nummer schicken. Fertig. Das war's.
2. **KI verarbeitet** – ProzessPilot erkennt automatisch Betrag, Datum, Lieferant und MwSt., kategorisiert den Beleg per KI und archiviert ihn GoBD-konform in der Cloud.
3. **Export fertig** – Der Beleg landet in Lexoffice, sevDesk oder Excel. Am Monatsende liefert ProzessPilot automatisch den Reporting-PDF und – beim Pro-Paket – die DATEV-Datei für den Steuerberater.

---

## TECHNISCHE VERTRAUENSPUNKTE (für die Zielgruppe wichtig)

- **GoBD-konform** – Revisionssichere Archivierung nach den deutschen Grundsätzen ordnungsgemäßer Buchführung
- **DSGVO-konform** – Server in Deutschland / EU, verschlüsselte Credential-Verwaltung
- **Direkte WhatsApp Business API** – Keine Drittanbieter-Weiterleitung, direkte Meta-Verbindung
- **Datensicherheit** – Alle Belege werden Kunden-seitig verschlüsselt gespeichert, vollständiges Audit-Log für jeden Beleg
- **Kein Lock-in** – Archivierung immer in deinem eigenen Google Drive oder Dropbox, nicht bei uns
- **≥ 90% KI-Genauigkeit** – Automatische Kategorisierung mit nachweisbarer Trefferquote, manuelle Korrektur immer möglich
- **Setup in unter einem Werktag** – Onboarding durch unser Team, kein technisches Wissen nötig

---

## ZIELGRUPPE (Schmerzpunkte für das Copywriting)

Primär:
- Gastronomie-Betriebe (Kassenzettel, Metro-Einkäufe, Getränkehändler)
- Handwerker (Material-Quittungen, Tankbelege, Werkzeug)
- Freelancer / Berater (Software-Abos, Reisekosten, Home-Office)
- Kleine GmbHs mit 2–20 Mitarbeitern

Typische Schmerzpunkte:
- Belegstapel vor dem Steuerberater-Termin manuell scannen/tippen
- Quittungen verlieren, oder Fotos auf dem Handy vergessen
- Excel-Tabellen manuell pflegen
- Steuerberater-Kosten steigen wegen Chaos-Unterlagen
- "Ich weiß nie was ich diesen Monat wirklich ausgegeben habe"

---

## WEBSITE-AUFBAU (Pflicht – alle Sektionen)

1. **Navigation** – Logo "ProzessPilot" + Links: Funktionen, Pakete & Preise, FAQ, Kontakt + CTA-Button "Jetzt beraten lassen" (hervorgehoben)

2. **Hero-Sektion** – Emotionale Headline die den Hauptschmerz trifft (z. B. rund um das Thema: Belegchaos, Steuerberater-Stress, WhatsApp als Lösung). Starker Subtext der das Versprechen auf den Punkt bringt. Zwei CTAs: "Kostenlos beraten lassen" (primär) + "Pakete ansehen" (sekundär). Darunter: 3–4 Trust-Badges: "GoBD-konform", "Setup in 1 Werktag", "Kein technisches Wissen nötig", "Ihre Daten bleiben Ihre Daten"

3. **Schmerz-Sektion** – "Klingt das bekannt?" – Zeige 4–6 konkrete Pain Points der Zielgruppe als Cards oder visuelle Liste. Authentisch und nah an der Realität des Alltags (kein B2B-Blabla).

4. **So funktioniert's** – Die 3 Schritte (s. oben) visuell aufbereitet mit Icons/Illustrationen und kurzen, klaren Beschreibungen.

5. **Funktionen im Detail** – Alle 10 Module in einem Card-Grid, gruppiert nach Paket (Basic / Standard / Pro). Pro Modul: Icon, Name, 1-Satz-Beschreibung, Paket-Badge.

6. **Pakete & Preise** – 3 Pricing-Cards (Basic / Standard / Pro). Standard als "Empfohlen" visuell hervorgehoben. Jede Card zeigt: Paketname, Einmalpreis (Onboarding), monatliche Gebühr, komplette Modul-Liste als Checkmark-Liste, CTA-Button. Hinweis: "Alle Preise zzgl. MwSt."

7. **Vertrauens-Sektion** – Alle technischen Vertrauenspunkte (s. oben) als Icon+Text-Grid. Seriös, konkret, keine Marketing-Phrasen.

8. **FAQ** – Mindestens 8 Fragen als aufklappbares Accordion:
   - "Muss ich technisches Wissen mitbringen?"
   - "Wie lange dauert das Onboarding?"
   - "Ist ProzessPilot GoBD-konform?"
   - "Kann ich meinen Steuerberater direkt einbinden?"
   - "Was passiert wenn die KI einen Beleg falsch kategorisiert?"
   - "Welche Buchhaltungssoftware wird unterstützt?"
   - "Wo werden meine Daten gespeichert?"
   - "Kann ich das Paket wechseln?"

9. **Finaler CTA-Banner** – Letzter starker Aufruf vor dem Footer: kurze Zusammenfassung des Versprechens + "Jetzt kostenlos beraten lassen"-Button.

10. **Footer** – Navigation-Links, Kontakt-E-Mail [KONTAKT@EMAIL.DE EINSETZEN], Impressum (Platzhalter), Datenschutz (Platzhalter), © 2026 ProzessPilot.

---

## DESIGN-ANFORDERUNGEN

- **Farbschema:** Dunkles, professionelles Design. Tiefes Dunkelblau oder Dunkelgrau als Hintergrund, leuchtendes Blau (#2563EB oder ähnlich) als Akzentfarbe, Weiß für Texte. Grüne Checkmarks. Das Design soll Vertrauen + Modernität + Zuverlässigkeit ausstrahlen – kein verspieltes Startup-Look.
- **Typografie:** Saubere Sans-Serif (z. B. Inter via Google Fonts), gute Lesbarkeit, klare Hierarchie.
- **Animationen:** Smooth Scroll, Hover-Effekte auf Buttons und Cards, sanfte Fade-in-Animationen beim Einblenden der Sektionen per Intersection Observer API.
- **Responsive:** Vollständig mobil-optimiert (Mobile-First). Pricing-Cards stapeln sich auf Mobile.
- **Sprache:** Ausschließlich Deutsch. Tonalität: professionell, klar, direkt – ohne Fachjargon, ohne Startup-Buzzwords. So wie ein vertrauenswürdiger lokaler Dienstleister sprechen würde.
- **Kein externes CSS-Framework.** Nur reines CSS mit CSS-Variablen und CSS Grid / Flexbox.
- **Alles in einer einzigen HTML-Datei** – sofort deploybar, keine externen Abhängigkeiten außer Google Fonts.

Das Ziel dieser Website ist ein einziges: Der Besucher soll nach dem Scrollen denken "Das brauche ich jetzt sofort – warum hab ich das nicht schon früher?"

Gib mir die vollständige, deploybare HTML-Datei in einem einzigen Codeblock.
```
