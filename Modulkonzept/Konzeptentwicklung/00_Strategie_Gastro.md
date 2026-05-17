# 00 — Strategie Gastro

> **Status:** Erstfassung 2026-05-15
> **Zielgruppe:** Geschäftsführung, Vertriebsagentur, neue Mitarbeiter, externe Stakeholder
> **Verhältnis zu anderen Dokumenten:** Dieses Dokument ist die Foundation. `00_Vertriebsmodell.md`, `00_Pilot_Strategie.md` und `05_Roadmap.md` referenzieren darauf. Bei Konflikten gilt dieses Dokument.

---

## 1. Mission

ProzessPilot senkt Steuerberater-Kosten und manuellen Arbeitsaufwand für Gastronomie-Kleinunternehmer durch automatisierte Belegerfassung, Kategorisierung, GoBD-konforme Archivierung und direkten Übergabe-Workflow an den Steuerberater.

**Was ProzessPilot ausdrücklich nicht ist:**
- Kein Steuerberater-Tool (Steuerberater bleibt Steuerberater des Wirts)
- Kein Buchhaltungs-System (Buchhaltung läuft weiter beim Steuerberater)
- Kein Kassensystem (Kasse bleibt Kasse, ProzessPilot liest nur aus)
- Kein Customer-facing-Tool im klassischen Sinne (der Wirt sieht keine komplexe Webapp — er fotografiert mit WhatsApp und ist fertig)

Das Produkt ist ein **stiller Operator** zwischen Beleg-Eingang und Steuerberater. Die ganze Komplexität läuft im Hintergrund.

---

## 2. Zielgruppe — Gastronomie-Kleinunternehmer

### 2.1 Warum diese Zielgruppe gewählt wurde

Die Gastronomie ist eine Branche mit **vier strukturellen Eigenschaften**, die ProzessPilot überdurchschnittlich wertvoll machen:

1. **Sehr hohes Belegvolumen pro Betrieb.** Ein Restaurant verarbeitet im Schnitt 50–300 Belege pro Monat — Lieferanten-Lieferscheine, Großhandelsbelege, Getränke-Lieferungen, Bareinkäufe, Tankquittungen, Bewirtungsbelege, Z-Bons.
2. **TSE-Pflicht und scharfe GoBD-Realität.** Kassennachschau ist in der Gastronomie wahrscheinlicher als in jeder anderen Branche. Belegarchivierung muss bombensicher sein, sonst Steuernachzahlung + Schätzung durch das Finanzamt.
3. **Mobile Arbeitsweise.** Der Wirt steht im Laden, nicht am Schreibtisch. Klassische Belegerfassungs-Tools (Scanner, PC-Software) passen nicht zu seinem Tag. WhatsApp-Foto vom Lieferschein abends in 5 Sekunden — passt.
4. **Dünne Marge und hoher Kostendruck.** Steuerberater-Stunden für Belegsortierung sind ein direkter Profit-Hebel. Wer hier 100–400 € pro Monat sparen kann, hört zu.

Andere Branchen (Handwerk, Freiberufler, Handel, Online-Shops) wären auch möglich, aber nicht so klar profilierbar. **Gastro-Fokus ist eine bewusste strategische Verengung**, um Marketing, Vertrieb und Produkt-Tiefe zu konzentrieren. Erweiterung auf andere Branchen ist später möglich, hat aber für die Pilot- und Skalierungs-Phase keine Priorität.

### 2.2 Persona-Profile

ProzessPilot bedient vier Persona-Stufen, die jeweils einem Pricing-Paket zugeordnet sind.

#### Persona 1: Solo-Wirt (Imbiss / Foodtruck / kleiner Kiosk)

| Attribut | Beschreibung |
|---|---|
| Mitarbeiter | 1 (selten 2) |
| Belegvolumen | 20–50 pro Monat |
| Lieferanten | 3–8 wiederkehrende (Metro, Getränkelieferant, Frischedienst) |
| Kasse | meist SumUp Kartenterminal oder einfache PC-Kasse |
| Steuerberater-Bindung | Ja, zahlt monatlich 80–200 € |
| Tech-Affinität | gering bis mittel |
| Schmerz-Punkt #1 | Belege gehen verloren / vergessen |
| Schmerz-Punkt #2 | Steuerberater meckert über Belegchaos |
| Pricing-Paket | **Solo €39/Mt** |

#### Persona 2: Café / Bistro / kleines Restaurant

| Attribut | Beschreibung |
|---|---|
| Mitarbeiter | 4–15 |
| Belegvolumen | 100–250 pro Monat |
| Lieferanten | 8–20 wiederkehrende (Metro, Edeka Foodservice, Lekkerland, mehrere Getränkemarken, Wäschelieferant, Reinigung) |
| Kasse | orderbird, Lightspeed, ready2order, Sumup POS Pro |
| Steuerberater-Bindung | Ja, zahlt monatlich 200–500 € |
| Tech-Affinität | mittel |
| Schmerz-Punkt #1 | Eigene Zeit für Belegsortierung (3–5 Std/Mt) |
| Schmerz-Punkt #2 | Steuerberater-Mehrkosten durch Belegchaos |
| Pricing-Paket | **Standard €79/Mt** |

#### Persona 3: Restaurant + 2. Standort / mittelgroßer Gastrobetrieb

| Attribut | Beschreibung |
|---|---|
| Mitarbeiter | 15–30 |
| Belegvolumen | 250–600 pro Monat |
| Lieferanten | 20–40 wiederkehrende, plus regelmäßiges Bewirtungs-Aufkommen |
| Kasse | Vectron, Hypersoft, Lightspeed Multi-Standort |
| Steuerberater-Bindung | Ja, zahlt monatlich 400–900 € |
| Tech-Affinität | mittel bis hoch |
| Schmerz-Punkt #1 | Multi-Standort-Koordination |
| Schmerz-Punkt #2 | DATEV-Übergabe muss strukturiert sein |
| Pricing-Paket | **Pro €149/Mt** |

#### Persona 4: Mini-Kette / Gastronomie-Gruppe

| Attribut | Beschreibung |
|---|---|
| Mitarbeiter | 30+ |
| Belegvolumen | 600+ pro Monat |
| Lieferanten | 40+, Zentralregie über mehrere Standorte |
| Kasse | meist mehrere Systeme parallel |
| Steuerberater-Bindung | Ja, oft zentrale Buchhaltung mit Steuerberater-Anbindung |
| Tech-Affinität | hoch, hat eigene Buchhaltungs-Verantwortliche |
| Schmerz-Punkt #1 | Konsolidierung über Standorte hinweg |
| Schmerz-Punkt #2 | Custom-Anpassungen für eigene Workflows |
| Pricing-Paket | **Filiale €299/Mt** + Custom-Plugins (Pro-Erweiterung) |

### 2.3 Anti-Persona — wer bewusst nicht bedient wird

Folgende Profile sind **kein Kunde** für ProzessPilot, weder im MVP noch später:

- **Großketten und Franchise-Systeme** (McDonald's, Vapiano, Hans im Glück): haben eigene IT, eigene Buchhaltungs-Abteilung, eigene SAP-Pipelines. Zu komplex für unser System.
- **Hotels mit Restaurant**: PMS-Anbindung (Protel, Apaleo, Mews) wäre zwingend. Das ist eigene Branche.
- **Gastro-Betriebe ohne Steuerberater** (sehr selten): Wir verkaufen Steuerberater-Kosten-Senkung. Wer keinen Steuerberater hat, hat unseren USP nicht.
- **Wirte ohne WhatsApp/Smartphone-Affinität**: Wer auch heute schon Bauch- statt Tech-Workflow hat, wird zu Setup-intensiv und Support-intensiv.

---

## 3. Markt-Analyse

### 3.1 Größe des Gastro-Marktes Deutschland

Quelle: Statistisches Bundesamt, DEHOGA-Branchenbericht (Stand 2024–2025, fortgeschrieben).

| Kennzahl | Wert |
|---|---|
| Gastronomie-Betriebe gesamt | ca. 245.000 |
| Davon Restaurants | ca. 73.000 |
| Davon Cafés / Bistros | ca. 28.000 |
| Davon Bars / Schänken | ca. 35.000 |
| Davon Imbiss / Take-Away | ca. 41.000 |
| Davon Sonstige (Caterer, Foodtrucks, etc.) | ca. 68.000 |
| Anteil Solo + bis 5 Mitarbeiter | ca. 60 % (= 147.000 Betriebe) |
| Anteil 6–15 Mitarbeiter | ca. 28 % (= 68.600 Betriebe) |
| Durchschnittliche Belege pro Betrieb / Monat | 80–200 |

**Total Addressable Market (TAM) für ProzessPilot:**

Wenn nur Persona 1 + 2 (Solo bis 15 MA) = ca. **215.000 Betriebe**.

Bei realistischer Marktdurchdringung in einer Nischen-Phase von **0,5 % bis 2 %** ergeben sich **1.000 bis 4.300 Tenants** als realistisches Markt-Potenzial — bevor breitere Marketing-Kanäle gezündet werden müssen.

Das ist groß genug, um ein gesundes Geschäft daraus zu bauen, ohne dass Marktsättigung in den ersten 5 Jahren ein Thema wird.

### 3.2 Belegvolumen und damit verbundene Kosten

Schätzung aus Branchen-Erfahrung und Steuerberater-Befragung:

| Persona | Belege/Mt | Std Steuerberater-Sortierung | Steuerberater-Sortier-Kosten |
|---|---|---|---|
| Solo | 30 | 0,5–1 | 75–180 €/Mt |
| Standard | 150 | 1,5–3 | 225–540 €/Mt |
| Pro | 400 | 3–6 | 450–1.080 €/Mt |
| Filiale | 800+ | 6+ | 900+ €/Mt |

Diese Zahlen sind **direkter Hebel für die Spar-Rechnung** (siehe Kapitel 7) und bilden die Grundlage des Verkaufsarguments.

### 3.3 Digitalisierungs-Stand der Zielgruppe

Realität in der deutschen Gastronomie 2026 (Schätzung basierend auf DEHOGA-Daten):

| Status | Anteil | ProzessPilot-Relevanz |
|---|---|---|
| Schuhkarton-Wirt (alles auf Papier) | ca. 35 % | Höchster Hebel — größter Wow-Effekt |
| Wirt scannt selbst und mailt an Steuerberater | ca. 35 % | Mittlerer Hebel — Workflow ersetzen |
| Wirt nutzt eigenes Buchhaltungs-Tool (Lexoffice/sevDesk) | ca. 20 % | Niedriger Hebel — wir sind Vorprodukt |
| Wirt hat schon spezialisiertes Belegtool (CANDIS o.ä.) | ca. 10 % | Konkurrenz-Verdrängung notwendig |

→ **Die ersten 70 % des Marktes** sind klassische Belege-zum-Steuerberater-Schicker. Genau hier liegt der primäre Vertriebs-Fokus.

---

## 4. Konkurrenz-Analyse

### 4.1 Direkte Konkurrenten — allgemeine Belegerfassungs-Tools

#### CANDIS (candis.io)

- **Positionierung:** Belegmanagement für Selbstständige + KMU
- **Pricing:** ab 49 €/Mt (Solo), 89 €/Mt (Team), individuelle Pakete
- **Stärken:** Etabliert seit 2015, breite DATEV-Integration, viele Buchhaltungs-Anbindungen
- **Schwächen:**
  - Keine Branchen-Spezialisierung — Gastro-Spezial-Themen (Bewirtung, Pfand, MwSt-Splitting) nicht hervorgehoben
  - Kein WhatsApp-Eingang (E-Mail + Web-Upload)
  - Keine GoBD-Verfahrensdoku-Generierung
  - Customer macht Setup selbst (UX dafür mittelmäßig)
- **ProzessPilot-Differenzierung:** Gastro-Spezialfälle out-of-the-box, WhatsApp-First, automatische GoBD-Doku, Setup-Service

#### GetMyInvoices (getmyinvoices.com)

- **Positionierung:** Rechnungs-Sammler aus Online-Portalen + Mail
- **Pricing:** ab 13 €/Mt (sehr günstig)
- **Stärken:** Günstig, gute API-Anbindung an Lieferantenportale (Amazon, Telekom, etc.)
- **Schwächen:**
  - Nicht für physische Belege (Lieferscheine vom Großhändler)
  - Keine OCR-Postprocessing-Tiefe
  - Kein Gastro-Spezialfokus
- **ProzessPilot-Differenzierung:** Wir sind keine reine Sammel-Plattform, sondern verarbeiten + kategorisieren + übergeben. Andere Tiefe.

#### BuchhaltungsButler (buchhaltungsbutler.de)

- **Positionierung:** Buchhaltungs-Tool mit OCR + automatischer Buchung
- **Pricing:** ab 35 €/Mt (Single), 79 €/Mt (Team)
- **Stärken:** Eigene Buchhaltungs-Software inklusive, viele Banken-Integrationen
- **Schwächen:**
  - Will Steuerberater **ersetzen** (dort, wo Wirt das selbst kann) — passt nicht zu Gastro-Steuerberater-Welt
  - Komplexere Bedienung
  - Kein WhatsApp
  - Kein Branchen-Fokus
- **ProzessPilot-Differenzierung:** Wir ersetzen den Steuerberater explizit nicht, sondern entlasten ihn (passt zu Gastro-Realität).

#### FastBill (fastbill.com)

- **Positionierung:** Rechnungstool mit Belegerfassung als Add-on
- **Pricing:** ab 9 €/Mt (Solo), 25 €/Mt (Team), 79 €/Mt (Pro)
- **Stärken:** Sehr günstig, einfach
- **Schwächen:** Belegerfassung ist Nebenfeature, OCR-Tiefe begrenzt, kein Gastro-Spezial
- **ProzessPilot-Differenzierung:** Wir sind dediziertes Belegtool, kein Rechnungstool mit OCR-Add-on

### 4.2 Indirekte Konkurrenten — eingebaute OCR in Buchhaltungs-Tools

#### sevDesk-eigene Belegerkennung
Eingebaut, kostet nichts extra. Nutzbar für Wirte die sevDesk schon haben. Reicht für 80 % der Standard-Fälle, scheitert bei Gastro-Sonderfällen (Bewirtung, MwSt-Splitting).

#### Lexware Office Belegerkennung
Ähnlich wie sevDesk — eingebaut, OK für Standard, Lücken bei Branchen-Sonderfällen.

#### DATEV Unternehmen Online — Belegmanagement
Direkt vom Steuerberater bereitgestellt, kostet den Wirt 5–15 €/Mt zusätzlich zu Steuerberater-Honorar. Funktioniert technisch, aber Wirt muss selbst sortieren und korrekt taggen — keine Automatisierung.

**ProzessPilot-Differenzierung gegenüber dieser Schiene:** Wir nehmen dem Wirt die Arbeit ab statt nur ein Upload-Portal zu bieten.

### 4.3 Branchenspezifische Konkurrenten — Kassen-Hersteller mit Buchhaltungs-Anbindung

#### Orderbird Connect / Lightspeed Buchhaltungs-Export
Eingebaut in moderne Cloud-Kassen, exportiert Tagesumsätze direkt zum Steuerberater. **Aber:** macht nur Tagesumsatz-Übergabe (Z-Bon-Export), keine Lieferanten-Beleg-Verarbeitung. ProzessPilot deckt das andere Ende ab — wir konkurrieren nicht direkt, wir ergänzen.

→ Tatsächlich besteht hier ein **Partnerschafts-Potenzial** (Kassen-Anbieter empfiehlt ProzessPilot für die "andere Hälfte" der Buchhaltung). Phase 4+.

### 4.4 Klassische Konkurrenz — der Schuhkarton

Größter realer Konkurrent ist **kein Tool, sondern Trägheit**: Wirt hat sich an seinen Schuhkarton-zum-Steuerberater-Workflow gewöhnt. Steuerberater meckert, aber alle leben damit. Wechsel-Hürde ist Komfort + Gewohnheit, nicht Funktion.

**Vertriebs-Konsequenz:** Vertriebsagentur muss den **konkreten Spar-Effekt in Euro** zeigen, nicht abstrakte Vorteile. Spar-Rechnung pro Wirt ist Verkaufs-Killer.

### 4.5 Konkurrenz-Matrix Zusammenfassung

| Konkurrent | Pricing | Gastro-Fokus | WhatsApp | GoBD-Doku | DATEV | Lexware | sevDesk |
|---|---|---|---|---|---|---|---|
| CANDIS | 49–89 € | nein | nein | nein | ja | ja | ja |
| GetMyInvoices | 13 € | nein | nein | nein | ja | ja | ja |
| BuchhaltungsButler | 35–79 € | nein | nein | nein | ja | nein | ja |
| FastBill | 9–79 € | nein | nein | nein | ja | ja | nein |
| sevDesk-OCR | inkludiert | nein | nein | nein | nein | nein | ja (eigen) |
| Lexware-OCR | inkludiert | nein | nein | nein | nein | ja (eigen) | nein |
| **ProzessPilot** | 39–299 € | **ja** | **ja** | **ja, auto** | **ja** | **ja** | **ja** |

---

## 5. Wert-Versprechen und USP

### 5.1 Kernbotschaft

> **ProzessPilot senkt deine Steuerberater-Kosten um 60–80 % und nimmt dir 3–5 Stunden Belegarbeit pro Monat ab. Du fotografierst Belege per WhatsApp. Den Rest machen wir.**

### 5.2 Sieben Differenzierungs-Punkte gegenüber Konkurrenz

1. **Gastro-Spezialfälle out-of-the-box.** Bewirtungsbeleg-Workflow (Anlass + Teilnehmer abfragen, 70 %/30 % buchen). MwSt-Splitting 7 %/19 % automatisch. Pfand-Trennung. Kleinbetragsregelung. USt-Status-Erkennung. Kein anderer Wettbewerber hat das.

2. **WhatsApp als primärer Eingangskanal.** Wirt fotografiert Lieferschein abends in 5 Sekunden — keine App-Installation, kein Login, kein PC. Andere bieten E-Mail, Upload, Scanner-App — aber nicht den Workflow den ein Wirt tatsächlich macht.

3. **GoBD-Verfahrensdokumentation automatisch generiert.** Pro Tenant individuell, monatlich aktualisiert, PDF-Output für Kassennachschau. Niemand sonst macht das. Spart dem Wirt eine Aufgabe die er sonst überhaupt nicht erledigen kann.

4. **Multi-Steuerberater-System-fähig.** DATEV (70 % Marktanteil), Lexware Office (12 %), sevDesk (5 %), Stotax/Addison (über DATEV-CSV) — wir bedienen ~95 % der deutschen Steuerberater-Welt. Kein Lock-in auf einen Buchhaltungs-Anbieter.

5. **Spar-Counter monatlich an den Wirt.** Jeden Monat sieht der Wirt schwarz auf weiß, wie viel ProzessPilot ihm gespart hat. Reduziert Kündigungsquote enorm. Niemand sonst macht das so transparent.

6. **Setup-Service durch Mitarbeiter (Premium-Setup).** Wirt muss nicht selbst durch komplexes Setup. Onboarding-Wizard für Self-Service ist da, aber Premium-Kunde bekommt's kompletten Rundum-Setup. Hebt sich ab von Self-Service-Tools wo der Wirt allein gelassen wird.

7. **Kassensystem-Connector (M15).** SumUp im MVP, orderbird/Lightspeed/ready2order in Phase 2. Tagesabschluss kommt automatisch ins System, nicht erst durch manuelles Foto. Reduziert Wirt-Aufwand auf nahe null bei Cloud-Kassen-Wirten.

### 5.3 Was wir bewusst nicht versprechen

- **Kein vollautomatisches Buchen.** Steuerberater bleibt finale Kontroll-Instanz. Wir kategorisieren vor, er prüft.
- **Keine 100 % OCR-Genauigkeit.** Bei < 80 % Confidence wird ein Mitarbeiter-Task erzeugt, Wirt wird ggf. zurückgefragt. Wir versprechen 95 %+ Genauigkeit über alle Belege, keine 100 %.
- **Keine Steuerberatung.** Wir sind ein Tool, kein Berater. Steuerliche Fragen gehen an den Steuerberater.

---

## 6. Pricing-Strategie

### 6.1 Pricing-Philosophie

Drei Grundprinzipien:

1. **Pricing-Floor durch ProzessPilot.** Vertriebsagentur kann höher verkaufen (mehr Provision für sie), aber nicht niedriger. Verhindert Preisdumping.
2. **Marge muss nach 50 % Provision noch tragen.** Jeder Tenant muss nach Abzug Provision + Variable Cost (API + Hosting) + Stripe/Bankgebühren positiv sein.
3. **Setup-Fee deckt Onboarding-Aufwand.** Bei 50 % Provisions-Abzug auch auf Setup muss der PP-Anteil mindestens den Onboarding-Stunden-Aufwand decken.

### 6.2 Pricing-Tabelle Standard

| Paket | Brutto/Mt | Belege/Mt inkl. | Setup einmalig | Zielgruppe |
|---|---|---|---|---|
| **Solo** | 39 € | bis 50 | 299 € | Imbiss, Foodtruck, Solo-Wirt |
| **Standard** | 79 € | bis 250 | 499 € | Café, Bistro, kleines Restaurant |
| **Pro** | 149 € | bis 800 | 799 € | Restaurant + 2. Standort |
| **Filiale** | 299 € | unlimited | 1.499 € | Mini-Kette, Gastronomie-Gruppe |

**Zusatz-Optionen je Paket:**
- Premium-Setup (PP klickt komplett selbst): +199–399 € einmalig
- Mehrbeleg-Pauschale wenn Limit überschritten: 0,50 € pro Extra-Beleg (alternativ Auto-Upgrade-Vorschlag bei 100 % Limit)
- Custom-Plugin für Filiale-Kunden: ab 999 € einmalig + monatlicher Wartungs-Anteil

### 6.3 Marge-Rechnung pro Paket nach allen Abzügen

Annahme: 50 % Vermittlungsprovision an Vertriebsagentur, ~3 % Stripe/Bankgebühren, Variable Costs (Vision OCR + Claude API + Hosting-Anteil).

| Paket | Brutto | Provision (50 %) | Stripe (~3 %) | Variable | **PP-Marge/Mt** |
|---|---|---|---|---|---|
| Solo €39 | 39,00 € | -19,50 € | -1,20 € | -2,55 € | **15,75 €** |
| Standard €79 | 79,00 € | -39,50 € | -2,40 € | -3,50 € | **33,60 €** |
| Pro €149 | 149,00 € | -74,50 € | -4,50 € | -6,00 € | **64,00 €** |
| Filiale €299 | 299,00 € | -149,50 € | -9,00 € | -12,00 € | **128,50 €** |

**Setup-Fee-Marge:**

| Paket | Setup-Brutto | Provision (50 %) | Stripe (~3 %) | Onboarding-Aufwand | **PP-Setup-Marge** |
|---|---|---|---|---|---|
| Solo | 299 € | -149,50 € | -9,00 € | ~1 Std @ 100 €/h = 100 € | **40,50 €** |
| Standard | 499 € | -249,50 € | -15,00 € | ~1,5 Std = 150 € | **84,50 €** |
| Pro | 799 € | -399,50 € | -24,00 € | ~2 Std = 200 € | **175,50 €** |
| Filiale | 1.499 € | -749,50 € | -45,00 € | ~4 Std = 400 € | **304,50 €** |

### 6.4 Strategische Lesart der Marge

- **Solo trägt sich, ist aber dünn.** Kein Marketing-Push für Solo, nur als Eintritts-Paket wenn Wirt explizit fragt. Bei Solo darf praktisch kein Mitarbeiter-Touch nach Onboarding mehr passieren — sonst wird's verlustig.
- **Standard ist Brot-und-Butter.** 33,60 € Marge × 100 Tenants = 3.360 € pro Monat. Trägt einen Mitarbeiter teilweise.
- **Pro ist Cashcow.** 64 €/Mt Marge × 50 Tenants = 3.200 €/Mt. Lohnt sich, hier den Vertriebs-Fokus zu setzen.
- **Filiale ist Sahne.** 128,50 €/Mt × 25 Tenants = 3.213 €/Mt — komplett tragender Mitarbeiter aus 25 Filiale-Kunden.

**Empfohlener Kunden-Mix für 100 Tenants:**

| Paket | Anteil | Monats-Marge |
|---|---|---|
| Solo | 10 % = 10 Tenants | 158 € |
| Standard | 50 % = 50 Tenants | 1.680 € |
| Pro | 30 % = 30 Tenants | 1.920 € |
| Filiale | 10 % = 10 Tenants | 1.285 € |
| **Total** | **100 Tenants** | **5.043 €/Mt** |

Plus Setup-Fee-Marge (jährlich verteilt): bei 50 % Churn-Recovery (= 50 neue Setups/Jahr) ca. 5.000 €/Jahr zusätzlich.

→ Ab **100 Tenants** ist eine Vollzeit-Mitarbeiter-Stelle gedeckt, ab 200 zwei Stellen.

### 6.5 30-Tage Geld-zurück-Garantie

Grundsatz: Wirt kann innerhalb 30 Tagen nach Vertragsbeginn formlos zurücktreten und bekommt alles zurück (Setup-Fee + erste Monatsrate). Kein Kleingedrucktes.

**Warum:** Reduziert Verkaufs-Hürde massiv. Wer das Produkt 30 Tage nutzt und es nicht überzeugt, war ohnehin kein Langzeit-Kunde.

**Konsequenz für Provisions-Auszahlung:** Vermittlungsprovision wird erst nach Ablauf der Garantie-Frist + ein paar Tagen Puffer ausgezahlt (Auszahlungs-Termin am 15. des Folgemonats nach Garantie-Ablauf). Details siehe `00_Vertriebsmodell.md`.

### 6.6 Vertragslaufzeit

Standard: **monatlich kündbar** (Kündigungsfrist bis Monatsende). Niedrige Verkaufs-Hürde.

Optional als Wahl-Tarif: **12-Monats-Vertrag mit 10 % Rabatt.** Wer Planungs-Sicherheit gibt, bekommt günstigere Konditionen. Das wird im Vertrieb erst ab Phase 4 (nach validiertem Pilot) aktiv beworben.

---

## 7. Spar-Rechnungs-Template

Das ist das wichtigste Vertriebs-Werkzeug. Vertriebsagentur muss bei jedem Wirt eine konkrete Spar-Rechnung anbieten können — nicht generisch, sondern auf den Wirt zugeschnitten.

### 7.1 Berechnungs-Formel

```
MONATLICHE ERSPARNIS (€/Mt) =
   (Heutige Steuerberater-Sortier-Kosten)
 + (Heutige Wirt-Eigenzeit × Wirt-Stundenwert)
 + (Skonto-Ersparnis durch rechtzeitige Zahlung)
 - (ProzessPilot-Monatsbeitrag)
 - (Anteil ProzessPilot-Setup-Fee, gleichmäßig über 12 Monate)
```

### 7.2 Beispiel-Rechnung Standard-Wirt (Café, 4 Mitarbeiter, ~150 Belege/Mt)

| Position | Heute | Mit ProzessPilot | Differenz |
|---|---|---|---|
| Steuerberater-Sortier-Aufwand | 2 Std × 150 € = 300 € | 0,5 Std × 150 € = 75 € | **+225 €/Mt** |
| Eigene Wirt-Zeit für Belege | 4 Std × 30 € = 120 € | 30 Min × 30 € = 15 € | **+105 €/Mt** |
| Skonto-Ersparnis (Phase 2) | 0 € | ~30 € | +30 €/Mt |
| ProzessPilot Standard | 0 € | -79 € | -79 €/Mt |
| Setup-Fee anteilig (499 € / 12 Mt) | 0 € | -41,58 € | -41,58 €/Mt |
| **Netto-Vorteil pro Monat** | — | — | **+239,42 €/Mt** |

→ **Über 12 Monate gerechnet: 2.873 €/Jahr Netto-Vorteil** für diesen Wirt.

### 7.3 Beispiel-Rechnung Solo-Wirt (Imbiss, 1 Person, ~30 Belege/Mt)

| Position | Heute | Mit ProzessPilot | Differenz |
|---|---|---|---|
| Steuerberater-Sortier-Aufwand | 0,75 Std × 150 € = 112,50 € | 0,2 Std × 150 € = 30 € | +82,50 €/Mt |
| Eigene Wirt-Zeit für Belege | 1,5 Std × 25 € = 37,50 € | 15 Min × 25 € = 6,25 € | +31,25 €/Mt |
| ProzessPilot Solo | 0 € | -39 € | -39 €/Mt |
| Setup-Fee anteilig (299 € / 12 Mt) | 0 € | -24,92 € | -24,92 €/Mt |
| **Netto-Vorteil pro Monat** | — | — | **+49,83 €/Mt** |

→ **Über 12 Monate: 598 €/Jahr Netto-Vorteil** — für Solo-Wirt knapp aber positiv. Verkaufsargument primär: "Du sparst dir die Belegarbeit und gewinnst Zeit, das Geldargument ist Beifang."

### 7.4 Spar-Rechnung als Tool

Empfehlung: Web-basiertes Spar-Rechner-Tool mit Eingabefeldern:
- Heutige Steuerberater-Kosten/Mt (Kennzahl, der Wirt weiß sie ungefähr)
- Geschätzte Steuerberater-Sortier-Stunden (Schieber 1–8 Std)
- Eigene Wirt-Zeit pro Monat (Schieber)
- Wirt-Stundenwert (Default 25–40 € je nach Persona)
- Belegvolumen (zur Paket-Empfehlung)

Output:
- Empfohlenes Paket
- Monatliche Ersparnis €
- Jährliche Ersparnis €
- Amortisations-Zeitpunkt der Setup-Fee

Dieses Tool ist **Pflicht-Asset für die Vertriebsagentur** und wird im Sales-Material referenziert.

---

## 8. Risiken und Mitigation

### 8.1 Markt-Risiko

| Risiko | Wahrscheinlichkeit | Wirkung | Mitigation |
|---|---|---|---|
| Gastro-Wirte digitalisieren langsamer als gedacht | mittel | Vertriebs-Volumen niedrig | Vertriebsagentur muss Geduld haben, Konzept auf 18-Monats-Aufbau ausgelegt |
| Konkurrenz spezialisiert sich auch auf Gastro | mittel | Margen-Druck | First-Mover-Vorteil nutzen, Branchen-Tiefe ausbauen, langfristige Wirt-Bindung über GoBD-Doku + Spar-Counter |
| Inflation/Krise drückt Gastro-Investitionsbereitschaft | hoch | weniger Neuabschlüsse | Solo-Paket als Eintritts-Hürde, monatlich kündbar als Verkaufs-Argument |

### 8.2 Vertriebs-Risiko

| Risiko | Wahrscheinlichkeit | Wirkung | Mitigation |
|---|---|---|---|
| Vertriebsagentur unterperformt | hoch | wenig Wachstum, blockiert Pipeline | Soft-Exklusivität mit Mindestleistung im Vertrag verankern (siehe 00_Vertriebsmodell) |
| Quertreibender Steuerberater | hoch | Wirt kündigt nach 1–3 Monaten | Sales-Material zeigt Wirt konkrete Spar-Rechnung als Verhandlungs-Hebel; Premium-Setup bietet PP-Anruf beim Steuerberater zur Erklärung |
| Reseller-Provision nicht tragbar bei Trailing-Klausel | mittel | Marge bricht weg | Stop-with-Cancel-Klausel zwingend im Vertrag |

### 8.3 Operatives Risiko

| Risiko | Wahrscheinlichkeit | Wirkung | Mitigation |
|---|---|---|---|
| OCR-Genauigkeit bei kleinen Wirten zu niedrig | mittel | Mitarbeiter-Aufwand explodiert, Wirt frustriert | Mindee als zweiter OCR-Provider in Phase 2 vorbereitet; Confidence-Threshold konfigurierbar pro Tenant |
| Steuerberater-System-Vielfalt (Stotax/Addison/Sonstige) explodiert | niedrig | Custom-Export-Konfigurator nötig | Universal-Fallback DATEV-CSV deckt 95 % ab; Phase 3 ggf. dedizierte Adapter |
| Datenpanne / Hack | niedrig | Reputations-Schaden, Bußgeld | Incident-Response-Plan in `infra/runbook/`, EU-Hosting, Berufshaftpflicht abgeschlossen |

### 8.4 Compliance-Risiko

| Risiko | Wahrscheinlichkeit | Wirkung | Mitigation |
|---|---|---|---|
| AVV nicht sauber → DSGVO-Bußgeld | gering wenn vorbereitet | hoch | AVV-Vorlage im Repo, Anwalts-Check vor erstem Wirt |
| Falsch-Buchung führt zu Steuernachzahlung beim Wirt | mittel | Reputationsschaden, mögl. Klage | AGB-Haftungsbeschränkung, Berufshaftpflicht, Steuerberater bleibt finale Kontroll-Instanz |
| GoBD-Verfahrensdoku fehlerhaft → Wirt fällt durch Kassennachschau | gering | hoher Reputationsschaden | Generator pro Tenant individuell, monatliches Review-Pflicht-Workflow im Mitarbeiter-Dashboard |

### 8.5 Was bewusst nicht im Risiko-Register steht

- **Server-Ausfall / Backup-Verlust:** ist im `infra/runbook/` operativ behandelt, kein Strategie-Thema mehr.
- **Anthropic Claude API ändert Pricing:** Variable-Cost-Anteil ist klein (~1 €/Mt pro Standard-Tenant), Pricing-Druck verkraftbar.
- **Google Vision API verschwindet:** Mindee-Adapter ist vorbereitet, Wechsel innerhalb 2 Wochen möglich.

---

## 9. Was diese Strategie ausdrücklich offen lässt

Folgende Themen sind bewusst **nicht** in dieser Strategie festgelegt und werden später entschieden:

- **Internationale Expansion** (Österreich, Schweiz): nicht vor 200 Tenants in Deutschland
- **Andere Branchen** (Handwerk, Handel): nicht vor validiertem Gastro-Erfolg
- **Eigene Buchhaltungs-Software**: nie — wir sind Vorprodukt, kein Ersatz
- **Mobile App für Wirt**: nicht nötig, WhatsApp deckt die Use-Cases ab
- **Self-Service-Portal für Wirt**: nicht im MVP, evtl. ab Phase 4 für Pro+Filiale-Kunden mit Belege-Suche
- **Affiliate-Programm für Steuerberater**: bewusst nicht eingebaut — würde dem USP "Steuerberater-Kosten senken" widersprechen, da Steuerberater dann an Belegerfassungs-Kosten verdient

---

## 10. Zusammenfassung in einem Absatz

ProzessPilot ist ein Belegerfassungs- und Übergabe-Tool für deutsche Gastronomie-Kleinunternehmer. Es senkt Steuerberater-Kosten um 60–80 % und nimmt dem Wirt 3–5 Stunden manuelle Belegarbeit pro Monat ab. Der Wirt fotografiert Belege per WhatsApp; ProzessPilot extrahiert per OCR, kategorisiert per KI, archiviert GoBD-konform und übergibt monatlich aufbereitete DATEV-/Lexware-/sevDesk-Daten an den Steuerberater. Vertrieben wird über eine spezialisierte Vertriebsagentur mit 50 % Provisions-Modell (einmalig + recurring). Pricing: 4 Pakete von 39 € bis 299 €/Mt + Setup-Fee. Markt-Potenzial: ~215.000 deutsche Gastro-Kleinbetriebe, realistisches Pilotziel: 100 Tenants in 18 Monaten, langfristig 1.000–4.000 Tenants. Die Konzept-Foundation ist seit Mai 2026 abgeschlossen; Pilot-Phase startet mit einem bekannten Wirt mit SumUp-Kasse und Lexware-Steuerberater.

---

**Letzte Aktualisierung:** 2026-05-15
**Verantwortlich:** Geschäftsführung ProzessPilot
