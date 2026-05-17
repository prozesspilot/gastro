---
name: Dual-Auth HMAC Middleware
description: Login-loop root cause, dual-auth fix, and password_must_change correction — 2026-05-12
type: project
---

Implemented Dual-Auth in `backend/src/core/auth/hmac.middleware.ts` to fix a login-loop caused by the HMAC-only middleware blocking Webapp Bearer tokens.

**Root Cause:** HMAC middleware protected ALL `/api/v1/*` routes. The webapp's JWT Bearer tokens were ignored, causing 401 → parallel refresh attempts → replay detection → full token family revoke → redirect to /login.

**Fix:** Bearer-first auth logic in `hmacMiddleware`:
- If `Authorization: Bearer <token>` present and valid → set `req.authUser`, skip HMAC (Webapp path)
- If Bearer present but invalid/expired → 401, NO HMAC fallback (security: prevents bypass attempts)
- If no Bearer header → fall through to HMAC (n8n service-to-service path)

**Secondary Fix:** `bootstrap.ts:72` `passwordMustChange: false` → `true` (Spec §6.4: owner must change password on first login).

**DB Ops done 2026-05-12:**
- `UPDATE users SET password_must_change = TRUE WHERE email = 's.andreas-k@hotmail.de'` → 1 row
- `UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = 'manual_cleanup_dual_auth_migration' WHERE revoked_at IS NULL` → 2 rows (column is `revoke_reason`, NOT `revoked_reason`)

**Why:** Login-loop was caused by incompatible auth mechanisms. M14 spec §5.6 explicitly describes dual-auth as the solution.

**How to apply:** Any future middleware touching auth must respect the Bearer-first, HMAC-fallback pattern. Note the `refresh_tokens` column name is `revoke_reason` (no 'd').
