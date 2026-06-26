---
name: review-merge-flow-solo
description: In der 2-Personen-Realität macht Steve Tasks UND Reviews; PRs werden per Admin-Override gemergt (Self-Approval von GitHub blockiert)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9dad7ad0-0b6a-43a0-9a23-ca3262a982f2
---

Steve übernimmt in der aktuellen 2-Personen-Realität sowohl die Task-Umsetzung als auch die Reviews ("ich mache die tasks und die reviews", 2026-06-14). Branch-Protection auf `main` verlangt **1 Approval** (`reviewDecision: REVIEW_REQUIRED`), aber `enforce_admins: false` → der Owner-Account kann per `gh pr merge --admin` überschreiben. GitHub blockiert das Self-Approval des Author-Accounts, daher gibt es real kein zweites menschliches Approval.

**Why:** Warten auf ein fremdes Approval blockiert den Flow und führt zum wiederkehrenden "Drift"-Problem (CLAUDE.md §3.7) — lieber zügig durchziehen als liegen lassen.

**How to apply:** Standard-Pfad pro Task = `/start-task` → implementieren (Tor: build+test+smoke grün) → PR → `code-reviewer`-Agent als objektiver Review (Findings adressieren) → bei grüner CI **Squash-Merge per `--admin`** (mit Steves expliziter Bestätigung) → Branch löschen → T0xx-Datei per Mini-PR nach `_done` (auch `--admin`, siehe [[task-done-move-manual]]). Den Admin-Override NICHT eigenmächtig ohne Steves Bestätigung ziehen — aber wenn er "merge jetzt" sagt, ist es autorisiert. Discord-Pings entfallen lokal (`$DISCORD_DEV_WEBHOOK_URL` nicht gesetzt).
