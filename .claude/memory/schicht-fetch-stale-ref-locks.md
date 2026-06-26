---
name: schicht-fetch-stale-ref-locks
description: "/schicht-Pull bricht mit \"cannot lock ref ... .lock File exists\" ab — stale ref-Locks löschen, MCP-github-Prozesse sind keine echten git-Locks"
metadata: 
  node_type: memory
  type: project
  originSessionId: 47bb85c3-753e-4cff-b926-511deb2d29ec
---

Beim `/schicht`-Pull kann `git fetch origin --prune` mit `cannot lock ref 'refs/remotes/origin/…': Unable to create '….lock': File exists. Another git process seems to be running` abbrechen. Folge: Die `&&`-Kette im `/schicht`-Befehl stoppt am fetch — **`main` wird dann NICHT gepullt** (man landet scheinbar erfolgreich zurück auf dem Ausgangs-Branch, aber ohne den eigentlichen Pull).

**Ursache:** stale 0-Byte `.lock`-Dateien unter `.git/refs/remotes/origin/…` aus einem früher abgebrochenen fetch/prune (oft viele auf einmal, z. B. nach massenhaft gelöschten `_done`-Remote-Branches).

**Falsche Fährte:** `pgrep -fl git` zeigt laufende `git`-Prozesse — das sind aber meist nur die **MCP-github-Server** (`npm exec @modelcontextprotocol/server-github` / `mcp-server-github`). Die locken das lokale Repo **nicht**. Prüfen: gibt es einen echten `git fetch`/`git`-Prozess auf DIESEM Repo? Wenn nein → Locks sind stale.

**Fix (sicher, wenn kein echter git-Befehl läuft):**
```
find .git/refs -name '*.lock' -print -delete
```
danach `git fetch`/`git pull` erneut. Nie `reset --hard`/`--force` deswegen.

Verwandt: [[git-push-via-gh-https]].
