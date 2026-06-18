# T062 — Server-seitiges Rollen-Schreib-Gate (m14StaffAuthHook)

**ID:** T062
**Priorität:** P2 (Security-Härtung — kein Pilot-Blocker, aber vor Mehr-Mitarbeiter-Betrieb)
**Geschätzt:** S–M
**Anker:** `backend/src/core/auth/m14-staff-auth.ts` · CLAUDE.md §5.3 · Code-Review PR #136 (T059)

---

## Problem

`m14StaffAuthHook` prüft derzeit **nur, ob** ein gültiges Staff-Cookie (`pp_auth`) vorliegt — er unterscheidet die Rollen `geschaeftsfuehrer` / `mitarbeiter` / `support` **nicht**. Damit akzeptieren die schreibenden Belege-Handler (`PATCH /belege/:id`, `DELETE /belege/:id`, `POST /belege/:id/reprocess`, `POST /belege/:id/categorize`, Exporte) auch eine `support`-Session.

Im Frontend (T059, `AuthContext.m14UserToAuthUser`) ist `support` bereits auf read-only gemappt (`belege.read`, `tenants.read`) — aber das ist **nur UI-Sichtbarkeit**. Ein `support`-User kann am UI vorbei (direkter API-Call) schreiben. Die Server-Durchsetzung, auf die der Frontend-Kommentar verweist, fehlt.

## Befund bei Bearbeitung (2026-06-18) — Prämisse veraltet

Bei der Code-Verifikation (3 Read-only-Explore-Agenten, je mit Datei:Zeile) zeigte sich: Die Server-seitige Durchsetzung **existiert bereits inline in jedem schreibenden Handler** — offenbar während T059/T060 (Webapp-Reboot) mitgebaut, nachdem diese Task in den Backlog geschrieben wurde. `m14StaffAuthHook` macht weiterhin nur die Authentifizierung, aber die Handler gaten die Rolle selbst:

| Endpoint | Code-Gate | Test |
|---|---|---|
| `PATCH /belege/:id` | `support` → 403 | `update-delete.handler.test.ts:114` |
| `DELETE /belege/:id` | nur `geschaeftsfuehrer` (mitarbeiter+support → 403) | `update-delete.handler.test.ts:292` |
| `POST /belege/:id/categorize` | `support` → 403 | `belege-categorize.handler.test.ts` |
| `POST .../exports/lexware` | `support` → 403 | `belege-lexware-handlers.test.ts` |
| `POST /exports/lexware/batch` | nur `geschaeftsfuehrer` | `belege-lexware-handlers.test.ts` |
| `POST /belege/upload` | `support` → 403 | `beleg-upload.test.ts:357` |
| `POST /belege/:id/reprocess` | `support` **erlaubt** (bewusst, s.u.) | `reprocess.handler.test.ts` |

Das Sicherheitsziel — kein Schreiben durch `support` am UI vorbei — ist damit **schon erreicht und getestet**. Es gibt keinen `requireRole`-Helper; die Checks sind dezentral pro Handler (einheitliches Muster `if (staff.role …) return 403`).

**Entscheidungen (GF Steve, 2026-06-18):**
- **Scope = minimal abschließen.** Kein Refactor der funktionierenden, getesteten Inline-Checks auf einen zentralen `requireRole`-Hook. Real offen bleibt nur der veraltete Frontend-Kommentar. (Zentralisierung + Audit-Log-bei-Reject bewusst **nicht** umgesetzt — bei Bedarf neuer Task.)
- **`reprocess` bleibt für `support` erlaubt.** Die ursprüngliche AC-Forderung „reprocess → 403 für support" wird **verworfen**: reprocess mutiert keine Beleg-Felder, stößt nur OCR neu an (read-only-Äquivalent für den Operator, dokumentiert in `reprocess.handler.ts`). AC unten entsprechend angepasst.

## Was zu tun ist (ursprünglicher Plan — durch Befund größtenteils erledigt)

1. Rollen-Anforderung pro schreibendem Handler durchsetzen — entweder:
   - eine `requireRole(...)`/`requirePermission(...)`-Variante des Staff-Hooks (liest `role` aus der Session), oder
   - ein zentraler Permission-Check analog zur Frontend-Map (gf → alles, mitarbeiter → belege.write, support → nur lesen).
2. Schreib-Endpoints, die `support` NICHT nutzen darf, mit dem Gate versehen; Lese-Endpoints offen lassen.
3. Bei fehlender Rolle: `403` mit klarer Fehlermeldung (nicht `401` — authentifiziert, aber nicht berechtigt).
4. Audit-Log-Eintrag bei abgelehntem Schreibversuch (GoBD/Security).

## Akzeptanz-Kriterien (angepasst nach Befund 2026-06-18)

- [x] Integration-Test: `support`-Session → `PATCH`/`DELETE`/`categorize`/`Lexware-Export` Beleg = `403`; `mitarbeiter`/`geschaeftsfuehrer` = erlaubt. → **existiert bereits** (`update-delete.handler.test.ts`, `belege-categorize.handler.test.ts`, `belege-lexware-handlers.test.ts`). `reprocess` **bewusst ausgenommen** (support erlaubt, s. Befund).
- [x] Lese-Endpoints (`GET /belege`, `GET /belege/:id`, `GET /tenants`) bleiben für alle drei Rollen offen. → GET-Handler haben keinen Rollen-Check (verifiziert).
- [x] Frontend-Kommentar in `webapp/src/auth/AuthContext.tsx` aktualisiert (Verweis auf das nun existierende, pro-Handler durchgesetzte Server-Gate inkl. reprocess-Ausnahme).
- [x] `npm run build` + `npm test` (backend) grün. → Kein Backend-Code geändert; Backend war bereits grün. Webapp-Build/Tests grün (einzige Änderung = Kommentar).

## Kontext

Aufgedeckt im Code-Review von PR #136 (T059 Webapp-Reboot). Der Frontend-Teil (UI-Sichtbarkeit) ist dort erledigt; dieser Task schließt die serverseitige Lücke.
