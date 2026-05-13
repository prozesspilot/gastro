---
description: Wendet NUR die `DELETE:`-Empfehlungen aus einem REPORT an. Safety-Net — kein anderes Editing.
argument-hint: <pfad-zu-REPORT.md>
---

KRITISCH: Dieses Command darf NUR Dateien löschen oder ins `_archive/`-Verzeichnis verschieben, die im übergebenen REPORT explizit unter „DELETE-Vorschläge" gelistet sind. Keine sonstigen Änderungen.

REPORT-PFAD: $ARGUMENTS

Schritt-für-Schritt:
1. Lies den REPORT unter `$ARGUMENTS`.
2. Extrahiere alle Zeilen aus dem Abschnitt „DELETE-Vorschläge" — pro Zeile genau ein Pfad.
3. Zeige mir die Liste und frage nach expliziter Bestätigung („JA, löschen") bevor du irgendetwas tust.
4. Für jeden bestätigten Pfad:
   - Wenn Pfad unter `Konzeptentwicklung/` liegt → nach `Konzeptentwicklung/_archive/` verschieben (`git mv`), nicht löschen.
   - Wenn Pfad unter `prozesspilot/` liegt → `git rm` (sodass Reverten möglich ist).
5. NIEMALS löschen:
   - `_archive/`, `Foundation_Spec.md`, `STATUS.html`, `_audit/REPORT-*.md`
   - `prozesspilot/.env*`, `prozesspilot/secrets/`, `prozesspilot/migrations/`
6. Nach Abschluss: zeige `git status` und schlage einen Commit-Befehl vor (ohne ihn auszuführen).

Wenn der REPORT keinen DELETE-Abschnitt hat oder leer ist: melden und abbrechen.
