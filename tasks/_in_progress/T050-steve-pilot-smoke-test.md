# T050 — F4: Pilot-Smoke-Test (echter Beleg bis Lexware Office)

**ID:** T050
**Verantwortlich:** gemeinsam (Andreas Backend + Steve verifiziert)
**Priorität:** P1 (Pilot-Finish F4 — Qualitäts-Tor)
**Branch:** `gemeinsam/T050-pilot-smoke-test`
**Geschätzt:** 0,5–1 Tag
**Dependencies:** T049 (n8n-Pilot-Workflow steht)
**Ziel-Meilenstein:** Pilot — F4
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Ein **echter Pilot-Beleg** läuft komplett durch und landet in **Lexware Office**: Upload → OCR (Worker) → Categorize → Lexware-Export. Das ist das Tor, das auch verifiziert, dass der OCR-Worker in Prod tatsächlich läuft.

**Basis:** PR #92 (`qa/smoke-test-suite`) enthält bereits ein Smoke-Skript, hat aber Review-Blocker (falscher Metrics-Endpoint-URL, toter Auth-Bypass-Zweig, nicht verdrahtete CI-Claims). Diese Blocker beheben und das Skript auf den echten belege-Pfad richten.

---

## Akzeptanz-Kriterien

- [ ] Smoke-Skript (`scripts/qa-smoke.sh` o.ä.) durchläuft Upload → OCR-Status → categorize → `exports/lexware/batch` gegen eine laufende Instanz
- [ ] Review-Blocker aus PR #92 behoben (korrekter Metrics-Endpoint, kein Auth-Bypass-Deadcode)
- [ ] Erfolgs-/Fehler-Ausgabe eindeutig (Exit-Code + Statusmeldung pro Stufe)
- [ ] Dokumentiert, wie der Test gegen Prod/Staging gefahren wird (welche ENV, welcher Tenant)
- [ ] Ein echter Beispiel-Beleg ist als Fixture/Anleitung hinterlegt (kein PII committen)
- [ ] code-reviewer-Agent gibt OK

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §3.6 (F4)
- PR #92 (`qa/smoke-test-suite`) — Skript-Basis, Blocker beheben
- `Modulkonzept/Konzeptentwicklung/00_Pilot_Strategie.md` — Pilot-Erfolgskriterium

---

## Claude-Code-Start-Prompt

```
Lies zuerst:
- /tasks/_in_progress/T050-<owner>-pilot-smoke-test.md (diese Task)
- .claude/CLAUDE.md §3.6
- den Diff von PR #92 (git diff main origin/qa/smoke-test-suite)
- backend/src/app.ts (echte belege-Endpoints + Health/Ready)

Richte das Smoke-Skript auf den belege-Pfad, behebe die #92-Blocker.

Bei Unklarheiten: in dieser Task-Datei dokumentieren, NICHT raten.

Wenn fertig: /finish-task
```

---

## Notes

PR #92 nach Übernahme schließen. Kein echter Beleg-Inhalt (PII) ins Repo — nur ein neutrales Test-Bild/Anleitung.
