# T076 — Webapp: Beleg kategorisieren + nach Lexware exportieren (Staff-UI)

> **Owner:** Steve (Frontend) / gemeinsam
> **Priorität:** P1 (Build-out — schließt die UI-Lücke der LIVE-Mitte OCR→Kategorisieren→Export)
> **Welle:** Build-out (nach Phase C)
> **Dependencies:** T048 (categorize LIVE), M05 (Lexware-Export LIVE), A3-Webapp-Reboot (T058–T060)
> **Spec-Referenzen:** CLAUDE.md §3.2/§3.6 (LIVE-Mitte) · `backend/src/modules/m03-categorization/belege-categorize.routes.ts` · `backend/src/modules/m05-lexoffice/belege-routes.ts` · Audit-Memory `audit-2026-06-24-pilot-blocker` (verdeckter Blocker: „Webapp kann nicht categorize/export")

---

## Ziel

Die Staff-Webapp kann einen Beleg **kategorisieren** und **nach Lexware Office exportieren** — die Backend-Endpoints sind LIVE, aber es fehlt die Oberfläche. Damit wird die schon lebende Mitte (**OCR → Kategorisieren → Export**) end-to-end über die Webapp bedienbar (Build-out-Ziel „Testkunde spielt alles durch").

Backend-Endpoints (unverändert nutzen):
- `POST /api/v1/belege/:id/categorize` — Gate `status='extracted'`; Antwort `{ ok, data: { beleg_id, status, categorization: { category, category_label, skr_account, confidence, engine, requires_review, bewirtung_preserved } } }`. `support`-Rolle → 403.
- `POST /api/v1/belege/:id/exports/lexware` — Gate `status='categorized'` (sonst 422 `not_categorized`); Antwort `{ beleg_id, status: 'pushed'|'skipped'|'failed', external_id?, attempts }`. `support` → 403, fehlendes S3 → 500, externer Fehler → 502.
- `POST /api/v1/exports/lexware/batch` — nur `geschaeftsfuehrer`; Antwort `{ pushed, skipped, failed, results }`.

---

## Akzeptanz-Kriterien

### API-Client
- [x] `webapp/src/api/_client.ts`: `parseError` liest auch das Legacy-Shape `{ error: '<code>', message: '...' }` (Export-Endpoints) → `ApiError.message`/`.code` korrekt (bestehendes `{ error: { code, message } }`-Verhalten unverändert).
- [x] `webapp/src/api/belege.ts`: `categorizeBeleg(id)`, `exportBelegLexware(id)`, `exportLexwareBatch(limit?)` + Typen (`CategorizeResult`, `ExportResult`, `BatchExportResult`). `unwrap` für die `{ ok, data }`-categorize-Antwort.

### Beleg-Detailseite
- [x] **Kategorisieren**-Button — sichtbar nur bei `status='extracted'`, ausgeblendet für Rolle `support`. Klick → `categorizeBeleg` → Beleg neu laden → Toast (success „Kategorisiert als … (SKR …)" bzw. info „… bitte prüfen, Konfidenz X%" bei `requires_review`).
- [x] **Exportieren (Lexware)**-Button — sichtbar nur bei `status='categorized'`, ausgeblendet für `support`. Klick → `exportBelegLexware` → Beleg neu laden → Toast (success „An Lexware exportiert" / info „Bereits exportiert" bei `skipped`). Fehler (422 not_categorized / 502) → verständlicher Toast.
- [x] Busy-States (Spinner/disabled) je Aktion; bestehende Save/Reprocess/Delete-Buttons unverändert.

### Beleg-Liste
- [x] **Batch-Export**-Button — nur für `geschaeftsfuehrer`. Klick (mit Bestätigung) → `exportLexwareBatch` → Summary-Toast („X exportiert, Y übersprungen, Z fehlgeschlagen") → Liste neu laden.

### Tests + Gates
- [x] `belege.ts`: categorize/export/batch (Erfolg + Fehlerpfade 422/403).
- [x] `_client.ts`: parseError-Legacy-Shape (Message + Code).
- [x] `BelegeDetailPage`: Button-Sichtbarkeit je Status + Rolle; Klick ruft Endpoint + lädt neu + Toast.
- [x] `BelegeListPage`: Batch-Button nur für gf; Klick → Summary.
- [x] Lint/Typecheck/Build grün; Webapp-Tests grün (localStorage-Fälle = bekannte Node-26-lokal-Falle, CI=Node 20 grün).

---

## Hinweise / Anker / Grenzen

- **Kein neues Backend** — nur Webapp gegen bestehende LIVE-Endpoints.
- **Bewusste Grenze:** `requires_review` ist über die Endpoints ein UI-Sackgasse (categorize akzeptiert nur `extracted`, export nur `categorized`). Korrektur-Pfad aus `requires_review` heraus = Folge-Task (Backend-Statusmaschine), NICHT T076.
- Rolle aus `useAuth().user.role`; Server enforced ohnehin (T062) — UI-Gating ist UX.
- Toast-/Busy-/Re-Fetch-Muster strikt wie die bestehenden Handler in `BelegeDetailPage` (handleSave/handleReprocess).
