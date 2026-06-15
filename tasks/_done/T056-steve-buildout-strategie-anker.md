# T056 — CLAUDE.md auf Build-out-Strategie umstellen + Roadmap persistieren

**ID:** T056
**Verantwortlich:** Steve
**Priorität:** P0 (Anker — sonst lädt jede künftige Session die alte „nach Zahlung"-Regel gegen die neue Strategie)
**Branch:** `steve/T056-buildout-strategie`
**Geschätzt:** 0,5 Tag
**Ziel-Meilenstein:** Build-out — Fundament
**Herkunft:** Strategiewechsel GF Steve (2026-06-15) + Gap-Analyse-Workflow

---

## Was zu tun ist

**Strategiewechsel (GF Steve, 2026-06-15):** Der Testkunde zahlt nie — er ist ein Test-Objekt. Das Tor
„bauen erst wenn der Pilot zahlt" (CLAUDE.md §3.6/§3.7) **entfällt**. Neues Ziel: das System so weit
fertig bauen, dass der Testkunde **alles** selbst durchspielen kann — Onboarding → Eingangskanal →
OCR → Kategorisierung → Export → Support-Chat.

**Eingangskanal-Entscheidung:** Web-Chat-Widget = Eingangskanal **und** Support-Kanal in einem
(vereint die Blocker „Eingangskanal" + „Support-Chat").

Der Realitäts-Anker CLAUDE.md §3 widerspricht jetzt der Strategie und muss angepasst werden:
- **§3.6** von „Pilot durch Streichen / das EINZIGE bis zum zahlenden Kunden" → „Build-out für Test".
- **§3.7** Zeile „Neue Funktion / neues Modul = nach dem Pilot. Immer." → „Build-out, sequenziell +
  reviewed". Tor (build+test+smoke) und Sequenzialität/ein-Terminal/kein-Parallel-Blind-Schreib **behalten**.
- **§3.4/§3.5** eingefrorene Module/Frontends → „im Build-out, Phase X" statt „eingefroren bis Pilot zahlt".
- **§3 Header** + §3.3: Strategiewechsel-Eintrag 2026-06-15, T052/T053/T054 als erledigt nachziehen.

Plus: den **Bau-Fahrplan** (Gap-Analyse 2026-06-15) als Konzept-Doku im Repo persistieren.

---

## Akzeptanz-Kriterien

- [x] §3.6 auf Build-out-Strategie umgeschrieben (Pipeline um Onboarding + Web-Chat erweitert)
- [x] §3.7 „nach dem Pilot" ersetzt durch Build-out-Regel; Tor + Sequenzialität + Anti-Parallel-Schreib behalten
- [x] §3.4/§3.5 eingefroren → Build-out-Phasen; Web-Chat als Kanal+Support vermerkt
- [x] §3-Header + §3.3 aktuell (Strategiewechsel; T052–T054 erledigt) + §4-Verweis auf Roadmap
- [x] Bau-Fahrplan als `Modulkonzept/Konzeptentwicklung/00_Buildout_Roadmap.md` persistiert
- [x] Keine Code-Änderung (reine Doku) — Build/Tests unberührt

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §3.3–§3.7
- Gap-Analyse-Workflow 2026-06-15 (Roadmap)
