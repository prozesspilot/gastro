# T029 — Datenmodell-Doku auf `tenants`/`belege`-Reboot aktualisieren

> **Owner:** Andreas (Backend) — Doc, aber backend-nah
> **Priorität:** P1 (Pilot — verhindert Re-Drift am Kern-Datenmodell)
> **Dependencies:** **T028** (Architektur-Entscheidung) abgeschlossen
> **Welle:** 6
> **Spec-Referenzen:** `01_Datenmodell_Events.md` §6 · `backend/migrations/` (`010`–`110`)
> **Audit:** REPORT-2026-05-26 F09, F10

---

## Ziel

`01_Datenmodell_Events.md` beschreibt Tabellen, die so nicht (mehr) existieren: `customers`, `customer_profiles`, `receipts`, `idempotency_keys`, `processed_events`. Real maßgeblich sind `tenants`, `belege`, `audit_log` + RLS. Diese Task zieht die Doku auf das in **T028** entschiedene Zielbild — damit Code und Spec wieder übereinstimmen.

---

## Akzeptanz-Kriterien

- [ ] §6 (Tabellen) gegen die realen Migrationen abgeglichen: vorhandene Tabellen korrekt beschrieben, tote Tabellen (`receipts` etc.) als deprecated/entfernt markiert (gemäß T028-Entscheidung).
- [ ] RLS-Modell (`tenant_id` + `current_tenant_id()` + `is_rls_bypassed()`) dokumentiert.
- [ ] Idempotenz-Mechanismus aktualisiert (real: `belege`-Hash / Repository-Checks statt `idempotency_keys`-Tabelle — Ist-Stand prüfen).
- [ ] Event-Liste §4.3 als Teilschritt mit T032 abgestimmt (oder Verweis darauf).
- [ ] Kein Widerspruch mehr zwischen §6 und `backend/migrations/`.

---

## Hinweise

- Nur Doku — kein Code. Aber faktentreu gegen die Migrationen schreiben (file:line-genau prüfen).
- Reihenfolge: erst T028 (Entscheidung), dann hier das entschiedene Zielbild dokumentieren.
