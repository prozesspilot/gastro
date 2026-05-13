# Audit-Workflow

Dieses Verzeichnis enthält die generierten Audit-Reports des
`konzept-auditor`-Subagents.

## Trigger

- `/audit-konzept` — startet einen neuen Lauf. Output landet als
  `REPORT-<YYYY-MM-DD>.md` (oder `-<n>.md` bei mehrfach pro Tag).
- `/audit-apply <pfad-zu-REPORT.md>` — wendet **nur** die `DELETE:`-
  Empfehlungen aus dem genannten REPORT an, mit expliziter Rückfrage.

## Lebenszyklus

1. Engineer triggert `/audit-konzept` nach jedem Sprint.
2. Auditor läuft, schreibt REPORT, antwortet mit Übersicht.
3. Engineer reviewt REPORT — was ist BLOCKER, WARN, NOTE?
4. Optional: `/audit-apply` für die unkritischen DELETE-Empfehlungen.
5. Code- und Spec-Anpassungen passieren **nicht** durch den Auditor —
   Engineer macht sie manuell oder per neuem Prompt-Run.

## Was der Auditor NIE tut

- Code ändern
- Specs umschreiben
- ENV-Files anfassen
- Migrationen anlegen
- Commits / Pushes
