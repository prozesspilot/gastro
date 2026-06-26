# T078 — requires_review-Korrekturpfad: „Als geprüft bestätigen" → categorized

> **Owner:** Steve / gemeinsam
> **Priorität:** P1 (Build-out — schließt die funktionale Sackgasse: unsichere Belege werden sonst nie exportierbar)
> **Welle:** Build-out (nach T077)
> **Dependencies:** T048/T076/T077 (categorize), M05 (Export)
> **Spec-Referenzen:** Design-Workflow `wf_3efce905-57b` (3 read-only Erkundungen + Synthese) · CLAUDE.md §3.2/§5.7 · `categorize.service.ts` · `belege-lexware-exporter.ts`

---

## Ziel

Ein von der KI als unsicher markierter (oder Bewirtungs-geschützter) Beleg landet auf `requires_review` und **steckt fest**: `/categorize` gatet auf `extracted`, PATCH ändert den Status nie, Export verlangt `categorized`. T078 gibt dem Mitarbeiter einen **Bestätigungspfad**: nach Prüfung/Korrektur `requires_review → categorized` → wird exportierbar.

**Zusätzlich (Bug aus dem Edge-Audit):** Der **Einzel-Export** prüft nur `payload.categorization`, nicht den Status — ein `requires_review`-Beleg (hat `payload.categorization`!) würde fälschlich exportiert. Wird in T078 mitgeschlossen.

**Entscheidungen (Defaults aus dem Design-Workflow, GF-bestätigt durch „coding"):**
- Eigener Endpoint `POST /belege/:id/confirm-review` (m03), **strikt nur Statuswechsel** (kein PATCH-Body — Mitarbeiter korrigiert erst per PATCH + Save, dann bestätigt).
- Rolle: **mitarbeiter + geschäftsführer** (support → 403), analog `/categorize`.
- Eigenes Audit-Event **`beleg.review_confirmed`** (GoBD: menschliche Freigabe, kein KI-Lauf).

---

## Akzeptanz-Kriterien

### Backend
- [ ] `beleg.repository.ts`: `confirmBelegReview(pool, tenantId, belegId, audit)` — **status-gegateter** Writer (`UPDATE … SET status='categorized' WHERE … AND status='requires_review'`), `payload.audit.events`-Append `{type:'review_confirmed', actor, at}`, `logAuditEvent('beleg.review_confirmed', before:{status:'requires_review'}, after:{status:'categorized', category})`. `category`/`payload.categorization` **unverändert**. Returns DbBeleg|null. RLS via `setTenantContext`.
- [ ] `categorize.service.ts`: `confirmBelegReviewById(db, tenantId, belegId, {actor})` → Outcome-Union: `ok` | `not_found` | `invalid_status`(+status) | `category_required` | `not_categorized` | `bewirtung_fields_required`. Gates via `getBelegById`: Status===`requires_review`, `category` non-leer, `payload.categorization` vorhanden, Bewirtungs-Gate (category enthält 'bewirtung' → `payload.extraction.fields.bewirtung_anlass` & `…_teilnehmer` non-leer, identische Regel wie `update.handler.ts:75-95`).
- [ ] Neuer Handler `belege-confirm-review.handler.ts` (analog categorize): 401/403(support)/400(UUID) + Outcome→HTTP (404 / 422 INVALID_STATUS|CATEGORY_REQUIRED|NOT_CATEGORIZED|BEWIRTUNG_FIELDS_REQUIRED / 200 apiOk{beleg_id,status}).
- [ ] `belege-categorize.routes.ts`: `app.post('/belege/:id/confirm-review', RL, buildBelegeConfirmReviewHandler())` — **Per-Route-Rate-Limit** (CodeQL-Falle, Memory `codeql-missing-rate-limiting`).
- [ ] **Export-Gap-Fix** `belege-lexware-exporter.ts`: nach dem `hasPersistedCategorization`-Gate zusätzlich `beleg.status` prüfen → nur exportierbar wenn Status `categorized` oder später; sonst `{status:'failed', error:'not_categorized'}`.

### Webapp
- [ ] `api/belege.ts`: `confirmBelegReview(id)` → `POST /belege/:id/confirm-review` (unwrap `{ok,data}`).
- [ ] `BelegeDetailPage.tsx`: Button **„Als geprüft bestätigen"** — sichtbar nur bei `status==='requires_review'` + `canWrite`, gesperrt bei `isDirty`. Klick → `confirmBelegReview` → `refreshBeleg` → Toast (success / 422-Fehlermeldung bei Bewirtung/Category).

### Tests + Gates
- [ ] Service: happy-path (category + payload.categorization bleiben), invalid_status, not_found, category_required, not_categorized, Bewirtung happy + bewirtung_fields_required, Idempotenz (2. Aufruf → invalid_status).
- [ ] Handler: 401/403/400/200/422(alle)/404 + Audit-Event geschrieben.
- [ ] Exporter: `requires_review`-Beleg MIT payload.categorization → NICHT exportiert (`failed`/`not_categorized`).
- [ ] Webapp: `confirmBelegReview` API; Button-Sichtbarkeit (Status+Rolle), isDirty-Sperre, Erfolg-Refresh+Toast, 422-Toast.
- [ ] `npm run build` + `npm test` (DB) + Lint grün.

---

## Hinweise / Grenzen

- **Keine Migration** (Status `categorized` ist im CHECK von Migration 030 erlaubt).
- Strikt nur Statuswechsel — keine Re-Kategorisierung, keine Feld-Mutation im confirm-Endpoint.
- Idempotenz über das exakte `requires_review`-Gate (2. Call → invalid_status).
