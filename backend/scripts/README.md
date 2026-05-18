# Backend-Skripte

Sammlung von CLI-Tools für Bootstrapping, Wartung und Migration.

## `bootstrap-admin.ts` — Erster Geschäftsführer (T003)

Löst das Henne-Ei-Problem nach einer frischen Installation: ohne User in der DB kann sich keiner einloggen. Dieses Skript legt den ersten `geschaeftsfuehrer`-Account direkt in die DB an, inklusive Notfall-Email, Argon2id-Passwort, TOTP-Secret und 10 Backup-Codes.

### Voraussetzung

- DB-Migrationen wurden ausgeführt (`npm run migrate`)
- `users`-Tabelle ist leer (oder `--force` wird verwendet)
- `DATABASE_URL` in `.env` gesetzt

### Aufruf

```bash
# Normaler Fall (nur wenn users-Tabelle leer):
npm run bootstrap-admin

# Zweiten Geschäftsführer anlegen (Andreas nach Steve):
npm run bootstrap-admin -- --force
```

### Was wird abgefragt

1. **Discord-Username** (optional) — fürs spätere Zuordnen bei erstem Discord-OAuth-Login
2. **Display-Name** (Pflicht) — wird in der Webapp angezeigt
3. **Notfall-Email** (Pflicht) — separate Mail empfohlen, nicht die Discord-Mail
4. **Notfall-Passwort** (Pflicht) — mindestens 16 Zeichen, mit Groß-/Klein-/Zahl/Sonderzeichen

### Was wird generiert

- **TOTP-Secret** (Base32, 160 Bit Entropie) — in DB gespeichert, als QR-Code + URL im Terminal
- **10 Backup-Codes** (12 Zeichen alphanumerisch, ohne Verwechsler-Zeichen) — Klartext **nur einmal** angezeigt, Argon2id-Hashes in DB

### Sicherheits-Hinweise

⚠ Nach erfolgreichem Bootstrap:

1. **TOTP-Secret + alle 10 Backup-Codes** sofort in 1Password (oder anderem Password-Manager) speichern
2. Backup-Codes werden NIE wieder im Klartext angezeigt — die DB hat nur Argon2id-Hashes
3. Klartext-Passwort wird NIE geloggt oder gespeichert

### Verifikation

Nach Bootstrap sollte der Notfall-Login funktionieren:

```bash
curl -X POST http://localhost:3000/api/v1/auth/notfall/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "steve@prozesspilot.net",
    "password": "<dein-passwort>",
    "totp_code": "<6-stelliger-Code-aus-Authenticator-App>"
  }'
```

Erfolg: Response `200` mit `{ ok: true, display_name, role: "geschaeftsfuehrer" }` und gesetzter `pp_auth`-Cookie (4h Lebensdauer).

### Spec-Referenz

`Modulkonzept/Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md` §3.4 (Bootstrapping) + §5 (Notfall-Login)

---

## `setup-app-role.sql` — Postgres-Role für gastro_app

Erstellt die `gastro_app` Datenbank-Rolle mit eingeschränkten Rechten (für den laufenden Backend-Server). Wird beim Initial-DB-Setup einmalig ausgeführt.

```bash
psql $DATABASE_URL -f scripts/setup-app-role.sql
```
