# T002 — M14 Notfall-Login (Email + Argon2id + TOTP)

> **Owner:** Steve
> **Geschätzt:** 2 Tage
> **Priorität:** P0 (Pilot-Blocker — GF muss immer reinkommen)
> **Dependencies:** T011 Migrations-Audit
> **Welle:** 1
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md` Sektion „Notfall-Login"

---

## Ziel

Backup-Login wenn Discord-OAuth ausfällt. **Nur für Geschäftsführer-Accounts** (nicht für Mitarbeiter). Email + Argon2id-Passwort + TOTP-2FA-Pflicht.

---

## Akzeptanz-Kriterien

- [ ] DB-Spalten `users.email`, `users.password_hash`, `users.totp_secret`, `users.role` aus T011 migriert
- [ ] Argon2id-Library (`argon2` npm) eingebunden, Parameters: m=64MB, t=3, p=4
- [ ] Backend-Endpoint `POST /auth/notfall/login` — Body: `{email, password, totp_code}`
- [ ] Drei-Faktor-Check: Email existiert + Passwort matched (Argon2id-verify) + TOTP-Code valide
- [ ] TOTP-Library `otpauth` oder `speakeasy`, 6-stellig, 30s-Fenster
- [ ] Rate-Limiting: max 5 Versuche / 15 Min pro Email-Adresse
- [ ] Erfolgreicher Login → JWT-Issue (gleiches Format wie T001)
- [ ] Nur Role `gf` darf Notfall-Login nutzen — Mitarbeiter-Accounts werden abgelehnt
- [ ] Audit-Log-Eintrag bei jedem Versuch (Erfolg + Fehlversuch)
- [ ] Unit-Tests für Argon2id-Verify + TOTP-Check
- [ ] Integration-Test mit echtem TOTP-Secret

## Claude-Code-Start-Prompt

```
Lies M14_User_Verwaltung_Auth.md Sektion Notfall-Login. Implementiere
T002 Backend-Service mit argon2 + speakeasy. Endpoint POST /auth/notfall/login.
Audit-Log via existierendes Logger-Modul. Tests in __tests__/auth/notfall.test.ts.
Branch: steve/T002-notfall-login
```

## Sicherheits-Anker
- Passwort-Hash NIEMALS im Response zurückgeben
- TOTP-Secret im Setup-Prozess (separate Task später) als QR-Code anzeigen, danach Klartext NIE wieder zugänglich
- Rate-Limiting auf IP UND Email (beide Achsen)
