---
name: audit-2026-06-24-pilot-blocker
description: "Projekt-Audit 2026-06-24 (status/AUDIT.html) — GELB + 3 verdeckte Blocker (SSE/Webapp-categorize-export/Web-Chat). ⚠️ ÜBERHOLT: alle 3 gelöst (Stand 2026-07-01), nur noch als Historie; Ist-Stand siehe buildout-phase-status."
metadata: 
  node_type: memory
  type: project
  originSessionId: ef071eaa-cf99-4cd6-b601-7ee35b873fd1
---

> **⚠️ ÜBERHOLT (Stand 2026-07-01, code-verifiziert per 4 Read-only-Agenten):** Alle 3 verdeckten Blocker sind gelöst — (1) **SSE verdrahtet** (T069/T074/T091: `emitBelegStatus` an 6 Writern, Live-Status Liste+Detail), (2) **Webapp categorize/export gebaut** (T076/T078), (3) **Web-Chat-Widget komplett live** (Phase C, T068–T073, chat.* auf Prod). Zusätzlich ist der Onboarding-Ketten-Erstschritt **Tenant-Anlage (T093)** gebaut. Diese Notiz bleibt als Historie. Ist-Stand: [[buildout-phase-status]]. **Verbleibende echte Blocker = NUR noch manuelle Config/Secrets** (Vision/Discord/Lexware/Claude/SMTP/MinIO) **+ ein echter Prod-Durchstich — kein Modul-Bau mehr.**

Audit am 2026-06-24 erstellt als `status/AUDIT.html` (single-file, 3 parallele Survey-Agenten + eigene grep-Cross-Checks). Gesamtampel **GELB**: Verarbeitungs-Mitte (Upload→OCR→Kategorisieren→Lexware-Export) ist echt live & sauber, aber der Self-Service-Pilotflow ist unterbrochen.

**3 verdeckte Blocker (kein Fehler, sogar grüne Unit-Tests → leicht zu übersehen):**
1. **SSE ist ein toter Kanal** — `sse.manager.ts:35` `emit()` hat 0 Aufrufer im ganzen Backend; nur subscribe/unsubscribe in `routes/sse.ts:38,50`. Kein Live-Status fürs Frontend. → kleine P1-Task (emit bei Beleg-Statuswechsel verdrahten).
2. **Webapp kann den Flow nicht abschließen** — `webapp/src/api/belege.ts:122-209` kennt nur upload/list/get/update/reprocess/delete; **kein categorize, kein Lexware-Export**, obwohl beide Backend-Routen live sind. → P1-Task (Buttons + API-Calls).
3. **Web-Chat-Widget (gewählter Pilot-Eingangskanal) existiert gar nicht** — nur Enum-Wert `web_chat` in `beleg.repository.ts:41`, `chat.prozesspilot.net` = leerer Stub. Größter Block (P0, L). T037 reaktivieren + splitten.

Weitere: A2 PDF-Engine fehlt (`core/pdf` nur image-to-pdf.ts); Task-System ungebaut (T024-T027); Wizard Step3/Step5 disabled Platzhalter; `webapp AuthContext loginWithPassword` läuft gegen entfernten Endpoint (toter Pfad); `modules/tenants/` toter Code.

**Anker-Klarstellung:** `tasks/PILOT_FERTIG_PLAN.md` existiert NICHT — realer Anker = CLAUDE.md §3.6 + `00_Buildout_Roadmap.md`. Siehe [[buildout-phase-status]]. Manuelle Pilot-Blocker (Vision-Key, Discord-App, Lexware-Token, Claude-Key, SMTP, MinIO-Bucket) alle noch offen — Detail in `tasks/MANUELLE_AUFGABEN.md`.
