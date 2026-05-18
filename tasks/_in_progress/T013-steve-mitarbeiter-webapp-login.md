# T013 — Mitarbeiter-Webapp Login-Screen

> **Owner:** Steve
> **Geschätzt:** 1 Tag
> **Priorität:** P0 (UI ohne Login = unbenutzbar)
> **Dependencies:** T001 Discord-OAuth + T002 Notfall-Login
> **Welle:** 2
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/Web_Chat_Widget.md` (Style-Guide) + `M14_User_Verwaltung_Auth.md`

---

## Ziel

Frontend-Komponente die Discord-Login-Button + Notfall-Login-Formular anzeigt. Auf erfolgreichen Login: JWT in HttpOnly-Cookie + Redirect zu `/dashboard`.

---

## Akzeptanz-Kriterien

- [x] Route `/login` in Mitarbeiter-Webapp (React + Vite)
- [x] Hauptbutton: „Mit Discord anmelden" → Link zu `/api/v1/auth/discord/login` (Backend-Redirect)
- [x] Sekundär unten: „Notfall-Login (nur für Geschäftsführer)" → expandiert Formular
- [x] Notfall-Formular: Email + Passwort + TOTP-Code + Backup-Code-Toggle
- [x] Submit → `POST /api/v1/auth/notfall/login` → bei Erfolg Cookie gesetzt + Redirect zu /
- [x] Fehlermeldungen: „Zugangsdaten ungültig", „TOTP-Code ungültig", „Zu viele Versuche"
- [x] Loading-State während Auth-Request (Spinner + deaktivierter Button)
- [x] Mobile-responsive (maxWidth: 440px, 24px padding)
- [x] ProzessPilot-Branding (🧭 Logo, CSS-Variablen aus index.css, Discord-Lila #5865F2)
- [x] Komponenten-Tests mit Testing Library (10 Tests)

## Claude-Code-Start-Prompt

```
Implementiere T013 Login-Screen in webapp/. Erst checken welches Framework
(React+Vite oder Next.js). Route /login mit Login-Component.
HTTP-Calls zu Backend via fetch oder axios. JWT-Handling via Cookie (HttpOnly,
SameSite=Strict, Secure in prod).
Style: minimal, klar, vertrauensvoll. ProzessPilot-Branding aus Style-Guide.
Branch: steve/T013-login-screen
```

## Hinweis für Owner (Steve)
Claude Code baut die Komponente. Du beschreibst nur:
1. Wie es aussehen soll (Wireframe oder „so wie X")
2. Welches Verhalten (was passiert bei Klick)
3. Welche Fehlermeldungen
Den eigentlichen Code schreibt Claude Code, du reviewst.
