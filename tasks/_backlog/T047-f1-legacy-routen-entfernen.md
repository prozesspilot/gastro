# T047 — F1: Legacy-`/receipts`+`/customers`-Welt aus `app.ts` + tote Module entfernen

**ID:** T047
**Verantwortlich:** Andreas
**Priorität:** P1 (Pilot-Finish F1)
**Branch:** `andreas/T047-legacy-routen-entfernen`
**Geschätzt:** 1 Tag
**Dependencies:** keine
**Ziel-Meilenstein:** Pilot — F1
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

`backend/src/app.ts` registriert zwei Welten gleichzeitig (CLAUDE.md §3.1): den **lebenden** belege-Block und einen **toten `apiApp`-Block** (≈ Z. 263–313) mit ~30 Routen auf `/receipts`- und `/customers`-Prefixen gegen **Geister-Tabellen** → HTTP 500. Diese tote Hülle ist die Drift-Quelle und der Grund, warum n8n nichts durchbringt.

**Entfernen:** den gesamten toten `apiApp`-Block **plus** die toten Routen im LIVE-Block — insbesondere das **`users`-Modul** (Email+Passwort, Geister `refresh_tokens`/`auth_events`, `app.ts:241-243`). Zugehörige tote Modul-Ordner löschen.

**Behalten (Pilot-Kern):** `belege` (M01), `categories` (M03, In-Memory), `belege`-Lexware (M05), `kasse`+`sumup` (M15), `m14-auth` (Discord-OAuth + Notfall-TOTP), `dsgvo-v2`, `tenants`, `health`, `sse`, `docs`, `webhooks`.

---

## Akzeptanz-Kriterien

- [ ] Toter `apiApp`-Block (≈ `app.ts:260–315`) entfernt
- [ ] `users`-Modul-Routen (Email+Passwort, im LIVE-Block) entfernt; `m14-auth` (Discord+Notfall) bleibt funktionsfähig
- [ ] Tote Modul-Ordner gelöscht: `modules/{customers,profiles,receipts,_shared/receipts,_shared/customers,m02-archive,m03-categorization(alt-Pfad),m04-datev,m06-sevdesk,m06-advisor-portal,m07-spreadsheet,m08-reporting,m09-supplier-comm,m10-whatsapp,m11-imap,plugin-system,routing,users}` + `core/hooks` — **soweit nicht vom Pilot-Kern importiert** (vorher Import-Graph prüfen!)
- [ ] `git grep -nE "/receipts|/customers" backend/src/app.ts` = 0 aktive Registrierungen
- [ ] App startet, alle Pilot-Routen (belege/lexware/kasse/auth/dsgvo-v2/health) erreichbar
- [ ] CI grün (lint + typecheck + tests + build) — übersprungene Tests der gelöschten Module ebenfalls entfernen
- [ ] code-reviewer-Agent gibt OK

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §3.1 (Zwei-Welten), §3.4 (tote Hülle), §3.6 (F1)
- `infra/decisions/004-datenmodell-customer-vs-tenant.md` — Reboot-Entscheidung (Option A)
- `backend/src/app.ts` — Registrierungs-Blöcke

---

## Claude-Code-Start-Prompt

```
Lies zuerst:
- /tasks/_in_progress/T047-<owner>-legacy-routen-entfernen.md (diese Task)
- .claude/CLAUDE.md §3 (komplett)
- infra/decisions/004-datenmodell-customer-vs-tenant.md
- backend/src/app.ts

Vorgehen:
1. Import-Graph prüfen: Welche der toten Module werden vom Pilot-Kern importiert? (git grep)
2. apiApp-Block + users-Modul-Routen aus app.ts entfernen.
3. Tote Modul-Ordner löschen (nur die, die nirgends vom Kern importiert werden).
4. Verwaiste Imports + übersprungene Tests aufräumen.
5. npm run build + npm test müssen grün bleiben.

Bei Unklarheiten (z.B. ein totes Modul wird doch importiert): in dieser Datei dokumentieren, NICHT raten.

Wenn fertig: /finish-task
```

---

## Notes

Vorsicht: `categories.routes.ts` (M03) liefert eine In-Memory-Konstante und BLEIBT. Der belege-`categorize`-Endpoint kommt in T048 — F1 löscht nur die tote `/receipts`-Categorize-Welt, nicht die M03-Logik, die T048 wiederverwendet. Reihenfolge daher: T047 vor T048, aber die M03-Handler-Logik (`categorize.handler.ts`) erst in T048 final entfernen/umhängen.
