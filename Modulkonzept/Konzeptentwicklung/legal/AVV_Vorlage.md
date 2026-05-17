# Auftragsverarbeitungsvertrag (AVV) ProzessPilot

> **Vorlage zur anwaltlichen Bearbeitung — Stand 2026-05-15**
>
> Vertrag zwischen Endkunde (Verantwortlicher) und ProzessPilot (Auftragsverarbeiter) gemäß Art. 28 DSGVO. Diese Vorlage ist auf Basis der Vorgaben der DSGVO und der Standardvertragsklauseln der EU-Kommission erstellt. Anwaltliche Prüfung erforderlich.

---

## Präambel

Zwischen

[Firmenname Endkunde]
[Adresse]
nachfolgend "Verantwortlicher"

und

[Firmenname ProzessPilot]
[Adresse Schneverdingen]
vertreten durch [Geschäftsführer Steve Bernhardt]
nachfolgend "Auftragsverarbeiter"

wird folgender Vertrag zur Auftragsverarbeitung gemäß Art. 28 DSGVO geschlossen.

---

## § 1 Gegenstand und Dauer der Verarbeitung

(1) Gegenstand der Verarbeitung ist die Erbringung der Dienstleistung "ProzessPilot" gemäß dem zwischen den Parteien geschlossenen Hauptvertrag (SaaS-AGB). Dies umfasst:

- Empfang und automatisierte Verarbeitung von Belegen (OCR, KI-Kategorisierung)
- Archivierung von Belegen im vom Verantwortlichen bereitgestellten Cloud-Speicher
- Übermittlung aufbereiteter Buchungs-Daten an den vom Verantwortlichen benannten Steuerberater
- Bereitstellung eines Web-Chat-Widgets zur Kommunikation mit dem Verantwortlichen
- Bereitstellung eines Onboarding-Wizards zur einmaligen Einrichtung
- Generierung einer GoBD-Verfahrensdokumentation für den Verantwortlichen

(2) Die Dauer der Verarbeitung entspricht der Laufzeit des Hauptvertrags. Nach Vertragsende werden alle personenbezogenen Daten innerhalb von 30 Tagen gemäß § 11 dieses AVV gelöscht.

---

## § 2 Art und Zweck der Verarbeitung

(1) Die Verarbeitung erfolgt zum Zweck der automatisierten Belegerfassung und -übergabe an den Steuerberater des Verantwortlichen, mit dem Ziel, den manuellen Buchhaltungs-Aufwand zu reduzieren.

(2) Folgende Verarbeitungs-Tätigkeiten werden durchgeführt:
- Erfassung und Speicherung von Belegen via WhatsApp / E-Mail / Web-Upload / Kassen-API
- OCR-Texterkennung der Belege
- Kategorisierung der Belege durch KI-Verfahren
- Aggregation und Mappingauf Buchungskonten
- Übergabe an Buchhaltungs-Systeme (DATEV-CSV / Lexware Office API / sevDesk API)
- Generierung von Reports und PDF-Dokumenten
- Kommunikation mit dem Verantwortlichen via Magic-Link-basiertem Web-Chat-Widget

---

## § 3 Art der personenbezogenen Daten

Folgende Kategorien personenbezogener Daten werden verarbeitet:

| Kategorie | Beispiele |
|---|---|
| **Stammdaten Verantwortlicher** | Firmenname, USt-ID, Steuernummer, Adresse, Telefon, E-Mail |
| **Steuerberater-Kontakt** | Name, Kanzlei, E-Mail, Telefon |
| **Belegdaten** | Lieferanten-Namen, Beträge, Datum, ggf. Bankverbindungen, Belegnummern |
| **Bewirtungs-Notizen** | Anlass + Teilnehmer-Namen bei Bewirtungsbelegen |
| **Mitarbeiter-Daten Verantwortlicher** | bei Mehr-Personen-Eingaben: Name des Beleg-Senders |
| **Kassen-Transaktionsdaten** | bei aktiver SumUp-Anbindung: Tagesumsätze, Zahlungsweisen |
| **Kommunikations-Daten** | Inhalte von Web-Chat-Konversationen mit ProzessPilot-Support |
| **Audit-Logs** | Login-Events, Belegerfassungs-Status, Korrektur-Aktionen |

Es werden **keine besonderen Kategorien personenbezogener Daten** im Sinne Art. 9 DSGVO verarbeitet.

---

## § 4 Kategorien betroffener Personen

| Kategorie | Beschreibung |
|---|---|
| **Verantwortlicher selbst** | Inhaber, Geschäftsführer des Endkunden |
| **Mitarbeiter des Verantwortlichen** | bei Mehr-Personen-Belegerfassung: Name auf Belegen |
| **Lieferanten des Verantwortlichen** | Name, Anschrift auf Belegen |
| **Bewirtete Personen** | bei Bewirtungsbelegen: Namen aus Wirts-Notizen |
| **Steuerberater des Verantwortlichen** | Kontaktdaten für Übergabe |
| **Eventuell Dritte** | wenn versehentlich auf Beleg-Fotos sichtbar (Pflicht des Verantwortlichen, dies zu vermeiden) |

---

## § 5 Pflichten des Auftragsverarbeiters

Der Auftragsverarbeiter verpflichtet sich:

(1) Die Daten ausschließlich im Rahmen der dokumentierten Weisungen des Verantwortlichen zu verarbeiten. Weisungen sind grundsätzlich der Hauptvertrag, ergänzt durch Konfigurationen im System des Verantwortlichen.

(2) Sicherzustellen, dass alle Personen, die Zugang zu den personenbezogenen Daten haben, zur Vertraulichkeit verpflichtet sind oder einer angemessenen gesetzlichen Verschwiegenheitspflicht unterliegen.

(3) Die in § 7 dieses AVV beschriebenen technischen und organisatorischen Maßnahmen zu ergreifen.

(4) Die Voraussetzungen für die Inanspruchnahme weiterer Auftragsverarbeiter (Sub-Verarbeiter) gemäß § 8 zu erfüllen.

(5) Den Verantwortlichen bei der Wahrnehmung seiner Rechte zu unterstützen, insbesondere bei der Beantwortung von Anträgen betroffener Personen (Art. 12-22 DSGVO) und bei der Sicherstellung der Sicherheit der Verarbeitung (Art. 32 DSGVO).

(6) Den Verantwortlichen unverzüglich (spätestens innerhalb von 24 Stunden) bei Bekanntwerden einer Datenschutzverletzung zu informieren.

(7) Nach Wahl des Verantwortlichen alle personenbezogenen Daten nach Abschluss der Erbringung der Verarbeitungsleistungen entweder zu löschen oder zurückzugeben.

(8) Dem Verantwortlichen alle erforderlichen Informationen zum Nachweis der Einhaltung der Pflichten zur Verfügung zu stellen und Überprüfungen einschließlich Inspektionen zu ermöglichen.

---

## § 6 Pflichten des Verantwortlichen

(1) Der Verantwortliche ist im Rahmen dieses Vertrags die für die Einhaltung der datenschutzrechtlichen Vorschriften verantwortliche Stelle (Art. 4 Nr. 7 DSGVO).

(2) Der Verantwortliche stellt sicher, dass die zur Verarbeitung übergebenen Daten rechtmäßig erhoben wurden und an den Auftragsverarbeiter weitergegeben werden dürfen.

(3) Der Verantwortliche trifft alle erforderlichen Vorkehrungen, dass auf Belegen oder im Web-Chat keine personenbezogenen Daten Dritter erkennbar sind, die nicht zur Belegerfassung erforderlich sind (z.B. Gast-Gesichter im Bildhintergrund).

(4) Der Verantwortliche informiert betroffene Personen (z.B. eigene Mitarbeiter, Lieferanten) über die Verarbeitung im Rahmen seiner eigenen Datenschutz-Erklärung.

(5) Der Verantwortliche benennt einen verantwortlichen Ansprechpartner für Datenschutzfragen.

---

## § 7 Technische und organisatorische Maßnahmen (TOMs)

(1) Der Auftragsverarbeiter trifft die in der Anlage 1 (TOMs) beschriebenen technischen und organisatorischen Maßnahmen.

(2) Die TOMs werden regelmäßig überprüft und an den Stand der Technik angepasst. Wesentliche Änderungen werden dem Verantwortlichen mitgeteilt.

---

## § 8 Subunternehmer (Sub-Auftragsverarbeiter)

(1) Der Verantwortliche genehmigt die Beauftragung der in Anlage 2 (Subunternehmer-Verzeichnis) aufgeführten Sub-Auftragsverarbeiter.

(2) Bei Hinzuziehung weiterer Sub-Auftragsverarbeiter informiert der Auftragsverarbeiter den Verantwortlichen mindestens 30 Tage im Voraus per E-Mail. Der Verantwortliche kann dieser Beauftragung innerhalb von 30 Tagen aus berechtigten Gründen widersprechen.

(3) Bei Widerspruch ist der Auftragsverarbeiter berechtigt, das Vertragsverhältnis außerordentlich zu kündigen, wenn die Beauftragung des Sub-Auftragsverarbeiters für die Vertragserfüllung erforderlich ist.

(4) Der Auftragsverarbeiter verpflichtet die Sub-Auftragsverarbeiter zur Einhaltung der gleichen Datenschutz-Pflichten wie in diesem AVV festgelegt.

(5) Bei Sub-Auftragsverarbeitern in Drittländern (außerhalb EU/EWR) stellt der Auftragsverarbeiter sicher, dass ein angemessenes Datenschutzniveau gewährleistet ist, insbesondere durch Standardvertragsklauseln (SCCs) der EU-Kommission gemäß Art. 46 Abs. 2 lit. c DSGVO.

---

## § 9 Drittland-Transfer

(1) Eine Übermittlung personenbezogener Daten in Drittländer findet nur in folgenden, im Subunternehmer-Verzeichnis aufgeführten Fällen statt:

| Sub-Auftragsverarbeiter | Land | Schutzniveau |
|---|---|---|
| Google Cloud (Vision API) | USA (mit EU-Region `europe-west3`) | SCCs + Datenresidenz EU |
| Anthropic PBC (Claude API) | USA | SCCs |
| Discord Inc. | USA | SCCs |
| Twilio Inc. | USA | SCCs (während Pilot-Phase) |
| Meta Platforms (WhatsApp Business) | USA | SCCs |
| Postmark / SendGrid | USA | SCCs |

(2) Für alle Drittland-Transfers werden Standardvertragsklauseln gemäß Beschluss 2021/914 der EU-Kommission verwendet.

(3) Der Auftragsverarbeiter führt eine Drittland-Transfer-Folgenabschätzung (Transfer Impact Assessment) durch und dokumentiert diese.

---

## § 10 Rechte der betroffenen Personen

(1) Der Auftragsverarbeiter unterstützt den Verantwortlichen bei der Wahrnehmung folgender Rechte betroffener Personen:

- Recht auf Auskunft (Art. 15 DSGVO)
- Recht auf Berichtigung (Art. 16 DSGVO)
- Recht auf Löschung (Art. 17 DSGVO)
- Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)
- Recht auf Datenübertragbarkeit (Art. 20 DSGVO)
- Recht auf Widerspruch (Art. 21 DSGVO)

(2) Anfragen betroffener Personen, die direkt an den Auftragsverarbeiter gerichtet werden, werden unverzüglich an den Verantwortlichen weitergeleitet.

(3) Der Verantwortliche bleibt verantwortlich für die Beantwortung und Bearbeitung dieser Anfragen.

---

## § 11 Löschung und Rückgabe

(1) Nach Beendigung des Hauptvertrags löscht der Auftragsverarbeiter alle personenbezogenen Daten innerhalb von 30 Tagen vollständig und unwiderruflich.

(2) Vor der Löschung erhält der Verantwortliche einen Datenexport gemäß § 12 des Hauptvertrags.

(3) Original-Belege liegen aufgrund der Architektur bereits im vom Verantwortlichen vorgehaltenen Cloud-Speicher (Google Drive / Dropbox) und sind dort weiterhin zugänglich.

(4) Backups werden in den auf die Löschung folgenden 30 Tagen aus den Backup-Snapshots entfernt.

(5) Daten, deren Aufbewahrung gesetzlich vorgeschrieben ist (insbesondere Rechnungs-Belege gemäß HGB), werden bis zum Ablauf der gesetzlichen Aufbewahrungsfrist gespeichert und danach gelöscht.

(6) Die Löschung wird dem Verantwortlichen schriftlich bestätigt.

---

## § 12 Nachweispflichten und Audit

(1) Der Auftragsverarbeiter stellt dem Verantwortlichen auf Anfrage alle für den Nachweis der Einhaltung dieses Vertrages erforderlichen Informationen zur Verfügung.

(2) Der Verantwortliche oder ein von ihm beauftragter Prüfer ist berechtigt, Audits durchzuführen. Audits werden mit angemessener Vorankündigung (mindestens 14 Tage) und in zumutbarem Umfang durchgeführt. Die Kosten trägt grundsätzlich der Verantwortliche.

(3) Stattdessen kann der Auftragsverarbeiter dem Verantwortlichen aktuelle Zertifikate, Berichte oder Berichtsauszüge unabhängiger Prüfungs-Stellen vorlegen, die eine angemessene Prüfung ersetzen.

---

## § 13 Datenschutzverletzungen

(1) Der Auftragsverarbeiter informiert den Verantwortlichen unverzüglich, spätestens innerhalb von 24 Stunden nach Bekanntwerden, über jede Verletzung des Schutzes personenbezogener Daten.

(2) Die Mitteilung enthält:
- Eine Beschreibung der Art der Verletzung
- Die wahrscheinlichen Folgen
- Die ergriffenen oder vorgeschlagenen Maßnahmen
- Soweit bekannt: Anzahl + Kategorien betroffener Personen, Anzahl + Kategorien betroffener Datensätze

(3) Der Auftragsverarbeiter unterstützt den Verantwortlichen bei der Erfüllung seiner Meldepflichten gemäß Art. 33 + 34 DSGVO.

---

## § 14 Vertraulichkeit

(1) Beide Parteien verpflichten sich, alle Informationen aus diesem Vertrag und aus der Verarbeitung vertraulich zu behandeln.

(2) Die Vertraulichkeitspflicht besteht über das Vertragsende hinaus fort.

---

## § 15 Vergütung

(1) Die Erfüllung der Pflichten aus diesem AVV ist mit der Vergütung gemäß Hauptvertrag (SaaS-AGB) abgegolten.

(2) Außergewöhnliche Aufwände (z.B. umfassende Audits durch externe Prüfer, Migration größerer Datenmengen, Sonderwünsche im Datenschutz) können nach vorheriger Abstimmung gesondert berechnet werden.

---

## § 16 Schlussbestimmungen

(1) Im Falle von Widersprüchen zwischen diesem AVV und dem Hauptvertrag haben die Bestimmungen dieses AVV in datenschutzrechtlichen Angelegenheiten Vorrang.

(2) Sollten einzelne Bestimmungen dieses AVV unwirksam sein, bleiben die übrigen Bestimmungen davon unberührt.

(3) Es gilt das Recht der Bundesrepublik Deutschland.

(4) Gerichtsstand ist [Schneverdingen / Soltau / Lüneburg].

---

## Anlagen

- Anlage 1: Technische und Organisatorische Maßnahmen (TOMs)
- Anlage 2: Verzeichnis der Subunternehmer
- Anlage 3: Standardvertragsklauseln (SCCs) für US-Subunternehmer

---

**Stand:** 2026-05-15 (Vorlage zur anwaltlichen Bearbeitung)
**Verantwortlich:** Steve Bernhardt
