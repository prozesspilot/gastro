---
name: Parallel Agent Context
description: Linter and other agents modify app.ts and webapp files autonomously — always re-read before editing
type: project
---

The ProzessPilot project has an active linter/formatter that automatically modifies files after edits. Key patterns observed:

- `backend/src/app.ts` gets new imports added by linter/other agents (e.g., `pluginSystemRoutes`, `dsgvoRoutes`, `rateLimit from @fastify/rate-limit`)
- `webapp/src/App.tsx` gets new page imports added automatically (e.g., `PluginsPage`)
- `webapp/src/components/Layout.tsx` gets new nav items added (e.g., `/plugins` nav item)

**Why:** There are likely other autonomous agents or linters running alongside that implement new modules.

**How to apply:** Always read the current file state before editing. Use Edit (not Write) for modifications to avoid clobbering parallel changes. When app.ts shows new imports you didn't add, check if the referenced modules exist before building.

Modules added by parallel agents (found in backend/src/modules/):
- `plugin-system/` — Plugin-System routes
- `dsgvo/` — DSGVO-Compliance routes
- Webapp: `PluginsPage.tsx` with `plugins.ts` API client

These modules were already present and working when building M06-advisor-portal and M09-supplier-comm.
