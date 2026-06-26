---
name: git-push-via-gh-https
description: origin ist auf HTTPS umgestellt (gh-Credential-Helper); git push/pull funktionieren direkt
metadata: 
  node_type: memory
  type: project
  originSessionId: ca365d61-d5fb-461d-872a-30af4790f323
---

`origin` wurde am 2026-06-06 dauerhaft von SSH (`git@github.com:prozesspilot/gastro.git`) auf **HTTPS** (`https://github.com/prozesspilot/gastro.git`) umgestellt, plus `gh auth setup-git` als Credential-Helper. `main` trackt `origin/main`.

**Folge:** `git push`, `git pull`, `git fetch` funktionieren jetzt **direkt** (Auth über den gh-Token des Accounts `prozesspilot`). Kein expliziter HTTPS-URL-Umweg mehr nötig.

**Warnung:** Der SSH-Key ist in dieser Umgebung NICHT verfügbar — falls `origin` je wieder auf `git@github.com:...` (SSH) gesetzt wird, scheitern Push/Fetch mit `Permission denied (publickey)`. Dann erneut auf HTTPS umstellen (`git remote set-url origin https://github.com/prozesspilot/gastro.git`).

**Why:** SSH-Auth war hier blockiert; HTTPS+gh-Token ist der stabile Weg.
**How to apply:** Normal `git push`/`git pull` nutzen. Verwandt: [[prod-env-change-recreate]] (SSH-root am IONOS-Server ebenfalls geblockt).
