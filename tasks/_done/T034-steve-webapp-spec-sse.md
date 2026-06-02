# T034 — Webapp-Spec §2/§7 von Socket.io auf SSE angleichen

> **Owner:** Steve (Frontend/Webapp) — Doku
> **Priorität:** P2 (Post-Pilot)
> **Dependencies:** keine
> **Welle:** 8
> **Spec-Referenzen:** `Mitarbeiter_Webapp.md` §2 (Tech-Stack), §7 (Real-Time) · `backend/src/routes/sse.ts`, `webapp/src/hooks/useReceiptEvents.ts`
> **Audit:** REPORT-2026-05-26 F08

---

## Ziel

Das Konzept nennt Socket.io für Real-Time-Updates (§2, §7). Der Code nutzt **SSE** (`backend/src/routes/sse.ts`, `useReceiptEvents.ts`). SSE ist eine bewusste, schlankere Wahl — die Spec soll das nachziehen (DRIFT, kein Bug).

---

## Akzeptanz-Kriterien

- [ ] §2 (Tech-Stack) + §7 (Real-Time) auf SSE umgeschrieben, mit kurzer Begründung (warum SSE statt Socket.io: einseitiger Server→Client-Push reicht, kein bidirektionaler Channel nötig).
- [ ] §7.1 (was live aktualisiert wird) + §7.3 (Fallback) gegen den realen `sse.ts`-Stand geprüft.
- [ ] Verweis auf den realen Endpunkt + Hook im Doc.

---

## Hinweise

- Reine Doku. Falls später doch bidirektionale Updates nötig werden (z.B. Live-Collaboration im Task-Detail), separat als neue Task bewerten.
