---
name: ProzessPilot Infra Directory Structure
description: Where infra scripts, load tests, runbooks, and operational files live
type: project
---

The operational infrastructure lives at `/Users/donandrejo/Documents/ProzessPilot/prozesspilot/infra/` (NOT at the top-level `/Users/donandrejo/Documents/ProzessPilot/infra/` which does not exist).

Current subdirectories:
- `infra/backup/` — backup scripts
- `infra/security/` — security-related scripts
- `infra/load-tests/` — k6 load test suite (created 2026-05-01)
- `infra/runbook/` — operational runbook docs (created 2026-05-01)

**Why:** The project monorepo root is at `prozesspilot/` and all operational tooling lives inside it. The parent folder `/Users/donandrejo/Documents/ProzessPilot/` contains only source files, docs, and the monorepo root.

**How to apply:** Always write new infra files under `/Users/donandrejo/Documents/ProzessPilot/prozesspilot/infra/`, not the parent directory.
