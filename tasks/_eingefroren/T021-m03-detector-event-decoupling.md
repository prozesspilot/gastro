# T021 — M03 Bewirtungs-Detector als Event-Consumer entkoppeln

> **Owner:** Andreas (Backend)
> **Priorität:** P2 (Code-Quality / Phase-2 — Pilot lebt mit direktem Import)
> **Dependencies:** T008 (Bewirtungs-Detector existiert)
> **Welle:** 5+
> **Entdeckt durch:** T008-Self-Review PR #57 (Finding #3 — Modul-Trennungs-Verstoß light)

---

## Problem

Der OCR-Service (`m01-receipt-intake/services/ocr.service.ts`) importiert direkt aus dem M03-Modul:

```ts
import { analyze as analyzeBewirtung } from '../../m03-categorization/services/bewirtungs-detector';
```

Das verletzt die Modul-Trennungs-Regel aus `CLAUDE.md` §5.8 und der M03-Spec:

> Ein Modul = kunden-aktivierbares Funktions-Paket … Pro Tenant togglebar.

Aktuell ist M03 fest mit M01 verdrahtet — wenn ein Tenant M03 deaktiviert (z.B. weil er Bewirtungs-Klassifizierung selbst über Steuerberater macht), wird trotzdem der Detector aufgerufen.

## Ziel

Decouple M01 → M03 via Event-Hook-Pattern (CLAUDE.md §5.8 + Architektur-Hauptdoku §9):

```
M01 OCR fertig → emit('gastro.receipt.extracted', payload)
                  ↓
                 M03 Bewirtungs-Detector (subscribed, nur wenn M03 enabled für Tenant)
                  ↓
                 schreibt payload.bewirtung, ggf. category='bewirtung'
                  ↓
                 emit('gastro.receipt.bewirtung_detected', payload)
```

## Akzeptanz-Kriterien

- [ ] `ocr.service.processBeleg` ruft `analyzeBewirtung` NICHT mehr direkt auf
- [ ] Stattdessen: nach erfolgreichem OCR-Update wird `gastro.receipt.extracted` Event emitted (Redis Stream)
- [ ] Neues M03-Worker-File `backend/src/workers/bewirtung-detector-worker.ts` consumed das Event und ruft `analyzeBewirtung` auf
- [ ] M03-Worker prüft Tenant-Setting `tenant_settings.modules_enabled` enthält `m03_categorization` — sonst Skip
- [ ] M03-Worker schreibt Detector-Ergebnis in `belege.payload.bewirtung` + setzt ggf. `category`
- [ ] Status-Override `requires_review` bei `confidence < 0.7` wird ebenfalls vom Worker gemacht (separates UPDATE auf belege)
- [ ] Integration-Test: Event-Roundtrip Worker → DB
- [ ] M01-Service-Tests + Detector-Unit-Tests bleiben grün (Pure-Function-Tests unverändert)
- [ ] Performance: Event-Delivery <500ms (Redis-Stream-Latency)

## Implementierungs-Hinweise

```
Existing Infrastructure (already in repo):
* backend/src/core/events/  (Redis Streams Publisher/Consumer)
* Per OCR-Worker existiert schon `core/queue/ocr-queue.ts` mit BullMQ

Strategie:
* Variante A: BullMQ-Queue 'bewirtung-detection' analog 'ocr'
* Variante B: Redis Streams (für Event-Sourcing-Pattern)
* Variante A simpler — gleicher Tech-Stack wie T007
```

## Rollback / Migration

Aktueller Code (T008) bleibt funktional als Inline-Call. Die Event-basierte Variante läuft parallel mit Feature-Flag `ENABLE_EVENT_DRIVEN_M03` (default false), bis verifiziert. Dann Cutover + Inline-Call entfernen.

## Out of Scope

- M03-Categorizer (Claude-basierte SKR-Mapping) — bleibt aktuell wie es ist
- Magic-Link-Anfragen an Wirt — separater Task (M03-Phase-2)

## Notes

Aktuelle T008-Implementation funktioniert für Pilot (1 Tenant, M03 immer enabled). Diese Entkoppelung wird kritisch wenn:
- Wir mehrere Tenants haben mit unterschiedlicher Module-Konfig
- M03 in der Verarbeitung asynchron werden soll (Claude-Calls in Phase-2 sind teuer)
- Andere Module M01-Events konsumieren wollen (z.B. M02 Archivierung)

---

## ⚠️ KRITISCHER BEFUND (2026-06-30) — Spec-Ansatz so NICHT umsetzbar

Bei einer Anti-Drift-Analyse festgestellt: Die oben skizzierte **asynchrone** Event-Entkopplung
(M01 emit → M03-Worker konsumiert unabhängig) **bricht eine Reihenfolge-Invariante** und würde
falsche Kategorien erzeugen:

- Der Bewirtungs-Detector schreibt `payload.bewirtung`.
- Die **Auto-Kategorisierung (T077)** läuft **direkt nach dem OCR im selben ocr-worker** und
  **liest** `payload.bewirtung` (`m03-categorization/services/categorize.service.ts`, `extractOcrFields`).
- Würde die Detection in einen unabhängigen async-Consumer ausgelagert, liefe categorize davor →
  `payload.bewirtung` = `undefined` → der Bewirtungs-Sonderfall (T053-Schutz) greift nicht.

**Korrekter Ansatz (für die Neuauflage):** KEIN unabhängiger Parallel-Consumer, sondern die Pipeline
**umhängen**: `OCR → (Event) → bewirtung-detector-worker → schreibt payload.bewirtung → triggert
categorize`. D.h. der T077-Auto-Categorize-Trigger müsste vom ocr-worker in den (neuen) bewirtung-
Worker wandern. Das ist eine echte Pipeline-/Ordering-Design-Entscheidung, kein mechanisches Refactoring.

Bis dahin ist der direkte Import (`ocr.service.ts` → `m03/bewirtungs-detector`) bewusst belassen und
in beiden Dateien mit einem Reihenfolge-Invarianten-Kommentar abgesichert. Priorität bleibt P2.
