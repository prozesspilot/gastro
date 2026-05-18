# T014 — Mitarbeiter-Webapp Beleg-Upload + Listen-View

> **Owner:** Steve
> **Geschätzt:** 1,5 Tage
> **Priorität:** P0 (Kern-UI für KW22-Pilot)
> **Dependencies:** T006 Beleg-Upload-Endpoint + T013 Login funktioniert
> **Welle:** 2
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M01_Beleg_Capture.md`

---

## Ziel

Eingeloggter Mitarbeiter kann Belege hochladen (Drag&Drop oder Datei-Picker) und sieht eine Liste aller bisherigen Belege mit Status.

---

## Akzeptanz-Kriterien

- [ ] Route `/belege` (Listen-View) + `/belege/upload` (Upload-View)
- [ ] Upload-View: Drag&Drop-Zone + Datei-Picker-Fallback
- [ ] Mehrfach-Upload: User kann 1-20 Dateien auf einmal hochladen
- [ ] Vorschau pro Datei vor Upload: Thumbnail + Name + Größe + „X entfernen"
- [ ] Upload-Button → calls `POST /api/belege/upload` mit FormData
- [ ] Progress-Indikator pro Datei
- [ ] Listen-View: Tabelle mit Spalten: Thumbnail, Hochgeladen-am, Status, Kategorie, Betrag, Aktionen
- [ ] Status-Spalte mit Farbcode: `pending_ocr` (grau), `ocr_done` (gelb), `kategorisiert` (grün), `failed` (rot)
- [ ] Filter: Datum-Range, Status, Kategorie
- [ ] Sortierung: nach hochgeladen-am (DESC default)
- [ ] Pagination: 50 pro Seite
- [ ] Click auf Reihe → zu `/belege/:id` (Detail-View aus T015)
- [ ] Empty-State: „Noch keine Belege hochgeladen — leg los!"

## Claude-Code-Start-Prompt

```
Implementiere T014 Beleg-Upload + Listen-View.
Drag&Drop via react-dropzone oder Native HTML5.
Listen-Tabelle: react-table oder Custom mit Sortierung+Filter.
HTTP-Calls: GET /api/belege?page=X&status=Y für Liste, POST /api/belege/upload für Upload.
JWT aus Cookie automatisch mitgesendet.
Branch: steve/T014-beleg-upload-liste
```

## Hinweis für Owner (Steve)
Sammel vorher 5-10 echte Beleg-Bilder von Almaz als Test-Daten. Bekommt Claude Code als Fixtures fürs UI-Testen.
