# Design-Entscheidungen — ProzessPilot Webapp

## D1 — Designsystem-Auswahl (2026-05-04)

### Entscheidung: Bestehende CSS-Variablen beibehalten + schrittweise Tailwind-Integration

**Status:** ADR-001, angenommen

### Ausgangslage

Die Webapp nutzt ein eigenes "Ultra Design System" aus `src/index.css` mit:
- CSS Custom Properties (Design Tokens: --bg, --surface, --border, ...)
- Dark-mode-first (schwarzes Theme, #060910 Hintergrund)
- Vorgefertigte Komponent-Klassen: `.card`, `.badge`, `.btn`, `.modal`, ...
- Inter-Font von Google Fonts

### Optionen

| Option | Pro | Con |
|--------|-----|-----|
| **Tailwind 4 + shadcn/ui** (ursprüngliche Empfehlung) | Standardisiert, viele Komponenten out-of-the-box | Große Breaking-Migration aller 15 Pages, neuer Build-Step, Vendor-Lock-in |
| **Bestehendes CSS beibehalten** | Kein Migrations-Risiko, läuft schon | Kein externe Komponent-Library |
| **Tailwind 4 als Utility-Layer hinzufügen** | Zukunftssicher, schrittweise | Konflikte mit bestehenden Klassen möglich |

### Entscheidung

**Bestehendes Custom CSS als Designsystem beibehalten** mit folgender Begründung:

1. **Funktioniert bereits** — 15 Pages sind vollständig implementiert, Dark Mode ist durchgängig.
2. **Migration ist kontraproduktiv** — Tailwind 4 + shadcn/ui würde alle 15 Pages umschreiben erfordern (> 3000 LOC), ohne funktionalen Mehrwert für den aktuellen Produktstand.
3. **Build-Green-Prio** — Der kritische Pfad ist Backend-Completeness, Tests und Produktions-Stabilität — nicht das Styling-Framework.
4. **Shadcn/UI ist additive Migration** — Kann in Phase 3 für neue Komponenten (Tables, Combobox, Date Picker) ergänzt werden, ohne alten Code zu berühren.

### Akzeptanzkriterien für dieses Designsystem

- [x] Dark Mode durchgängig (via CSS Variables)
- [x] Konsistente Spacing- und Radius-Werte
- [x] StatusBadge, ConfirmModal, EmptyState, ErrorBoundary, Skeleton als Komponenten
- [x] Loading-States (Skeleton) in kritischen Pages
- [ ] Accessibility: keyboard-bedienbar, sr-only-Labels (Phase 2)
- [ ] i18n-Vorbereitung (Phase 3)

### Tailwind-Plan für Phase 3

```
Phase 3:
1. Tailwind 4 installieren mit CSS @layer import (kein Konflikt mit bestehendem CSS)
2. Shadcn/ui für neue Komponenten: DataTable, DateRangePicker, Combobox
3. Neue Pages (falls nötig) in Tailwind schreiben
4. Schrittweise Migration bestehender Pages (1 pro Sprint)
```

---

## D2 — Auth-Flow (2026-05-04)

**Entscheidung:** SessionStorage + einfacher Tenant-Select-Login

**Begründung:**
- HMAC-Auth liegt server-seitig (n8n ↔ Backend) — Webapp braucht keinen echten Token
- SessionStorage: XSS-sicherer als localStorage, Session-Lebensdauer = Tab-Lebensdauer
- Passwort-Prüfung + JWT-Flow kommt in Phase 3 (wenn echter Multi-User-Betrieb)
- Dev-Bypass via `PP_AUTH_DISABLED=1` am Backend macht lokale Entwicklung einfach

---

## D3 — Mail-Provider (Placeholder)

**Entscheidung ausstehend** — wird in Phase 2 getroffen wenn M08 (Monatsreporting) live geht.
Kandidaten: Brevo (Sendinblue), Resend, Nodemailer+SMTP.
Empfehlung: **Resend** (einfache API, gute TypeScript-Types, 100 E-Mails/Tag kostenlos).

---

## D4 — PDF-Engine (Placeholder)

**Entscheidung ausstehend** — wird bei M08-Implementierung getroffen.
Kandidaten: Puppeteer (HTML→PDF), pdfkit (programmatisch).
Empfehlung: **Puppeteer** (HTML-basiertes Layout = einfacher zu stylen, gleiche Template-Engine wie Webapp).
