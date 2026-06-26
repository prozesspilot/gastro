---
name: task-done-move-manual
description: Task-Datei wandert beim PR-Merge NICHT automatisch nach _done — manuell per Mini-PR
metadata: 
  node_type: memory
  type: project
  originSessionId: ca365d61-d5fb-461d-872a-30af4790f323
---

Die Skills `/finish-task` + `/review-pr` und `WORKFLOW_DAILY.md` behaupten, die Task-Datei werde beim Merge „via merge-Webhook" von `_in_progress/` nach `_done/` verschoben. **Das stimmt nicht** — `.github/workflows/task-tracker.yml` macht nur Status-Tracking/Notification, **verschiebt die Datei nicht** (verifiziert nach Merge PR #109/T046, 2026-06-13).

**Folge:** Nach jedem gemergten Task-PR bleibt die Task-Datei in `_in_progress/` liegen. Sie muss **manuell** nach `_done/` verschoben werden. Da `main` branch-protected ist (kein Direkt-Push), läuft das über einen **Mini-PR** (`git mv` → PR → Merge). Für eine reine `.md`-Verschiebung ist `gh pr merge --squash --admin --delete-branch` ohne CI-Warten vertretbar (kein Code betroffen).

**Why:** Sonst sammeln sich „fertige" Tasks scheinbar offen in `_in_progress/`. **How to apply:** _done-Verschiebung als festen letzten Schritt nach jedem Task-Merge einplanen. Verwandt: [[git-push-via-gh-https]].
