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

- [ ] Owner-Rolle festnageln: `setup-app-role.sql` als dieselbe Rolle laufen lassen, die migriert,
      ODER `ALTER DEFAULT PRIVILEGES … FOR ROLE gastro_owner` ergänzen.
- [ ] Defense-in-depth: pro neuer Tabelle explizites `GRANT … TO gastro_app` in die Migration (wie 061).
- [ ] `SCHEMA.md` auf `DATABASE_URL_MIGRATE` korrigieren + Owner-Aussage vereinheitlichen.

## Hinweis

Verwandt mit der Prod-Rollen-Verifikation aus T041: vor KW22-Pilot prüfen, als welche Rolle die
Prod-App und der Prod-Migrate-Lauf tatsächlich verbinden.
