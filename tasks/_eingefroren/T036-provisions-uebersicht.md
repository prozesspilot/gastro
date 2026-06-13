# T036 — Provisions-Übersicht (Vertriebsagentur, nur Geschäftsführer)

> **Owner:** Steve (Frontend/Webapp)
> **Priorität:** P2 (Post-Pilot — Phase 2, lt. Webapp §10.3)
> **Dependencies:** **T035** (`invoices` als Datenbasis); GF-Rolle aus M14
> **Welle:** 8
> **Spec-Referenzen:** `Mitarbeiter_Webapp.md` §3.6 (Provisions-Übersicht), §8 (Berechtigungsmodell) · `00_Vertriebsmodell.md` (50% Provision Setup + recurring)
> **Audit:** REPORT-2026-05-26 F05

---

## Ziel

GF-only-View, die die Vertriebsagentur-Provisionen zeigt (50% auf Setup + recurring, `00_Vertriebsmodell.md`), basierend auf den Rechnungsdaten aus T035.

---

## Akzeptanz-Kriterien

- [ ] Route + Navigation **nur für Geschäftsführer** sichtbar (Berechtigungsmodell §8 / M14-Rolle).
- [ ] Übersicht: Provision pro Tenant/Monat (Setup-Provision + recurring), Summen, Zeitraum-Filter.
- [ ] Datenbasis aus `invoices` (T035) — keine Doppelberechnung der Beträge im Frontend.
- [ ] 403/Verbergen für Nicht-GF (Test).
- [ ] Vitest-Tests; `tsc` + Build + CI grün.

---

## Hinweise

- Berechnungslogik (Provisionssätze) gehört ins Backend, nicht ins Frontend (CLAUDE.md §5.1).
- Post-Pilot.
