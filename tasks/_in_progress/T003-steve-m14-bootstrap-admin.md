# T003 — M14 Bootstrap-Admin-Skript

> **Owner:** Steve
> **Geschätzt:** 0,5 Tage
> **Priorität:** P0 (ohne ersten Admin kein Login möglich)
> **Dependencies:** T001 ODER T002 fertig (mindestens eine Login-Methode)
> **Welle:** 2
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md` Sektion „Initial-Setup"

---

## Ziel

CLI-Skript das den ersten Geschäftsführer-Account in der DB anlegt, damit überhaupt jemand reinkommt. Henne-Ei-Problem lösen.

---

## Akzeptanz-Kriterien

- [x] Skript `backend/scripts/bootstrap-admin.ts` läuft via `npm run bootstrap-admin`
- [x] Prompt-basierter Input: Discord-Username, Display-Name, Notfall-Email, Notfall-Passwort (Argon2id-gehasht)
- [x] Anlegt: User-Row mit role=`geschaeftsfuehrer` (post-Reboot: KEIN Tenant für GF), generiert TOTP-Secret + QR-Code im Terminal
- [x] Idempotent: bricht ab wenn Email existiert (CITEXT-Duplikat-Check) ODER wenn User > 0 ohne `--force`
- [x] Klartext-Passwort wird NICHT geloggt oder in DB gespeichert (nur Argon2id-Hash)
- [x] Output: Hinweis „TOTP-Secret + Backup-Codes in 1Password speichern" + Verifikations-Anleitung via `/api/v1/auth/notfall/login` (neuer Cookie-Flow, kein direkter JWT)
- [x] Skript läuft NUR wenn Tabelle `users` leer ist ODER `--force`-Flag gesetzt
- [x] Dokumentation in `backend/scripts/README.md`
- [x] Bonus: 10 Backup-Codes (12 Zeichen, ohne Verwechsler) Argon2id-gehasht in DB
- [x] Bonus: 13 Unit-Tests für validatePassword + generateBackupCode + EMAIL_REGEX

## Claude-Code-Start-Prompt

```
Implementiere T003 Bootstrap-Admin-Skript. Nutze inquirer für CLI-Prompts.
Argon2id für Passwort-Hash, qrcode-terminal für TOTP-QR-Anzeige.
Skript anlegen unter backend/scripts/bootstrap-admin.ts.
npm-Script in backend/package.json registrieren.
Branch: steve/T003-bootstrap-admin
```

## Verifikation

```bash
cd backend
npm run bootstrap-admin
# Eingaben: steve@prozesspilot.net, Test123456, prozesspilot
# Erwartet: User angelegt + TOTP-QR im Terminal + JWT für 1h Gültigkeit
```
