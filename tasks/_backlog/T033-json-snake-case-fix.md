# T033 — API-facing JSON-Felder auf snake_case vereinheitlichen

> **Owner:** Andreas (Backend) — ggf. mit Steve abstimmen (Webapp-Konsumenten)
> **Priorität:** P2 (Post-Pilot)
> **Dependencies:** keine
> **Welle:** 8
> **Spec-Referenzen:** `01_Datenmodell_Events.md` §1 (JSON-Felder snake_case) · CLAUDE.md §6.2
> **Audit:** REPORT-2026-05-26 F18

---

## Ziel

CLAUDE.md §6.2 + Datenmodell §1 schreiben snake_case für JSON-Felder (API + DB) vor. Einzelne Zod-Schemas nutzen camelCase. Wire-facing Felder vereinheitlichen, Repository-Interna ggf. als bewusste Ausnahme dokumentieren.

---

## Akzeptanz-Kriterien

- [ ] **Wire-facing** (klar API-Response): `webapp/src/.../receipt.schema.ts:160 uploadUrl` → `upload_url` (+ Webapp-Konsument anpassen). Breaking-Change koordinieren.
- [ ] Repository-Input-Objekte (interne TS-Grenze, z.B. `beleg.repository.ts:100–107`, `m15-pos-connector/oauth.routes.ts:64`) bewerten: vereinheitlichen ODER als interne Ausnahme im Code-Kommentar begründen.
- [ ] Keine Regression: betroffene Endpunkte + Webapp-Calls getestet; CI grün.

---

## Hinweise

- Erst Inventar aller camelCase-JSON-Felder ziehen (Grep), dann wire-facing vs. intern trennen.
- Breaking-Changes an API-Feldern mit Steve abstimmen (Webapp nutzt sie).
