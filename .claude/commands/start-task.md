---
description: Startet eine Task aus dem Backlog. Liest die Task-Spec, verschiebt sie nach _in_progress, erstellt einen Branch und beginnt die Implementation. Verwendung - /start-task T015
---

# /start-task <task-id>

Starte die Task mit der angegebenen ID. Gehe folgendermaßen vor:

## Schritt 1: Task-Spec laden

1. Suche die Task-Datei in `tasks/_backlog/T<ID>-*.md`
2. Falls nicht gefunden: stoppen mit Hinweis "Task T<ID> nicht im Backlog gefunden. Verfügbare Tasks: <Liste>"
3. Lade die Task-Datei vollständig

## Schritt 2: Identität klären

Frage den User (kurz, einzeilig): "Bist du Steve oder Andreas? (Antwort: steve / andreas / server)"

## Schritt 3: Verschieben nach _in_progress

```bash
mv tasks/_backlog/T<ID>-*.md tasks/_in_progress/T<ID>-<owner>-<rest>.md
```

(z.B. `tasks/_in_progress/T015-andreas-m15-sumup-oauth.md`)

## Schritt 4: Branch erstellen

```bash
git checkout main
git pull
git checkout -b <owner>/T<ID>-<kurzbeschreibung>
```

(z.B. `andreas/T015-m15-sumup-oauth`)

## Schritt 5: Initial-Commit

```bash
git add tasks/
git commit -m "chore: start T<ID> <kurzbeschreibung>

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: <Owner-Name> <owner@prozesspilot.net>"
```

## Schritt 6: Spec-Referenzen laden

Aus der Task-Datei alle Dateien unter "Spec-Referenzen" lesen, damit der Kontext klar ist.

## Schritt 7: Discord-Notification

```bash
curl -X POST $DISCORD_DEV_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"content": "🟢 **<Owner>** hat **T<ID>** gestartet: <Titel>\nBranch: `<branch-name>`"}'
```

## Schritt 8: Implementation beginnen

Folge dem Claude-Code-Start-Prompt aus der Task-Datei. Falls Unklarheiten in der Spec: Frage in Task-Datei dokumentieren, NICHT raten.

## Schritt 9: Status

Sag dem User: "✅ Task T<ID> gestartet. Branch <branch-name> aktiv. Was möchtest du als nächstes? (a) Implementation jetzt starten, (b) erst Spec mit dir durchgehen, (c) abbrechen und zurück nach _backlog"
