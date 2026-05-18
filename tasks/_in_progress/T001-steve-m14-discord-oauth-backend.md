# T001 — M14 Discord-OAuth-Backend

> **Owner:** Steve
> **Geschätzt:** 2 Tage
> **Priorität:** P0 (Pilot-Blocker)
> **Dependencies:** T011 Migrations-Audit muss vorher durch sein
> **Welle:** 1
> **Spec-Referenzen:**
> - `Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md`
> - `Modulkonzept/Konzeptentwicklung/Discord_Integration.md` Sektion „OAuth + Bot getrennt"

---

## Ziel

Backend-Service der Mitarbeiter via Discord OAuth 2.0 einloggt. Bei erfolgreichem OAuth-Callback wird ein JWT ausgestellt das die Mitarbeiter-Webapp authentifiziert.

---

## Akzeptanz-Kriterien

- [x] Discord-OAuth-App in Discord Developer Portal registriert (Redirect-URI: `https://admin.prozesspilot.net/auth/discord/callback`)
- [x] `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` + `DISCORD_GUILD_ID` + `DISCORD_BOT_TOKEN` lokal als `.env`-Variablen (GitHub-Secrets: manuell eintragen)
- [x] Backend-Endpoint `GET /auth/discord/login` → Redirect zu Discord-OAuth
- [x] Backend-Endpoint `GET /auth/discord/callback` → Code-Tausch + User-Info-Fetch + JWT-Issue
- [x] JWT-Payload enthält: `sub` (user_id), `discord_id`, `role`, `display_name`, `exp` (tenant_id entfällt — Mitarbeiter sind cross-tenant per M14-Spec)
- [x] JWT-Signing mit `JWT_SECRET` (aus `.env`, Production-Check in config.ts)
- [x] User wird in DB angelegt falls nicht existent (Tabelle `users` aus T011-Schema)
- [x] Discord-Rolle wird zu interner Rolle gemappt (`geschaeftsfuehrer` / `mitarbeiter`)
- [x] Unit-Tests für Token-Exchange-Logic (verifyM14Token, signM14Token)
- [x] Integration-Test gegen Discord-OAuth-Mock (21 Tests total)

## Claude-Code-Start-Prompt

```
Lies M14_User_Verwaltung_Auth.md komplett, dann implementiere T001
Discord-OAuth-Backend im backend/ Modul. Verwende passport-discord oder eigene
OAuth-Library. Endpoints unter /auth/discord/*. JWT mit jsonwebtoken-Library.
Schreibe Tests in __tests__/auth/discord-oauth.test.ts.
Branch: steve/T001-discord-oauth-backend
```

## Rollback-Plan
Wenn Discord-OAuth nicht klappt: Notfall-Login (T002) reicht für GF-Zugang während Pilot. Discord-OAuth kann post-pilot kommen.
