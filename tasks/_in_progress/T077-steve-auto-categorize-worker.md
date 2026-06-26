# T077 — Auto-Kategorisieren im OCR-Worker (KI kategorisiert selbstständig)

> **Owner:** Steve / gemeinsam
> **Priorität:** P1 (Build-out — schließt die Automatik der LIVE-Mitte: nach OCR automatisch kategorisieren)
> **Welle:** Build-out (nach T076)
> **Dependencies:** T048 (categorize-Logik), T007 (OCR-Worker), T076 (manueller Button bleibt als Override)
> **Spec-Referenzen:** CLAUDE.md §1 (Wertversprechen „KI kategorisiert automatisch") · §3.2/§3.6 (LIVE-Mitte) · `src/workers/ocr-worker.ts` · `src/modules/m03-categorization/handlers/belege-categorize.handler.ts`

---

## Ziel

Heute endet die Pipeline nach dem OCR bei Status `extracted` — Kategorisieren ist nur die **manuelle** Route (T048/T076). Das widerspricht dem Wertversprechen. T077 macht das Kategorisieren **selbstständig**: nach erfolgreichem OCR kategorisiert der Worker **automatisch** (`extracted` → `categorized` / `requires_review`), ohne Mitarbeiter-Klick.

**Entscheidungen (GF Steve, 2026-06-26):**
- Auto-Kategorisieren läuft im **OCR-Worker** direkt nach `extracted`, **best-effort** (Fehler ⇒ Beleg bleibt `extracted`, kein Job-Fail).
- **Nur wenn `CLAUDE_API_KEY` gesetzt** ist — sonst würde jeder Beleg in `requires_review` landen (Fallback-Engine), das wäre eine Review-Flut in der keylosen Phase. Ohne Key bleibt der Beleg `extracted` + manueller Button.
- Der **manuelle Button (T076) bleibt** als Re-Kategorisieren/Override.
- **Export bleibt manuell** (bewusste „an Steuerberater übergeben"-Aktion).

---

## Akzeptanz-Kriterien

### Refactor (DRY)
- [x] Kategorisier-Logik aus `belege-categorize.handler.ts` in einen geteilten Service `m03-categorization/services/categorize.service.ts` ziehen: `categorizeBelegById(db, tenantId, belegId, { actor, deps? })` → Outcome `{ ok, reason?, status?, categorization? }`. Enthält `extractOcrFields`, `CONFIDENCE_THRESHOLD`, T053-Bewirtungs-Schutz, `updateBelegCategorization`.
- [x] Handler nutzt den Service (Auth/Rolle/UUID-Checks + HTTP-Mapping bleiben): `not_found`→404, `invalid_status`→422, `ok`→200 (unveränderte Response-Shape). Categorizer bleibt injizierbar (Tests).

### Auto-Trigger
- [x] `ocr-worker.ts`: nach `processBeleg` mit `status==='extracted'` UND `config.CLAUDE_API_KEY` → `categorizeBelegById(..., actor={type:'system',id:null})` **best-effort** (try/catch, Log, kein Job-Fail). Ohne Key / anderer Status → übersprungen (Log).

### Tests + Gates
- [x] Service-Unit: `categorizeBelegById` (extracted→categorized bei sicherer KI, →requires_review bei Fallback, not_found, invalid_status, Bewirtungs-Schutz).
- [x] Worker: Auto-Kategorisieren wird nach `extracted` + Key getriggert; ohne Key/anderem Status NICHT; Categorize-Fehler bricht den OCR-Job NICHT ab.
- [x] Handler-Tests bleiben grün (Refactor verhaltensgleich).
- [x] `npm run build` + `npm test` (mit DB) + Lint grün.

---

## Hinweise / Anker / Grenzen

- **belege-Welt**, kein Hardcode. Actor für Auto = `{ type:'system', id:null }` → `updateBelegCategorization` mit `actorType:'system', actorId:'system'`.
- **Best-effort:** ein Categorize-Fehler darf den OCR-Job nicht failen (sonst Retry-Schleife). Beleg bleibt dann `extracted`.
- **requires_review-Korrekturpfad** bleibt offen (categorize akzeptiert nur `extracted`) — wie in T076 notiert, separater Backend-Folge-Task.
- Idempotenz: `categorizeBelegById` gated auf `status==='extracted'` → Doppel-Trigger (Auto + manuell) ist harmlos (zweiter sieht nicht-`extracted` → invalid_status).
