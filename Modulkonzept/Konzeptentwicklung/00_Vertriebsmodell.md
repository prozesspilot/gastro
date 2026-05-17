# 00 — Vertriebsmodell

> **Status:** Erstfassung 2026-05-15
> **Zielgruppe:** Geschäftsführung, Vertriebsagentur, Anwalt (für Vertragsausarbeitung)
> **Verhältnis zu anderen Dokumenten:** Setzt `00_Strategie_Gastro.md` voraus. Liefert die operative Vertriebs- und Vertrags-Grundlage für die Gespräche mit der Vertriebsagentur.

---

## 1. Vertriebs-Setup im Überblick

ProzessPilot vertreibt nicht selbst an die Endkunden. Der Vertrieb läuft über eine **Vertriebsagentur als Handelsvertreter** im Sinne § 84 ff. HGB. Das bedeutet:

- ProzessPilot bleibt **Vertragspartner des Endkunden** (Wirt)
- ProzessPilot stellt die Rechnungen, betreibt das Inkasso, trägt das Zahlungsausfall-Risiko
- Die Vertriebsagentur **vermittelt** Endkunden und erhält dafür eine **Provision aus tatsächlich eingegangenen Zahlungen**
- Die Agentur tritt im Markt unter eigenem Namen auf, präsentiert ProzessPilot als Produkt — aber alle Vertragsbeziehungen zum Endkunden gehören ProzessPilot

Das ist klar abzugrenzen von einem **Reseller-Modell**, in dem die Agentur das Produkt im eigenen Namen weiterverkaufen, eigene Preise setzen und Support-Verantwortung tragen würde. Das wollen wir nicht.

---

## 2. Die konkrete Agentur-Konstellation

| Eigenschaft | Stand |
|---|---|
| Agentur-Typ | Neu für ProzessPilot, aber bestehende Agentur mit großem Gastro-Netzwerk |
| Vorerfahrung mit ProzessPilot | Keine — Schulung notwendig |
| Branchenkenntnis Gastro | Hoch — eigenes Netzwerk |
| Einsatzbereitschaft | Ab ca. KW 22 / 23 (zwei Wochen nach Vertragsunterschrift) |

**Konsequenz aus "neue Agentur ohne ProzessPilot-Vorerfahrung":**

- Sales-Material muss **selbsterklärend, vollständig und schriftlich** sein
- Sales-Schulung 1–2 Tage (Remote oder Vor-Ort) vor Akquise-Start
- Erste Wochen engerer Kontakt zwischen Agentur-Sales und ProzessPilot — gemeinsame Pitch-Calls möglich, Qualitäts-Sicherung der ersten Verkaufs-Gespräche
- FAQ-Wiki für die Agentur, das laufend gepflegt wird (typische Wirt-Einwände, technische Fragen, Konkurrenz-Argumente)

---

## 3. Vergütungs-Modell

### 3.1 Provisions-Sätze

| Komponente | Anteil Agentur | Anteil ProzessPilot |
|---|---|---|
| Setup-Fee (einmalig) | 50 % | 50 % |
| Monats-Abonnement (recurring) | 50 % | 50 % |

### 3.2 Beispiele konkret

| Paket | Setup-Fee | Anteil Agentur einmalig | Monatsbeitrag | Anteil Agentur monatlich |
|---|---|---|---|---|
| Solo | 299 € | 149,50 € | 39 € | 19,50 € |
| Standard | 499 € | 249,50 € | 79 € | 39,50 € |
| Pro | 799 € | 399,50 € | 149 € | 74,50 € |
| Filiale | 1.499 € | 749,50 € | 299 € | 149,50 € |

### 3.3 Berechnungs-Grundlage

Provision wird grundsätzlich auf **tatsächliche Zahlungseingänge** berechnet, nicht auf gestellte Rechnungen. Wenn ein Wirt nicht zahlt, fällt auch keine Provision an. Damit liegt das Zahlungsausfall-Risiko anteilig bei der Agentur (sie wird motiviert, auch nach dem Abschluss noch auf saubere Zahlungs-Disziplin der Kunden zu achten).

### 3.4 Stripe-/Bank-Gebühren

Die Zahlungsabwicklungs-Gebühren (Stripe ~2,9 % + 0,25 €/Transaktion bei Karte; SEPA-Lastschrift ~1,5 % + 0,25 €) werden **vollständig von ProzessPilot getragen**, nicht aus dem Agentur-Anteil abgezogen. Vertraglich klar geregelt.

---

## 4. Stop-with-Cancel-Klausel — die wichtigste Regel

Die Provisions-Zahlung an die Agentur **endet automatisch** mit Beendigung des Vertragsverhältnisses zwischen ProzessPilot und Endkunde. Es gibt **kein Trailing**, keine Fixed-Term-Provision, keine Garantie-Auszahlungen über das aktive Vertragsverhältnis hinaus.

### Vertragsformulierung-Vorschlag

> **§X Provisionsanspruch — Bedingungen und Ende**
>
> (1) Die Vermittlungsprovision für jeden vermittelten Endkunden wird auf Basis der tatsächlichen Zahlungseingänge im Vormonat berechnet.
>
> (2) Mit Beendigung des Vertragsverhältnisses zwischen ProzessPilot und Endkunde — gleich aus welchem Grund (Kündigung durch den Endkunden, Kündigung durch ProzessPilot, Vertragsbeendigung wegen Zahlungsverzugs, Tod des Endkunden, Insolvenz des Endkunden) — endet der Provisionsanspruch des Vertriebspartners für den jeweiligen Endkunden mit dem letzten Monat, in dem ein Zahlungseingang verbucht wurde.
>
> (3) Es besteht kein Anspruch auf Trailing-Provisionen oder Fixed-Term-Provisionen, die über das aktive Vertragsverhältnis zwischen ProzessPilot und Endkunde hinausgehen.
>
> (4) Bei Rücktritt des Endkunden innerhalb der 30-tägigen Geld-zurück-Garantie entfällt der Provisionsanspruch rückwirkend; bereits gezahlte Provisionen sind zurückzuzahlen oder werden mit zukünftigen Provisions-Auszahlungen verrechnet.

### Warum das nicht verhandelbar ist

Bei 50 % recurring + Stripe-Gebühren + Variable Cost wäre eine Trailing-Klausel von z. B. 12 Monaten **wirtschaftlich nicht tragbar**. Wenn ein Wirt nach 6 Monaten kündigt, würde ProzessPilot weitere 6 Monate Provision bezahlen — bei null Einnahmen. Die Marge bricht weg. Stop-with-Cancel ist branchenüblich und juristisch unproblematisch.

---

## 5. Soft-Exklusivität mit Mindestleistung

### 5.1 Grundsatz

Die Agentur erhält **exklusive Vertriebsrechte für die Gastro-Zielgruppe in Deutschland** für die Dauer des Vertrags. Diese Exklusivität ist jedoch an eine **Mindestleistung pro Quartal** geknüpft. Werden die Mindestleistungen nicht erfüllt, entfällt die Exklusivität — der Vertrag selbst läuft aber weiter (die Agentur erhält weiterhin Provision für ihre vermittelten Bestandskunden, ProzessPilot darf parallel andere Vertriebskanäle bedienen).

### 5.2 Mindestleistungs-Staffel

Realistisch gestaffelt für eine neue Agentur:

| Zeitraum | Mindest-Vermittlungen pro Quartal |
|---|---|
| Quartal 1–2 (Einarbeitung) | 3 zahlende Tenants |
| Quartal 3–4 | 5 zahlende Tenants |
| Quartal 5+ | 6 zahlende Tenants |

"Zahlende Tenants" bedeutet: Endkunden, die nach Ablauf der 30-Tage-Geld-zurück-Garantie noch im Vertrag sind und mindestens eine Monatsrate bezahlt haben.

### 5.3 Folgen bei Unterschreitung

- **Erstmalige Unterschreitung:** Schriftliche Mitteilung, kein Konsequenz, Abstimmungs-Gespräch
- **Zweite Unterschreitung in Folge:** Exklusivität entfällt automatisch ab Folgequartal — ProzessPilot darf parallel andere Kanäle bedienen
- **Vier Unterschreitungen in Folge:** ordentliches Kündigungsrecht für ProzessPilot mit 3-Monats-Frist

### 5.4 Vertragsformulierung-Vorschlag

> **§Y Exklusivität — Bedingungen und Wegfall**
>
> (1) ProzessPilot gewährt der Agentur exklusive Vertriebsrechte für die Vermittlung von Endkunden aus dem deutschen Gastronomie-Sektor (Restaurants, Cafés, Bistros, Bars, Imbisse, Foodtrucks, vergleichbare Betriebe mit bis zu 30 Mitarbeitern).
>
> (2) Diese Exklusivität gilt unter folgender Mindestleistungs-Bedingung:
> - Quartal 1–2 nach Vertragsbeginn: mindestens 3 zahlende Tenants pro Quartal
> - Quartal 3–4: mindestens 5 zahlende Tenants pro Quartal
> - Ab Quartal 5: mindestens 6 zahlende Tenants pro Quartal
>
> (3) Wird die Mindestleistung in zwei aufeinanderfolgenden Quartalen unterschritten, entfällt die Exklusivität automatisch ab dem Folgequartal. Der Vertrag besteht weiter; die Agentur erhält weiterhin Provision für ihre vermittelten Bestandskunden. ProzessPilot ist berechtigt, parallel andere Vertriebskanäle zu nutzen.
>
> (4) Wird die Mindestleistung in vier aufeinanderfolgenden Quartalen unterschritten, kann ProzessPilot den Vertrag mit einer Frist von drei Monaten zum Quartalsende ordentlich kündigen. Bestehende Provisions-Ansprüche aus vermittelten Bestandskunden bleiben unberührt.

### 5.5 Warum diese Lösung fair ist

- **Agentur ist geschützt** vor Konkurrenz, solange sie liefert
- **ProzessPilot ist geschützt** vor Stillstand, falls die Agentur nicht performt
- **Klarer, objektiver Maßstab** (Anzahl zahlender Tenants) — keine Interpretations-Spielräume
- **Faires Einarbeitungs-Fenster** (6 Monate mit niedrigerer Mindestleistung)

---

## 6. Geld-zurück-Garantie und Provisions-Auszahlungs-Zyklus

### 6.1 Endkunden-Garantie

Jeder Endkunde hat 30 Tage ab Vertragsbeginn das Recht, formlos zurückzutreten. In diesem Fall erhält er Setup-Fee und alle bereits gezahlten Monatsbeiträge vollständig zurück. Kein Kleingedrucktes, keine Begründungspflicht.

### 6.2 Konsequenz für die Provisions-Auszahlung

- Provision für einen neu vermittelten Endkunden wird **nicht sofort** ausgezahlt
- Auszahlung erfolgt erst **nach Ablauf der 30-Tage-Garantie + Sicherheits-Puffer**
- Konkreter Auszahlungs-Termin: **15. des Folgemonats nach Garantie-Ablauf**

### 6.3 Beispiel-Timing

| Datum | Ereignis |
|---|---|
| 1. Mai | Wirt unterschreibt, zahlt Setup-Fee + erste Monatsrate |
| 1. Mai – 30. Mai | Geld-zurück-Garantie läuft |
| 31. Mai | Garantie abgelaufen, Wirt bleibt im Vertrag |
| 15. Juni | **Erste Provisions-Auszahlung an die Agentur** für diesen Wirt (anteilig Setup + erster Monat) |
| 15. Juli | Zweite Provisions-Auszahlung (zweiter Monat) |
| ... | Monatlich am 15. solange der Wirt zahlt |

### 6.4 Bei Rücktritt während Garantie

- Wirt zieht innerhalb 30 Tagen zurück
- Setup-Fee + Monatsrate werden vollständig erstattet
- Provisions-Auszahlung an die Agentur findet **nicht statt** (Auszahlung wäre erst nach Garantie-Ende fällig gewesen)
- Falls Provision durch ein Versehen schon ausgezahlt wurde: Rückzahlung oder Verrechnung mit zukünftigen Auszahlungen

---

## 7. Vertragslaufzeit und Kündigung

### 7.1 Mindestlaufzeit

- **Erste 12 Monate:** keine ordentliche Kündigung durch beide Parteien (Aufbau-Phase, Investitions-Schutz für die Agentur)
- **Nach 12 Monaten:** ordentliche Kündigung mit Frist von 3 Monaten zum Quartalsende durch jede Partei

### 7.2 Außerordentliches Kündigungsrecht

- Bei wiederholter und schwerwiegender Verletzung der Mindestleistung (siehe §Y Absatz 4)
- Bei Insolvenz einer Vertragspartei
- Bei Verstoß gegen Wettbewerbs-/Verschwiegenheitspflicht
- Bei groben Falschdarstellungen gegenüber Endkunden, die ProzessPilot reputationsmäßig schädigen

### 7.3 Vertragsende — was passiert mit Bestandskunden?

- Bestandskunden bleiben bei ProzessPilot
- Die Agentur erhält weiterhin Provision für ihre vermittelten Bestandskunden, **solange diese aktive zahlende Kunden sind** (Stop-with-Cancel-Regel gilt unverändert)
- Kein Anspruch auf Übertragung der Kunden-Verträge

---

## 8. Pricing-Setzung

### 8.1 Pricing-Floor

ProzessPilot legt die **Mindest-Preise** fest. Die Agentur darf diese Preise **nicht unterschreiten**, weder durch Rabatte noch durch andere Konzessionen.

### 8.2 Höhere Preise erlaubt

Die Agentur darf **höhere Preise** verkaufen — sie behält dann auch den Provisions-Anteil auf den höheren Preis. Das motiviert sie, statt mit Rabatt zu locken nach oben zu verhandeln.

### 8.3 Vertragsformulierung-Vorschlag

> **§Z Pricing — Verbindliche Preise**
>
> (1) Die Listenpreise und Setup-Fees gemäß Anlage 1 (Preisliste ProzessPilot) sind verbindlich.
>
> (2) Die Agentur ist berechtigt, gegenüber Endkunden höhere Preise zu vereinbaren. In diesem Fall berechnet sich die Provision auf Basis des tatsächlich vereinbarten Preises.
>
> (3) Eine Unterschreitung der Mindestpreise gemäß Anlage 1 — sei es durch direkten Rabatt, Naturalleistungen, kostenlose Zusatzmonate oder vergleichbare Vergünstigungen — bedarf der vorherigen schriftlichen Zustimmung von ProzessPilot.

---

## 9. Was die Agentur konkret für den Vertriebs-Start braucht

### 9.1 Sales-Material (von ProzessPilot zu liefern)

| Asset | Zweck | Format |
|---|---|---|
| Pitch-Deck Wirt-Gespräch | Visualisierung des Wert-Versprechens | PDF, ~10 Folien |
| Ein-Seiter / Flyer | Mitnahme nach Erstgespräch | PDF/Druck |
| Spar-Rechner | Live-Demonstration der Ersparnis pro Wirt | Web-Tool oder Excel |
| Demo-Tenant Zugang | Vorführung des Wirt-Workflows + Steuerberater-Übergabe | Live-System mit Beispiel-Daten |
| Beispiel-DATEV-Export PDF | Was der Steuerberater bekommt | PDF zum Mitnehmen |
| Beispiel-Spar-Bericht PDF | Was der Wirt monatlich bekommt | PDF zum Mitnehmen |
| Einwand-Handbuch | Antworten auf typische Wirt-Einwände | Wiki / PDF |
| Konkurrenz-Vergleich | Argumente gegenüber CANDIS, GetMyInvoices, etc. | Tabelle PDF |
| Steuerberater-Argumentations-Hilfe | Was sagt der Wirt seiner quertreibenden Steuerberaterin | 1-Seiter PDF |

### 9.2 Sales-Schulung

- Tag 1: Produkt-Verständnis, Live-Demo, Konkurrenz-Abgrenzung
- Tag 2: Pitch-Übungen, Einwand-Behandlung, technische Tiefen-Fragen
- Wochen 3-4 nach Schulung: Begleitende Pitch-Calls (gemeinsam mit Steve oder Andreas)

### 9.3 Provisions-Reporting

- Monatlich: Übersicht aller aktiven vermittelten Tenants mit Status
- Berechnung der fälligen Provision für den jeweiligen Monat
- Format: PDF-Report per E-Mail, später via internes Portal in der Mitarbeiter-Webapp

### 9.4 Operativer Kontakt

- Wöchentliches 30-Min Status-Call in den ersten 3 Monaten
- Danach: monatlich oder bei Bedarf
- Eskalations-Kontakt: Steve (Geschäftsführer ProzessPilot)

---

## 10. Onboarding-Hand-Off — wer macht was beim Verkauf?

### Phase 1: Erstgespräch Wirt (Agentur)

1. Agentur kontaktiert Wirt aus eigenem Netzwerk
2. Bedarfsanalyse, Spar-Rechnung präsentieren
3. Demo-Tenant zeigen
4. Bei Interesse: Standard-Vertrag + AGB übermitteln

### Phase 2: Vertragsabschluss (Agentur + ProzessPilot)

5. Wirt unterschreibt Vertrag (digital oder Papier)
6. Agentur informiert ProzessPilot über neuen Tenant (E-Mail/Portal)
7. ProzessPilot stellt Setup-Fee-Rechnung an Wirt
8. Wirt zahlt Setup-Fee → Onboarding-Wizard-Link wird automatisch verschickt

### Phase 3: Onboarding (ProzessPilot)

9. Wirt klickt durch Onboarding-Wizard ODER Premium-Setup wird beauftragt
10. ProzessPilot-Mitarbeiter prüft Setup, schaltet Tenant frei
11. Test-Beleg wird durchgespielt
12. Tenant ist live → Wirt kann Belege schicken

### Phase 4: Laufender Betrieb (ProzessPilot)

13. Monatliche Rechnungsstellung an Wirt
14. Monatliche Steuerberater-Übergabe
15. Monatlicher Spar-Bericht an Wirt (ab Phase 2)
16. Bei technischen Fragen: ProzessPilot-Support
17. Bei kommerziellen Fragen / Vertrags-Themen: Agentur (oder ProzessPilot, je nach Setup)

### Phase 5: Provision (ProzessPilot)

18. Monatlich am 15.: Provisions-Berechnung + Auszahlung an Agentur

---

## 11. Wirtschaftlichkeit aus Sicht der Agentur

### 11.1 Was verdient die Agentur pro vermitteltem Standard-Tenant?

| Position | Betrag |
|---|---|
| Setup-Fee einmalig | 249,50 € |
| Provision Monat 1 | 39,50 € |
| Provision Monat 12 | 39,50 € |
| **Verdienst nach 12 Monaten** | 249,50 € + 12 × 39,50 € = **723,50 €** |
| **Verdienst nach 24 Monaten** | 249,50 € + 24 × 39,50 € = **1.197,50 €** |
| **Verdienst nach 36 Monaten** | 249,50 € + 36 × 39,50 € = **1.671,50 €** |

Bei einer durchschnittlichen Kundenlebensdauer von 24+ Monaten ergibt sich pro Standard-Tenant für die Agentur ein **Lifetime-Wert von ca. 1.200–1.700 €**.

### 11.2 Was muss die Agentur dafür leisten?

- Erstkontakt + Bedarfsanalyse: ~1 Std
- Demo + Vertragsverhandlung: ~1 Std
- Vertragsabschluss + Hand-Off an PP: ~30 Min
- **Gesamtaufwand pro Tenant: ~2,5 Std**

Stundensatz-Äquivalent bei 24-Monats-Kunde: 1.200 € / 2,5 Std = **480 €/Std** für die Agentur. Bei 36-Monats-Kunde: 668 €/Std. Sehr profitabel — wenn die Agentur ihr Netzwerk effizient bearbeitet.

### 11.3 Skalierung Agentur

| Tenants pro Quartal | Verdienst Agentur pro Quartal (Standard-Mix) |
|---|---|
| 3 | ca. 1.500 € |
| 6 | ca. 3.000 € |
| 10 | ca. 5.000 € |

Plus laufende Provision aus Bestandskunden, die kumulativ wächst.

---

## 12. Was bewusst nicht im Vertrag steht

- **Kein Affiliate-Programm für Steuerberater** — würde dem USP "Steuerberater-Kosten senken" widersprechen
- **Keine Mehrfach-Agenturen am Anfang** — bewusst eine Agentur, um Komplexität zu vermeiden. Erweiterung möglich nach Wegfall der Exklusivität (siehe §Y)
- **Kein Co-Branding** — Agentur tritt unter eigenem Namen auf, ProzessPilot bleibt Produkt-Marke. Keine White-Label-Ausgaben
- **Keine Rückerstattung von Sales-Material-Investition** bei Vertragsende — das war Standard-Aufwand der Agentur
- **Keine Garantie-Mindest-Verdienst** für die Agentur — wenn sie nicht verkauft, verdient sie nicht. Risiko liegt bei der Agentur

---

## 13. Risiken und Gegen-Maßnahmen aus Vertriebssicht

| Risiko | Wahrscheinlichkeit | Gegen-Maßnahme |
|---|---|---|
| Agentur unterperformt nach Anfangs-Schwung | mittel | Mindestleistungs-Klausel mit klaren Konsequenzen |
| Agentur verkauft zu hohe Versprechen, Wirte sind enttäuscht | mittel | Sales-Material standardisiert, Begleit-Calls in Phase 1, Einwand-Handbuch realistisch |
| Wirt-Rückgaben innerhalb der 30-Tage-Garantie häufen sich | niedrig | Onboarding-Qualität durch ProzessPilot, Premium-Setup als Sicherheits-Option |
| Agentur wechselt zu Konkurrenz | niedrig | Soft-Exklusiv schützt während Performance-Phase, danach freier Markt für beide |
| Steuerberaterin des Wirts blockiert nach Abschluss | hoch | Steuerberater-Argumentations-Hilfe als Sales-Asset, ProzessPilot bietet Anruf bei Steuerberaterin (Premium-Setup) |
| Provisions-Streit bei Mehrkanal-Akquise | gering nach Wegfall Exklusivität | Provisions-Code beim Onboarding entscheidet, klare Regel im Vertrag |

---

## 14. Anlagen zum Vertrag

Folgende Dokumente werden Vertrags-Anlagen, die mit dem Hauptvertrag versendet werden:

- **Anlage 1:** Preisliste ProzessPilot (alle Pakete + Setup-Fees)
- **Anlage 2:** Sales-Material-Liste (was die Agentur erhält)
- **Anlage 3:** Mindestleistungs-Tabelle (siehe §Y)
- **Anlage 4:** Provisions-Auszahlungs-Übersicht (Beispiel-Berechnung)
- **Anlage 5:** Endkunden-AGB (zur Kenntnisnahme der Agentur)
- **Anlage 6:** AVV (Auftragsverarbeitungsvertrag) Endkunde — Hinweis dass die Agentur darauf zu verweisen hat

---

## 15. Operative Schritte für den Vertragsabschluss

| # | Schritt | Verantwortlich | Termin |
|---|---|---|---|
| 1 | Vertrag-Vorlage finalisieren (mit Anwalt) | Steve + Anwalt | KW 21 |
| 2 | Sales-Material vorbereiten (Pitch-Deck, Spar-Rechner, Demo-Tenant) | Andreas + Steve | KW 21–22 |
| 3 | Vertrags-Verhandlung mit Agentur | Steve | KW 22 |
| 4 | Vertragsunterzeichnung | beide | KW 22 |
| 5 | Sales-Schulung Agentur (1–2 Tage) | Steve + Andreas | KW 23 |
| 6 | Demo-Tenant einrichten und mit Beispiel-Daten füllen | Andreas | KW 23 |
| 7 | Erste Pitch-Calls begleitend mit Agentur | Steve | KW 24 ff. |

---

## 16. Zusammenfassung in einem Absatz

ProzessPilot vertreibt über eine spezialisierte Vertriebsagentur als Handelsvertreter (§ 84 ff. HGB), die 50 % Provision auf Setup-Fee und Monatsbeitrag erhält. Stop-with-Cancel-Klausel: Provision endet mit Endkunden-Vertrag. Soft-Exklusivität für die Gastro-Zielgruppe gilt unter Mindestleistungs-Bedingung — bei Nicht-Erfüllung über zwei Quartale entfällt sie automatisch. Mindestlaufzeit 12 Monate, danach 3-Monats-Kündigung. Geld-zurück-Garantie (30 Tage) verzögert Provisions-Auszahlung bis zum 15. des Folgemonats nach Garantie-Ablauf. Pricing-Floor durch ProzessPilot, höher verkaufen erlaubt. Sales-Material und Schulung werden von ProzessPilot gestellt. Operative Schritte bis zum Vertriebs-Start: ~3–4 Wochen.

---

**Letzte Aktualisierung:** 2026-05-15
**Verantwortlich:** Steve Bernhardt (Geschäftsführung ProzessPilot)
