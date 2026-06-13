# Eingefrorene Tasks (Post-Pilot)

Diese Tasks sind **gültig und durchdacht**, aber **eingefroren bis der Pilot zahlt** — gemäß dem Wahrheits-Anker `.claude/CLAUDE.md` §3.4 / §3.7 („keine neue Funktion / kein neues Modul bis der Pilot zahlt; der Pilot wird durch Streichen fertig").

Der aktive `tasks/_backlog/` zeigt **nur** den Pilot-Pfad (P0-Sicherheit + F1–F5). Alles hier ist **Post-Pilot** und wird erst angefasst, wenn der Pilot läuft und das jeweilige Modul reaktiviert wird.

## Kategorien

- **Mitarbeiter-Webapp / Task-Dashboard:** T024, T025, T026, T027
- **Frontends (eingefroren):** T016 (Onboarding-Wizard), T037 (Web-Chat-Widget)
- **Discord-Integration:** T031, (T038 als geparkter Branch)
- **Eingefrorene Module / Billing:** T035 (invoices/Auto-Rechnung), T036 (Provisions-Übersicht)
- **Backend-Qualität / Architektur (Post-Pilot):** T021 (M03-Event-Decoupling), T022 (POS-Cron RLS), T023 (M05/M15-Integrationstests), T029 (Datenmodell-Doku-Sync), T032 (Event-Vertrag)
- **Reboot-Rest & verifizierte Findings:** T042 (audit_log-Writer-Drift), T043 (`/tenants`-Schema/RLS), T044 (Grant-Modell/Owner-Rolle), T045 (M02–M09 auf belege portieren)

## Reaktivieren

Wenn der Pilot zahlt und ein Modul drankommt: die Task-Datei zurück nach `tasks/_backlog/` verschieben (`git mv`), gegen den aktuellen `main`-Stand + CLAUDE.md §3 prüfen (Stände können veraltet sein) und dann via `/start-task` starten. Viele dieser Tasks haben einen erhaltenen Branch (siehe geschlossene PRs #86/#87/#88/#94/#95/#97/#102) — reopenbar.
