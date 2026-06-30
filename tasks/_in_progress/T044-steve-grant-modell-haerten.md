# T044 — Grant-Modell / Owner-Rolle für gastro_app härten

> **Owner:** Backend/Infra (offen)
> **Priorität:** P2 — latentes Prod-Deploy-Risiko (in Dev/CI unsichtbar)
> **Dependencies:** keine
> **Entdeckt:** Audit nach T041, 2026-06-02 (verifiziert)
> **Status:** backlog

---

## Problem

`scripts/setup-app-role.sql` vergibt `gastro_app`-Rechte auf künftige Tabellen ausschließlich über
`ALTER DEFAULT PRIVILEGES IN SCHEMA public`. Default-Privileges greifen aber **nur** für Objekte,
die von genau der Rolle erzeugt werden, die das ALTER ausführte. Läuft `setup-app-role.sql` als
Superuser `pp`, die Migrations aber als `gastro_owner` (via `DATABASE_URL_MIGRATE`), bekommen alle
künftig von `gastro_owner` erzeugten Tabellen **keine** automatischen `gastro_app`-Grants →
das Backend (als `gastro_app`) läuft beim ersten Zugriff auf eine neue Tabelle in `permission denied`.
In Dev/CI unsichtbar, weil dort Owner == App == `pp` (Superuser).

Zusätzlich: `migrations/SCHEMA.md` nennt eine ENV `DATABASE_URL_OWNER`, die im Code nicht existiert
(real: `DATABASE_URL_MIGRATE`); die Superuser-vs-`gastro_owner`-Aussage ist widersprüchlich.

## Akzeptanz-Kriterien

- [x] Owner-Rolle festnageln: `setup-app-role.sql` koppelt die `ALTER DEFAULT PRIVILEGES` jetzt
      explizit `FOR ROLE gastro_owner` (guarded, falls Rolle existiert) — Default-Privileges hängen
      damit an der Migrations-Rolle, NICHT an der ausführenden Rolle des Setup-Skripts. Plus die
      plain-Variante für Dev/CI. Header + Doku auf `DATABASE_URL_MIGRATE` als Setup-Connection.
- [x] Defense-in-depth: Als **Konvention** in `SCHEMA.md` §7 dokumentiert (rollen-gegateter
      `GRANT … TO gastro_app` am Migrations-Ende, CI-sicher). **Bewusste Scope-Entscheidung:** KEIN
      retroaktiver per-Tabelle-Grant über ~22 bestehende Migrationen — die `FOR ROLE`-Fix ist die
      durable Wurzel-Behebung; das Setup-Skript catcht bestehende Tabellen via `GRANT … ON ALL
      TABLES`. (Hinweis der Spec „wie 061" trägt nicht: 061 ist ein Fn-Grant, kein Tabellen-Grant —
      ein per-Tabelle-Vorbild existierte gar nicht.)
- [x] `SCHEMA.md` korrigiert: `DATABASE_URL_OWNER` → `DATABASE_URL_MIGRATE` (3 Stellen), Owner-/
      Superuser-Aussage in §7 vereinheitlicht, Migrations-Tabelle §1 von 060 auf **129** erweitert
      (inkl. `pos_credentials`/`tasks` als „keine RLS" markiert), Stand-Datum aktualisiert.

## Umsetzung (2026-06-30, Steve)

Ist-Stand vor Bau verifiziert (Read-only-Agent): keines der 3 AC war umgesetzt; 127/128/129
verließen sich explizit auf das brüchige Default-Privileges-Pattern → T044 genuin offen.

Geändert: `backend/scripts/setup-app-role.sql` (FOR-ROLE-Fix), `backend/migrations/SCHEMA.md`
(§1-Tabelle + §7 + Konvention + Datum).

**Verifikation:** Reine SQL-Ops-Skript-/Doku-Änderung. `setup-app-role.sql` wird in CI NICHT
ausgeführt (CI migriert als Superuser `pp`, der Grants ohnehin nicht braucht) → der Grant-Pfad ist
weder lokal noch in CI automatisiert testbar; Beweis = Reasoning + code-reviewer. Build/Lint
unberührt (keine TS-Änderung).

## Hinweis (bleibt, gated)

Verwandt mit der Prod-Rollen-Verifikation aus T041: vor KW22-Pilot manuell prüfen, als welche Rolle
die Prod-App und der Prod-Migrate-Lauf tatsächlich verbinden (steht in `MANUELLE_AUFGABEN.md`).
