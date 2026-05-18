# T015 — Mitarbeiter-Webapp Beleg-Detail-View mit OCR + Edit

> **Owner:** Andreas
> **Geschätzt:** 1,5 Tage
> **Priorität:** P0 (User muss OCR-Ergebnisse korrigieren können)
> **Dependencies:** T007 OCR-Integration + T014 Listen-View
> **Welle:** 3
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M01_Beleg_Capture.md` + `M02_OCR.md`

---

## Ziel

Detail-Ansicht eines Belegs: Bild groß sichtbar, OCR-extrahierte Felder rechts daneben, jedes Feld editierbar. User kann Korrekturen speichern (Lernsignal für später).

---

## Akzeptanz-Kriterien

- [ ] Route `/belege/:id`
- [ ] Layout: 2-Spalter, links Beleg-Bild (zoombar), rechts Felder
- [ ] Bild lädt via Signed-URL aus Backend (max 15min TTL)
- [ ] Felder rechts: Lieferant, Datum, Betrag, MwSt-Satz, Kategorie, OCR-Konfidenz
- [ ] Bewirtungs-Belege haben zusätzliche Pflichtfelder: Anlass, Teilnehmer (Komma-getrennt)
- [ ] Konfidenz-Score pro Feld als Indikator (Grün/Gelb/Rot-Punkt)
- [ ] Jedes Feld ist editierbar (Input/Select je nach Typ)
- [ ] „Speichern"-Button → `PATCH /api/belege/:id` mit Korrekturen
- [ ] „Re-OCR"-Button → `POST /api/belege/:id/reprocess` (für schlechte OCR-Ergebnisse)
- [ ] „Löschen"-Button mit Confirm-Dialog → `DELETE /api/belege/:id` (Soft-Delete)
- [ ] „Zurück zur Liste"-Link
- [ ] Audit-Log-Eintrag bei jeder Korrektur (was geändert wurde, von wem)
- [ ] Mobile-Layout: Bild oben, Felder darunter, scrollbar

## Claude-Code-Start-Prompt

```
Implementiere T015 Beleg-Detail-View.
Route /belege/:id, 2-Spalter-Layout, Bild-Zoom via react-zoom-pan-pinch.
Felder als Form mit react-hook-form, Validation mit zod.
PATCH /api/belege/:id für Speichern, optimistisches Update + Rollback bei Fehler.
Branch: andreas/T015-beleg-detail-view
```

## Hinweis für Owner (Andreas)
Auch wenn Frontend nicht dein Haupt-Bereich: Claude Code baut das. Du brauchst nur 1-2 echte Belege als Test-Daten und musst beurteilen ob das UI für einen Wirt verständlich ist. Bei UI-Fragen → Steve im PR-Review.
