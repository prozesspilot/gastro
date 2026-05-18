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

- [ ] SumUp-Developer-Account angelegt (`developer.sumup.com`) — App registriert
- [ ] `SUMUP_CLIENT_ID` + `SUMUP_CLIENT_SECRET` als GitHub-Secret + lokal .env
- [ ] DB-Tabelle `kasse_integrations` mit Spalten: `tenant_id`, `provider` (`sumup`), `access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, `scope`
- [ ] Verschlüsselung mit AES-256-GCM, Master-Key in `KASSE_TOKEN_KEY`-Secret
- [ ] Backend-Endpoint `GET /integrations/sumup/connect` → Redirect zu SumUp-OAuth
- [ ] Callback-Endpoint `GET /integrations/sumup/callback` → Token-Tausch + verschlüsselt speichern
- [ ] Backend-Endpoint `POST /integrations/sumup/disconnect` → Tokens löschen
- [ ] Helper `getSumUpAccessToken(tenant_id)` — auto-refresh wenn `expires_at < now + 5min`
- [ ] Audit-Log für Connect/Disconnect/Token-Refresh
- [ ] Unit-Tests für Token-Refresh-Logic + Encryption
- [ ] Integration-Test gegen SumUp-Sandbox

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
