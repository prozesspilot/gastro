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

- [ ] Discord-OAuth-App in Discord Developer Portal registriert (Redirect-URI: `https://admin.prozesspilot.net/auth/discord/callback`)
- [ ] `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` als GitHub-Secret + lokal als `.env`-Variablen
- [ ] Backend-Endpoint `GET /auth/discord/login` → Redirect zu Discord-OAuth
- [ ] Backend-Endpoint `GET /auth/discord/callback` → Code-Tausch + User-Info-Fetch + JWT-Issue
- [ ] JWT-Payload enthält: `user_id`, `tenant_id`, `discord_id`, `role`, `exp`
- [ ] JWT-Signing mit `JWT_SECRET` (256-bit, in GitHub-Secrets)
- [ ] User wird in DB angelegt falls nicht existent (Tabelle `users` aus M14-Schema)
- [ ] Discord-Rolle wird zu interner Rolle gemappt (`gf` / `mitarbeiter`)
- [ ] Unit-Tests für Token-Exchange-Logic
- [ ] Integration-Test gegen Discord-OAuth-Mock

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
