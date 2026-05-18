# T008 — M03 Bewirtungs-Detection Hook

> **Owner:** Andreas
> **Geschätzt:** 1,5 Tage
> **Priorität:** P1 (Roadmap KW22-Punkt — wichtig aber nicht erster Pilot-Blocker)
> **Dependencies:** T007 OCR-Integration
> **Welle:** 3
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M03_Kategorisierung.md` Sektionen 16-22

---

## Ziel

Erkennt automatisch ob ein Beleg eine **Bewirtungsrechnung** ist (Restaurant, Café, Geschäftsessen) und markiert Bewirtungs-spezifische Felder die der Steuerberater zur 70 %/30 % Aufteilung braucht.

---

## Akzeptanz-Kriterien

- [ ] Hook-Service `BewirtungsDetector.analyze(beleg_id)` läuft nach OCR (`belege.status = 'ocr_done'`)
- [ ] Detection-Logik kombiniert:
  - Lieferant-Branchen-Check (NACE-Code 56.x für Gastronomie, falls verfügbar)
  - Schlüsselwörter im OCR-Text: „Restaurant", „Café", „Gaststätte", „Bewirtung", „Trinkgeld", „Bedienung"
  - Anzahl Positionen (Restaurant-Bon hat typisch 3+ Positionen)
- [ ] Setzt `belege.kategorie = 'bewirtung'` wenn Match
- [ ] Erkennt Trinkgeld-Position separat (Betrag in `metadata_json.trinkgeld_cents`)
- [ ] Erkennt MwSt-Splitting (7% vs 19%) wenn auf Beleg sichtbar
- [ ] UI-Flag in Webapp: Bewirtungs-Belege brauchen Pflicht-Eingabe „Anlass" + „Teilnehmer" (Edit-Form später in T015)
- [ ] Konfidenz-Score in `metadata_json.bewirtung_confidence`
- [ ] Bei Konfidenz < 70%: User-Bestätigung notwendig in UI
- [ ] Unit-Tests mit 10+ Sample-Belegen (echte Almaz-Belege wenn vorhanden, sonst Stock-Bilder)

## Claude-Code-Start-Prompt

```
Implementiere T008 Bewirtungs-Detection. Service in backend/src/services/bewirtungs-detector.ts.
Trigger nach OCR über BullMQ-Worker oder Postgres-Trigger.
Regex-basierte Keyword-Erkennung + Branchen-Lookup-Tabelle.
Test-Fixtures in __tests__/fixtures/belege/bewirtung/*.
Branch: andreas/T008-bewirtungs-hook
```
