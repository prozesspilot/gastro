# T016 — Onboarding-Wizard Step 1-3 Skeleton

> **Owner:** Steve
> **Geschätzt:** 2 Tage
> **Priorität:** P2 (kann nach KW22-Pilot kommen, gehört zu P1.2)
> **Dependencies:** T001 + T002 + T004 (Discord-OAuth, Notfall-Login, SumUp-OAuth)
> **Welle:** 4
> **Spec-Referenzen:** `Modulkonzept/Konzeptentwicklung/Web_Chat_Widget.md` + Wizard-Spec im Roadmap

---

## Ziel

Self-Service-Onboarding für neue Wirte. Wizard mit 3 Schritten:
1. Account anlegen (Email + Passwort + TOTP-Setup)
2. Tenant-Stammdaten (Firmenname, Adresse, USt-ID, Branche)
3. SumUp-Verbindung (OAuth-Redirect)

Nach Step 3: Wirt landet im Dashboard und kann Mitarbeiter einladen.

---

## Akzeptanz-Kriterien

- [ ] Separate Webapp unter `setup.prozesspilot.net` (nicht admin.prozesspilot.net)
- [ ] Route-Sequenz: `/`, `/step-1-account`, `/step-2-tenant`, `/step-3-kasse`, `/done`
- [ ] Step 1: Email + Passwort + Passwort-Bestätigung + TOTP-QR-Code anzeigen + TOTP-Eingabe zur Bestätigung
- [ ] Step 2: Firmenname, Adresse-Felder, USt-ID, Branche (Dropdown), Mitarbeiteranzahl
- [ ] Step 3: „Mit SumUp verbinden"-Button → Redirect zu SumUp-OAuth, Callback bringt User zu `/done`
- [ ] „Überspringen"-Option auf Step 3 (Wirt kann SumUp später verbinden)
- [ ] Progress-Indikator oben: „Schritt 2 von 3"
- [ ] Validierung pro Step (kein Fortschritt bei Fehler)
- [ ] State-Persistenz: Bei Refresh nicht alles verloren (Local Storage oder Backend-Session)
- [ ] „Zurück"-Button auf Step 2/3 (Step 1 nicht, weil Account-Anlegen committed)
- [ ] Mobile-responsive
- [ ] Welcome-Email nach Step 1 (Bestätigung Email-Adresse)

## Claude-Code-Start-Prompt

```
Implementiere T016 Onboarding-Wizard auf setup.prozesspilot.net.
Eigene Webapp-Instanz oder Sub-Route — checken was im Repo schon existiert.
3 Steps mit Multi-Step-Form-Pattern. State in Zustand-Store oder Form-Library.
TOTP-QR via qrcode-Library, OTP-Verify via /auth/totp/verify-Endpoint.
Branch: steve/T016-onboarding-wizard-skeleton
```

## Hinweis für Owner (Steve)
Wird für P1.2 gebraucht (Self-Service), nicht für Almaz-Pilot. Almaz wird manuell via Bootstrap-Admin-Skript (T003) angelegt. Kann also nach KW22 kommen — nicht stressen.
