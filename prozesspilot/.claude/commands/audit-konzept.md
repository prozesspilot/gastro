---
description: Führt einen Audit-Lauf gegen das Konzept↔Code-Mapping aus. Schreibt einen REPORT, ändert KEINEN Code.
---

Benutze den `konzept-auditor`-Subagent (Tool: Agent) und übergib ihm folgenden Kontext.

WORKING-DIR: /Users/donandrejo/Documents/ProzessPilot/prozesspilot
SPEC-DIR:    /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung
OUTPUT-FILE: /Users/donandrejo/Documents/ProzessPilot/Modulkonzept/Konzeptentwicklung/_audit/REPORT-$(date +%Y-%m-%d).md

FOKUS (optional, vom User per Argument): $ARGUMENTS

Aufgabe:
1. Lies STATUS.html und alle Specs unter Konzeptentwicklung/modules/.
2. Vergleiche systematisch mit den Backend-Modulen unter prozesspilot/backend/src/modules/.
3. Prüfe Routen, JSON-Feld-Naming, Event-Typen, ENV-Variablen, Migrationen.
4. Schreibe EINEN REPORT (überschreibt nicht, falls schon ein REPORT von heute existiert: lege REPORT-<datum>-<n>.md an).
5. Antworte mir mit Pfad zum REPORT + den ersten 8 Befunden als Übersicht.

Du darfst KEINE Specs und KEINEN Code editieren. Nur lesen + Report schreiben.
