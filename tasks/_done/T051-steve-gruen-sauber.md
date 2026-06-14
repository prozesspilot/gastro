# T051 — F5: Grün + sauber (kein `customers`/`receipts`-Bezug, CLAUDE.md final)

**ID:** T051
**Verantwortlich:** gemeinsam
**Priorität:** P1 (Pilot-Finish F5 — Drift-Motor endgültig abstellen)
**Branch:** `gemeinsam/T051-gruen-sauber`
**Geschätzt:** 0,5 Tag
**Dependencies:** T050 (Smoke-Test grün)
**Ziel-Meilenstein:** Pilot — F5
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Den Pilot-Stand „versiegeln": `npm run build` + `npm test` grün, **kein aktiver Bezug** mehr auf die Geister-Tabellen `customers`/`receipts`/`customer_profiles` im lebenden Code, und CLAUDE.md §3 auf den dann wahren Stand bringen (M03/categorize ist jetzt LIVE, Bau-Lücke geschlossen).

---

## Akzeptanz-Kriterien

- [x] `npm run build` + `npm test` grün (Build exit 0, **562 passed / 0 failed**; 22 skipped = legitime DB-E2E, kein toter Code mehr dahinter)
- [x] `git grep` der Geister-Tabellen = 0 im **aktiven** Code — geprüft für `receipts|customers|customer_profiles|suppliers_global|categorization_cache|customer_categories|customer_hooks|customer_credentials|refresh_tokens|auth_events|monthly_reports|communications` (SQL **und** Kommentare), `backend/src` ohne Tests
- [x] `.claude/CLAUDE.md` §3.2 aktualisiert: M03/Categorize ✅ LIVE; §3.3 von „Bau-Lücke" → „geschlossen"
- [x] `.claude/CLAUDE.md` §3 Stand-Datum (2026-06-13) + §3.1/§3.4 (entfernt vs. eingefroren) aktualisiert; `infra/decisions/004` auf „Reboot abgeschlossen"
- [x] Pilot-Pfad-Diagramm in §3.6 stimmt mit dem realen Code überein (Webapp-getrieben, F3-n8n-Zeile korrigiert)
- [ ] code-reviewer-Agent gibt OK

## Umsetzung (2026-06-13)

Scope „Sauber" (per Rückfrage bestätigt): isoliert-toten Geister-Code gelöscht, LIVE-Pfad sauber getrennt.

**Gelöscht (git rm, reversibel):**
- Alt-`m03-categorization`-receipts-Cluster: `routes.ts`, `handlers/categorize.handler.ts`, `schemas/`, `services/{claude-categorizer,master-data-resolver,skr-mapper,override-resolver,confidence-scorer,audit.service,event-emitter,types}.ts`, `prompts/categorize.system.md` + 4 Alt-Tests.
- `_shared/receipts/receipt.repository.ts`, `__tests__/receipts.test.ts`, `__tests__/integration/receipt-pipeline.test.ts`, `tests/golden/categorization/`.
- **hook-runner-Subsystem** (Folge-Entscheidung, da nach Cluster-Abbau toter Code ohne Aufrufer): `core/hooks/hook-runner.ts` + `hook.repository.ts` + `hook.types.ts` + Test; `setHookRunnerDeps`-Setup aus `app.ts` entfernt. (`request-logging.ts` + `tenant-context.ts` bleiben — lebend.)
- **Lexware-Alt-Auth** (gleicher Muster-Fall, in Discovery gefunden): `core/adapters/booking/lexoffice/auth.ts` (`loadApiKey` gegen `customer_credentials`) + tote `createLexofficeClientForCustomer`-Factory aus `lexoffice.client.ts`. LIVE-Export nutzt `booking_credentials` (T009) — unberührt.

**Behalten/aktualisiert:** `bewirtungs-detector.ts` (LIVE via M01-`ocr.service`), `system-categories.ts`, `belege-*` (T048). READMEs (m03/m05/m01) + 3 Doc-Kommentare (crypto.ts/tenant.ts/config.ts) auf den belege-Stand gebracht.

**Bekannter Rest (harmlos, Post-Pilot):** `backend/src/modules/tenants/` ist nicht in `app.ts` registriert (Spalten-Drift, nicht erreichbar) — in §3.4 dokumentiert.

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §3.2/§3.3/§3.6 (F5) — der Wahrheits-Anker, jetzt final
- `infra/decisions/004-datenmodell-customer-vs-tenant.md` — Reboot abgeschlossen vermerken

---

## Claude-Code-Start-Prompt

```
Lies zuerst:
- /tasks/_in_progress/T051-<owner>-gruen-sauber.md (diese Task)
- .claude/CLAUDE.md §3 (komplett)

Prüfe build+test, grep nach Geister-Tabellen im aktiven Code, aktualisiere CLAUDE.md §3 auf den wahren Stand (M03 LIVE).

Bei Unklarheiten: in dieser Task-Datei dokumentieren, NICHT raten.

Wenn fertig: /finish-task
```

---

## Notes

Nach T051 ist der Pilot-Pfad geschlossen. Danach gilt: neue Funktion/neues Modul erst, wenn der Pilot zahlt (CLAUDE.md §3.7). Post-Pilot-Tasks liegen in `tasks/_eingefroren/`.
