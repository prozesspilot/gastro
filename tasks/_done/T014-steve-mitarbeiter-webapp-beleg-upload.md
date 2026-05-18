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

- [x] Routen `/belege` (Listen-View) + `/belege/upload` (Upload-View) + `/belege/:id` (Detail-Skelett)
- [x] Upload-View: Drag&Drop-Zone (Native HTML5) + Datei-Picker-Fallback
- [x] Mehrfach-Upload: 1-20 Dateien gleichzeitig
- [x] Vorschau pro Datei: Thumbnail (Bilder) / PDF-Icon + Name + Größe + „X entfernen"
- [x] Upload-Button → `POST /api/v1/belege/upload` (FormData via fetch)
- [x] Progress-Indikator pro Datei
- [x] Listen-View: Tabelle (Status-Icon, Hochgeladen-am, Status-Badge, Lieferant, Datum, Betrag, Aktionen)
- [x] Status-Spalte mit Farbcode (Migration 030 FSM): `received` (grau), `extracting/categorizing/...` (gelb), `extracted/.../completed` (grün), `requires_review` (pink), `error` (rot)
- [x] Filter: Status-Dropdown (Datum-Range + Kategorie als Nice-to-have erstmal weggelassen — Status reicht für KW22-Pilot)
- [x] Sortierung: received_at DESC (Default, Backend sortiert)
- [x] Pagination: 50 pro Seite, Page-Navigation
- [x] Click auf Reihe → `/belege/:id` (Detail-View Skelett vorhanden)
- [x] Empty-State: „Noch keine Belege hochgeladen — leg los!" mit Button zu `/belege/upload`
- [x] **Bonus:** Client-Validierung Mime-Type + 20MB-Limit vor Upload
- [x] **Bonus:** Duplikat-Erkennung (Server-Response `isDuplicate=true` → spezifische Meldung)
- [x] **Bonus:** 31 Komponenten-Tests (Upload 10, List 11, Detail 10)
- [x] **Bonus:** Migrate-Bug-Fix (`migrate.ts` filtert `_rollback.sql`-Files jetzt korrekt heraus)

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
