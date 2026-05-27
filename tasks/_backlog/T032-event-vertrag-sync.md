# T032 — Event-Vertrag (`01_Datenmodell_Events.md` §4.3) mit Code abgleichen

> **Owner:** Andreas (Backend) — Doku
> **Priorität:** P2 (Post-Pilot)
> **Dependencies:** keine (idealerweise nach/mit T029)
> **Welle:** 8
> **Spec-Referenzen:** `01_Datenmodell_Events.md` §4.3
> **Audit:** REPORT-2026-05-26 F11, F12

---

## Ziel

Der Event-Katalog im Konzept (§4.3) und die real emittierten Events driften auseinander. Diese Task synchronisiert beide.

---

## Akzeptanz-Kriterien

- [ ] **FEHLT** prüfen: `pp.customer.profile_updated` und `pp.system.module_error` werden nirgends emittiert (Grep 0) → entweder implementieren oder aus §4.3 streichen (Entscheidung dokumentieren).
- [ ] **EXTRA** ergänzen: tatsächlich emittierte, aber undokumentierte Events in §4.3 aufnehmen — u.a. `pp.receipt.media_persisted`, `pp.media.received`, `pp.receipt.approved`, `pp.communication.*`, `pp.datev.exported`, `pp.template.sent`, `pp.sender.rejected`.
- [ ] Namens-Konvention bestätigen (`pp.*` vs `gastro.*`, CLAUDE.md §6.2) und im Doc einheitlich.
- [ ] Für jeden Event: Emitter-Ort (Backend-Modul oder n8n) vermerken.

---

## Hinweise

- Manche Events werden evtl. in n8n statt Backend emittiert → Default ist **Doku angleichen**, nicht zwingend Code ergänzen.
- Gut mit T029 (Datenmodell-Doc) zu bündeln.
