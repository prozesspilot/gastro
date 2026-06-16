# T062 — Server-seitiges Rollen-Schreib-Gate (m14StaffAuthHook)

**ID:** T062
**Priorität:** P2 (Security-Härtung — kein Pilot-Blocker, aber vor Mehr-Mitarbeiter-Betrieb)
**Geschätzt:** S–M
**Anker:** `backend/src/core/auth/m14-staff-auth.ts` · CLAUDE.md §5.3 · Code-Review PR #136 (T059)

---

## Problem

`m14StaffAuthHook` prüft derzeit **nur, ob** ein gültiges Staff-Cookie (`pp_auth`) vorliegt — er unterscheidet die Rollen `geschaeftsfuehrer` / `mitarbeiter` / `support` **nicht**. Damit akzeptieren die schreibenden Belege-Handler (`PATCH /belege/:id`, `DELETE /belege/:id`, `POST /belege/:id/reprocess`, `POST /belege/:id/categorize`, Exporte) auch eine `support`-Session.

Im Frontend (T059, `AuthContext.m14UserToAuthUser`) ist `support` bereits auf read-only gemappt (`belege.read`, `tenants.read`) — aber das ist **nur UI-Sichtbarkeit**. Ein `support`-User kann am UI vorbei (direkter API-Call) schreiben. Die Server-Durchsetzung, auf die der Frontend-Kommentar verweist, fehlt.

## Was zu tun ist

1. Rollen-Anforderung pro schreibendem Handler durchsetzen — entweder:
   - eine `requireRole(...)`/`requirePermission(...)`-Variante des Staff-Hooks (liest `role` aus der Session), oder
   - ein zentraler Permission-Check analog zur Frontend-Map (gf → alles, mitarbeiter → belege.write, support → nur lesen).
2. Schreib-Endpoints, die `support` NICHT nutzen darf, mit dem Gate versehen; Lese-Endpoints offen lassen.
3. Bei fehlender Rolle: `403` mit klarer Fehlermeldung (nicht `401` — authentifiziert, aber nicht berechtigt).
4. Audit-Log-Eintrag bei abgelehntem Schreibversuch (GoBD/Security).

## Akzeptanz-Kriterien

- [ ] Integration-Test: `support`-Session → `PATCH/DELETE/reprocess/categorize` Beleg = `403`; `mitarbeiter`/`geschaeftsfuehrer` = erlaubt.
- [ ] Lese-Endpoints (`GET /belege`, `GET /belege/:id`, `GET /tenants`) bleiben für alle drei Rollen offen.
- [ ] Frontend-Kommentar in `webapp/src/auth/AuthContext.tsx` aktualisieren (Verweis auf das nun existierende Server-Gate).
- [ ] `npm run build` + `npm test` (backend) grün.

## Kontext

Aufgedeckt im Code-Review von PR #136 (T059 Webapp-Reboot). Der Frontend-Teil (UI-Sichtbarkeit) ist dort erledigt; dieser Task schließt die serverseitige Lücke.
