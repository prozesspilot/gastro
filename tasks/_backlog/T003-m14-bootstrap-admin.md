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

- [ ] Skript `backend/scripts/bootstrap-admin.ts` läuft via `npm run bootstrap-admin`
- [ ] Prompt-basierter Input: Email, Klartext-Passwort (wird sofort gehasht), Tenant-Slug
- [ ] Anlegt: Tenant-Row, User-Row mit role=`gf`, generiert TOTP-Secret + QR-Code in Terminal
- [ ] Idempotent: bei zweiter Ausführung mit gleicher Email — Fehlermeldung „User existiert"
- [ ] Klartext-Passwort wird NICHT geloggt oder in DB gespeichert (nur Argon2id-Hash)
- [ ] Output: JWT für sofortigen Test-Login + Hinweis „TOTP-Secret in 1Password speichern!"
- [ ] Skript läuft NUR wenn Tabelle `users` leer ist ODER `--force`-Flag gesetzt
- [ ] Dokumentation in `backend/scripts/README.md`

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
