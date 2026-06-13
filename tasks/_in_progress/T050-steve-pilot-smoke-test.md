# T050 — F4: Pilot-Smoke-Test (echter Beleg bis Lexware Office)

**ID:** T050
**Verantwortlich:** gemeinsam (Andreas Backend + Steve verifiziert)
**Priorität:** P1 (Pilot-Finish F4 — Qualitäts-Tor)
**Branch:** `gemeinsam/T050-pilot-smoke-test`
**Geschätzt:** 0,5–1 Tag
**Dependencies:** T049 (n8n-Pilot-Workflow steht)
**Ziel-Meilenstein:** Pilot — F4
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Ein **echter Pilot-Beleg** läuft komplett durch und landet in **Lexware Office**: Upload → OCR (Worker) → Categorize → Lexware-Export. Das ist das Tor, das auch verifiziert, dass der OCR-Worker in Prod tatsächlich läuft.

**Basis:** PR #92 (`qa/smoke-test-suite`) enthält bereits ein Smoke-Skript, hat aber Review-Blocker (falscher Metrics-Endpoint-URL, toter Auth-Bypass-Zweig, nicht verdrahtete CI-Claims). Diese Blocker beheben und das Skript auf den echten belege-Pfad richten.

---

## Akzeptanz-Kriterien

- [x] Smoke-Skript (`scripts/qa-smoke.sh`) durchläuft Login → Upload → OCR-Status → categorize → `exports/lexware/batch` gegen eine laufende Instanz
- [x] Review-Blocker aus PR #92 behoben: Metrics-URL korrekt (`/metrics` im Root, **nicht** `/api/v1/metrics`); kein `PP_AUTH_DISABLED`-Auth-Bypass mehr (echter M14-JWT-Login via `pp_auth`-Cookie); tote `/tenants`+`/customers`-Calls entfernt
- [x] Erfolgs-/Fehler-Ausgabe eindeutig (Exit-Code 0/1/2 + Statusmeldung pro Stufe `[n/6]`)
- [x] Dokumentiert, wie der Test gegen Prod/Staging gefahren wird (`scripts/qa-smoke.README.md` + Skript-Header: ENV, Tenant, Beispiel)
- [x] Ein neutraler Beispiel-Beleg ist als Fixture hinterlegt (`backend/tests/fixtures/test-receipt.pdf`, kein PII) + Anleitung im README
- [ ] code-reviewer-Agent gibt OK

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §3.6 (F4)
- PR #92 (`qa/smoke-test-suite`) — Skript-Basis, Blocker beheben
- `Modulkonzept/Konzeptentwicklung/00_Pilot_Strategie.md` — Pilot-Erfolgskriterium

---

## Claude-Code-Start-Prompt

```
Lies zuerst:
- /tasks/_in_progress/T050-<owner>-pilot-smoke-test.md (diese Task)
- .claude/CLAUDE.md §3.6
- den Diff von PR #92 (git diff main origin/qa/smoke-test-suite)
- backend/src/app.ts (echte belege-Endpoints + Health/Ready)

Richte das Smoke-Skript auf den belege-Pfad, behebe die #92-Blocker.

Bei Unklarheiten: in dieser Task-Datei dokumentieren, NICHT raten.

Wenn fertig: /finish-task
```

---

## Notes

PR #92 nach Übernahme schließen. Kein echter Beleg-Inhalt (PII) ins Repo — nur ein neutrales Test-Bild/Anleitung.

## Implementierungs-Entscheidung (2026-06-13)

**Artefakt: Operator-Smoke-Skript (bash/curl)** — bewusst kein CI-Test. Begründung aus verifizierter Code-Discovery:

- Ein *echter* Beleg-Durchlauf bis Lexware Office braucht eine **laufende Instanz** + echte externe Dienste (Google Vision, Claude, Lexware-Credentials) + **Geschäftsführer-Login mit TOTP**. Das ist in CI nicht reproduzierbar (keine externen Dienste/Secrets) und kann nur ein Operator manuell gegen Staging/Prod fahren. Das CI-Pendant (Health + Metrics, in-process, gemockt) existiert bereits als `backend/tests/smoke.test.ts`.
- **Auth-Realität (T047–T049):** Die belege-Endpoints sind **JWT** (`pp_auth`-Cookie via M14-Notfall-Login + `X-PP-Tenant-ID`-Header), **nicht** HMAC. Das #92-Skript nutzte HMAC + `PP_AUTH_DISABLED`-Bypass → komplett auf den JWT-Login umgestellt.
- **Verifizierte Routen-Kette:** `POST /api/v1/auth/notfall/login` → `POST /api/v1/belege/upload` → poll `GET /api/v1/belege/:id` bis `status=extracted` → `POST /api/v1/belege/:id/categorize` → `POST /api/v1/exports/lexware/batch` (gf-only).

**Manueller Schritt (F4-Tor):** Der eigentliche „echter Beleg bis Lexware Office"-Lauf ist ein Operator-Schritt für Steve gegen die laufende Instanz → siehe `tasks/MANUELLE_AUFGABEN.md`.
