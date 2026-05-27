# T035 — `invoices` + Auto-Rechnungs-Generator

> **Owner:** Andreas (Backend/Infra)
> **Priorität:** P2 (Post-Pilot — Phase 2, lt. Webapp §10.3)
> **Dependencies:** keine (eigenständig); liefert Datenbasis für T036
> **Welle:** 8
> **Spec-Referenzen:** `Mitarbeiter_Webapp.md` §6 (Auto-Rechnungs-Generator §6.1, Tabelle `invoices` §6.2, Stripe-Migration §6.3)
> **Audit:** REPORT-2026-05-26 F04 · **Blockt:** T036 (Provisions-Übersicht braucht Rechnungsdaten)

---

## Ziel

Auto-Rechnungs-Generator gemäß §6: monatliche Rechnungen pro Tenant (Paket-Preis + Setup-Fee), Tabelle `invoices`. Stripe-Migration erst ab ~25 Tenants (§6.3) — für Pilot reicht die interne Generierung.

---

## Akzeptanz-Kriterien

- [ ] Migration `invoices`-Tabelle gemäß §6.2 (tenant_id, Zeitraum, Positionen, Betrag, Status, …) + RLS.
- [ ] Generator (Cron, monatlich) erzeugt Rechnungen aus Tenant-Paket + Setup-Fee gemäß Pricing (CLAUDE.md §1: Solo/Standard/Pro/Filiale + Setup-Fee).
- [ ] Idempotenz: pro Tenant + Monat genau eine Rechnung.
- [ ] Noch **kein** Stripe (erst ab ~25 Tenants, §6.3) — interne Erzeugung + Export/PDF-Stub.
- [ ] Tests (Generierung, Idempotenz, Beträge); CI grün.

---

## Hinweise

- Pricing-Werte aus CLAUDE.md §1 / `00_Strategie_Gastro.md`.
- Post-Pilot — nicht KW22-blockierend.
