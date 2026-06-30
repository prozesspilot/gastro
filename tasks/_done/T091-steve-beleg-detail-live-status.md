# T091 — Beleg-Detail-Seite: Live-Status via SSE (Folge zu T074)

**ID:** T091
**Verantwortlich:** Steve
**Priorität:** P2
**Branch:** `steve/T091-beleg-detail-live-status`
**Geschätzt:** 0,25 Tag
**Dependencies:** T074 (SSE-Backend + `useBelegStatusStream`-Hook + Liste-Live-Status) gemergt
**Ziel-Meilenstein:** Build-out Phase C
**Anker:** T074; `webapp/src/hooks/useBelegStatusStream.ts`; `webapp/src/pages/BelegeDetailPage.tsx`

---

## Was zu tun ist

T074 hat den `useBelegStatusStream`-Hook gebaut und in die Belege-**Liste** eingebunden. Dieser
Folge-Task bindet ihn in die Beleg-**Detail-Seite** ein, damit ein Mitarbeiter, der einen einzelnen
Beleg geöffnet hat, dessen Statuswechsel (z. B. `extracting → extracted → categorized`) live sieht.

**Verhalten (respektiert den `isDirty`-Bearbeitungsschutz):**
- Event für **diesen** Beleg + **keine** ungespeicherten Edits → `refreshBeleg()` (Status **und** Felder frisch).
- Event für diesen Beleg + **ungespeicherte Edits** (`isDirty`) → **nur** das Status-Badge patchen, das
  Formular bleibt unangetastet (kein Verwerfen von Eingaben).
- Event für einen **anderen** Beleg → ignorieren.

Umsetzung: `isDirty` über ein `useRef` lesen, damit der `useCallback`-Handler stabil bleibt (kein
Stream-Resubscribe bei jedem Dirty-Wechsel). Reiner Webapp-Change, kein Backend.

---

## Akzeptanz-Kriterien
- [x] Detail-Seite lädt den Beleg bei `beleg.status`-Event neu, wenn nicht dirty (Test)
- [x] Bei ungespeicherten Edits: nur Status-Badge, Formular-Eingaben bleiben erhalten, kein Reload (Test)
- [x] Event für fremden Beleg wird ignoriert (Test)
- [x] Webapp tsc + Tests (247) + vite build grün
- [ ] code-reviewer OK + CI grün

## Spec-Referenzen
- `webapp/src/pages/BelegeDetailPage.tsx`
- `webapp/src/hooks/useBelegStatusStream.ts`
- `webapp/src/pages/BelegeDetailPage.test.tsx`
