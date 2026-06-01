# T030 — Spec-Migrations-Referenzen + M15-Callback-Pfad korrigieren

> **Owner:** Andreas (Backend) — reine Doku, klein
> **Priorität:** P1 (Pilot, aber Quick-Win — S)
> **Dependencies:** keine
> **Welle:** 5
> **Spec-Referenzen:** `modules/M13_*.md`, `modules/M14_User_Verwaltung_Auth.md`, `modules/M15_Kassensystem_Connector.md`
> **Audit:** REPORT-2026-05-26 F13, F14, F15, F16
> **Status:** in_progress (andreas, 2026-06-01)

---

## Ziel

Drei Modul-Specs verweisen auf falsche bzw. nicht existierende Migrationsdateien, und M15 dokumentiert einen falschen OAuth-Callback-Pfad. Reine Doku-Korrektur, schnell erledigt, verhindert Verwirrung beim nächsten Implementierer.

---

## Akzeptanz-Kriterien

- [ ] **M14**: Migrations-Referenz `031_users_auth.sql` → real `020_users_auth.sql` (Header + §3.4).
- [ ] **M15**: Referenzen `040/041_pos_*` → real `022_pos_credentials.sql` + `040_kasse.sql`; klären/streichen, ob `pos_daily_close` existieren soll (Z-Bon liegt real in `kasse_transactions`).
- [ ] **M15 §4.1**: OAuth-Callback-Pfad `/api/m15/…` → real `/api/v1/m15/oauth/sumup/callback` (vgl. `app.ts:232`, `.env.example`).
- [ ] **M13**: Referenz auf nicht existierende `028_tax_advisor_portal.sql` entfernen/korrigieren; tatsächlicher Code unter `m06-advisor-portal/` vermerken.
- [ ] Jede Korrektur gegen die reale Datei in `backend/migrations/` bzw. `app.ts` verifiziert.

---

## Hinweise

- Nur Spec-Markdown — kein Code. Schnellster Drift-Fix aus dem Audit.
- Lässt sich gut mit T029 (Datenmodell-Doc) in einem Doku-Sprint bündeln.
