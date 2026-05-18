# T004 — M15 SumUp OAuth-Flow + Token-Storage

> **Owner:** Steve
> **Geschätzt:** 1,5 Tage
> **Priorität:** P0 (Almaz nutzt SumUp Lite als Hauptkasse)
> **Dependencies:** T011 Migrations-Audit
> **Welle:** 1
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M15_Kassensystem_Connector.md` Sektion „SumUp-Adapter"

---

## Ziel

Wirt verbindet seinen SumUp-Account via OAuth mit ProzessPilot. Access-Token + Refresh-Token werden verschlüsselt in DB gespeichert, automatisches Token-Refresh wenn abgelaufen.

---

## Akzeptanz-Kriterien

- [ ] **SumUp-Developer-Account angelegt** (`developer.sumup.com`) — App registriert (**Steve manuell**, kein Code)
- [ ] **`SUMUP_CLIENT_ID` + `SUMUP_CLIENT_SECRET` als GitHub-Secret + lokal .env** (Steve manuell)
- [x] DB-Tabelle `pos_credentials` mit Spalten: `tenant_id`, `pos_system`, `pos_account_id`, `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at`, `scopes` — Spec-konform (M15 §3.1 nutzt `pos_credentials`, nicht `kasse_integrations` aus alter Task)
- [x] Verschlüsselung mit **pgcrypto `pgp_sym_encrypt`** (M15-Spec-konform, nicht AES-256-GCM aus alter Task) — analog Discord-Token-Pattern (T001) und TOTP-Secret (T003)
- [x] Backend-Endpoint `GET /m15/oauth/sumup/start` → Redirect zu SumUp-OAuth (M14-staff-auth, CSRF-State in Redis)
- [x] Callback-Endpoint `GET /m15/oauth/sumup/callback` → Token-Tausch + pgcrypto-verschlüsseltes Speichern
- [x] Backend-Endpoint `POST /m15/sumup/disconnect/:tenantId` → active=false (kein DELETE, Audit-Trail bleibt)
- [x] Helper `getSumUpAccessToken(pool, tenantId)` — auto-refresh wenn `token_expires_at < now + 5min`, markiert inactive bei Refresh-Fail
- [x] Audit-Log für Connect (`pos_connected`), Disconnect (`pos_disconnected`), Token-Refresh-Fail (`pos_token_refresh_failed`)
- [x] Unit-Tests für Token-Refresh-Logic + Encryption (25 neue Tests, gemockter fetch + Pool + Redis)
- [ ] Integration-Test gegen SumUp-Sandbox (**später** — braucht echte Sandbox-Credentials; in T004 nicht möglich. Stattdessen: 25 Unit-Tests mit gemocktem fetch decken alle Flows ab)

### Spec-Konflikt-Lösungen

Die Task-Datei war Pre-Reboot — folge M15-Spec (latest):
- Tabelle: `pos_credentials` statt `kasse_integrations`
- Encryption: pgcrypto statt AES-256-GCM (konsistent mit Discord-Token + TOTP)
- Endpoint-Prefix: `/api/v1/m15/oauth/sumup/*` statt `/integrations/sumup/*`
- Migration-Nr.: 022 (nächste freie) statt 040 (von M15-Spec angedacht)

## Claude-Code-Start-Prompt

```
Lies M15_Kassensystem_Connector.md. Implementiere T004 SumUp-OAuth + Token-Storage.
Tabelle kasse_integrations via Migration. AES-256-GCM aus node:crypto.
SumUp-OAuth-Doku: developer.sumup.com/docs/authentication
Endpoints unter /integrations/sumup/*.
Branch: steve/T004-sumup-oauth
```

## Rollback-Plan
Wenn SumUp-API instabil: Almaz kann Kassenzeilen weiterhin manuell als CSV exportieren und in die Webapp hochladen (T006 Beleg-Upload-Endpoint handhabt das).
