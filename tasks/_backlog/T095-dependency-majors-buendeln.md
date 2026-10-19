# T095 — Major-Version-Upgrades gebündelt durchziehen (7 Dependabot-PRs)

**ID:** T095
**Verantwortlich:** Andreas
**Priorität:** P3 (Housekeeping — blockiert nichts, siehe „Einordnung" unten)
**Branch:** `andreas/T095-dependency-majors`
**Geschätzt:** 1 Tag Claude-Code-Session
**Dependencies:** T094 (PR #245) sollte vorher gemergt sein — er fasst dieselben `package.json`/`package-lock.json` an
**Ziel-Meilenstein:** — (Querschnitt / Repo-Hygiene)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Sieben Dependabot-PRs mit **Major-Version-Sprüngen** liegen seit dem 25.05.2026 offen
(Stand 2026-08-07: 74 Tage). Einzeln durchgewunken sind sie riskant und teilweise sogar
kaputt — `vitest` und `@vitest/coverage-v8` **müssen** dieselbe Major-Version haben,
sonst bricht das Test-Setup. Deshalb: **eine** Task, **ein** Branch, alle sieben
gemeinsam, mit grünem Tor am Ende.

Die betroffenen PRs werden dabei **geschlossen** (nicht gemergt) — ihre Lockfiles sind
nach 74 Tagen ohnehin veraltet. Die Upgrades werden auf einem frischen Branch neu gefahren.

---

## Die sieben Upgrades

### Backend

| PR | Paket | Von → Nach | Risiko |
|---|---|---|---|
| #76 | `zod` | 3.25.76 → **4.4.3** | **HOCH** — **32 Backend-Dateien** importieren zod. Das ist die komplette Validierungsschicht (Fastify-Routen, `core/config.ts`). Zod 4 hat u. a. geänderte Error-Formate (`.issues`), `.strict()`-Verhalten und Inferenz-Details. |
| #75 | `typescript` | 5.9.3 → **6.0.3** | **MITTEL** — Major-Compiler. Bei `strict: true` (CLAUDE.md §6.3) können neue Fehler auftauchen, die vorher durchgingen. |
| #74 | `pino-pretty` | 11.3.0 → **13.1.3** | **NIEDRIG** — devDep, nur Log-Formatierung in der Entwicklung. |

### Webapp

| PR | Paket | Von → Nach | Risiko |
|---|---|---|---|
| #71 | `vitest` | 2.1.9 → **4.1.9** | **MITTEL** — Test-Runner, 2 Majors. |
| #69 | `@vitest/coverage-v8` | 2.1.9 → **4.1.9** | ⚠️ **Muss exakt zur `vitest`-Major passen.** Nur zusammen mit #71. |
| #70 | `@testing-library/react` | 15.0.7 → **16.3.2** | **MITTEL** — 29 Testdateien in `webapp/src`. |
| #72 | `@vitejs/plugin-react` | 4.7.0 → **6.0.2** | **MITTEL** — Build-Kette der Webapp. |

---

## Reihenfolge (wichtig — nicht alles auf einmal)

Jeder Schritt einzeln committen, damit bei einem Bruch klar ist, **welches** Paket schuld ist:

1. **`pino-pretty`** (harmlos, Aufwärmen) → `npm test` grün?
2. **`typescript`** → `npm run build` + `npm run typecheck` in **Backend und Webapp**. Bei neuen Strict-Fehlern: beheben, **nicht** mit `as any` zudecken (§6.3).
3. **`vitest` + `@vitest/coverage-v8` gemeinsam** in der Webapp → 251 Tests müssen grün bleiben.
   ⚠️ **Prüfen:** Das **Backend** nutzt ebenfalls `vitest` (`^2.0.0`). Entweder mit hochziehen (bevorzugt, verhindert Divergenz) oder die Divergenz bewusst in der Task-Datei dokumentieren.
4. **`@testing-library/react`** → 29 Webapp-Testdateien.
5. **`@vitejs/plugin-react`** → `npm run build` in der Webapp.
6. **`zod` zuletzt** (das riskanteste) → alle 32 Backend-Dateien, danach das volle Backend-Test-Set.

---

## Akzeptanz-Kriterien

- [ ] Alle 7 Pakete auf die Zielversionen gehoben, **je ein eigener Commit**
- [ ] `npm run build` in Backend + Webapp grün
- [ ] `npm run typecheck` in Backend + Webapp grün
- [ ] `npm run lint` (Backend, biome) grün
- [ ] `npm test` Backend grün — Referenz **982 Tests** (Stand 2026-08-06)
- [ ] `npm test` Webapp grün — Referenz **251 Tests** (Stand 2026-08-06)
- [ ] DB-Tests mit `PP_E2E=1` **und laufender Postgres** grün (CLAUDE.md §3.7 — ohne DB skippen sie still)
- [ ] Keine neuen `as any` / `@ts-ignore` zur Umgehung von Typfehlern (§6.3)
- [ ] Zod-4-Umstellung: Fehler-Antworten der API stichprobenartig geprüft (Format `.issues` kann sich ändern → verändert API-Antworten für Clients!)
- [ ] Die 7 PRs (#76, #75, #74, #72, #71, #70, #69) mit Verweis auf diesen Branch **geschlossen**
- [ ] code-reviewer-Agent gibt OK
- [ ] CI grün (⚠️ setzt voraus, dass die GitHub-Actions-Störung vom 06.08. behoben ist)

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §6.3 — TypeScript-Strenge: keine `any` ohne Begründung, `as` nur als Ausnahme
- `.claude/CLAUDE.md` §3.7 — Tor pro Bau-Schritt: Build + Tests grün, DB-Tests mit `PP_E2E=1`
- `.claude/CLAUDE.md` §6.4 — Tests sind Pflicht, Coverage ≥ 80 %

---

## Notes

**Warum nicht einfach die PRs mergen?**
Ihre CI-Ergebnisse stammen vom Mai 2026; `main` hat sich seitdem um über 130 Commits
weiterbewegt. Die Lockfiles in den PRs sind gegen einen `main` gebaut, den es nicht mehr
gibt. Ein frischer Branch ist ehrlicher und schneller als sieben Rebases.

**Sonderfall `zod` — verändert möglicherweise die API nach außen.**
Zod 4 ändert das Fehler-Objekt-Format. Wenn eure Fastify-Routen Validierungsfehler
an Clients durchreichen (Webapp, Wizard, Web-Chat-Widget), ändert sich damit das
Antwortformat für **drei** Frontends. Vor dem Merge prüfen, ob ein Frontend auf die
Fehlerstruktur zugreift — sonst brechen Formulare still.

**Dependabot künftig zähmen (optional, eigene Mini-Task):**
Diese Situation entstand, weil Dependabot Majors einzeln aufmacht und niemand sie
schloss. Eine `.github/dependabot.yml` mit gruppierten Majors oder
`ignore: [{ dependency-name: "*", update-types: ["version-update:semver-major"] }]`
würde den Rückstau künftig verhindern.

**Achtung bei „minor-and-patch"-Gruppen (Lektion aus PR #244):**
Dependabot stuft `0.x`-Pakete falsch ein — bei `0.x` ist laut semver die **Minor**-Stelle
die Breaking-Stelle. In PR #244 steckte so `@anthropic-ai/sdk` 0.32 → 0.115 in einer
„minor-and-patch"-Gruppe. Bei jeder Gruppen-PR die `0.x`-Pakete einzeln ansehen.

---

## Einordnung — ehrlich

Diese Task ist **P3 und blockiert nichts.** Sie räumt auf. Der eigentliche Engpass des
Projekts liegt woanders: In `tasks/MANUELLE_AUFGABEN.md` stehen (Stand 2026-08-07)
**31 offene** gegenüber 4 erledigten Punkten — darunter Google-Vision-Service-Account,
Lexware-API-Token, SMTP-Account, fünf noch nicht auf Production gelaufene Migrations
und der **nie gefahrene Pilot-Smoke-Test (T050, F4-Tor)**. Solange die offen sind, hat
das System noch keinen einzigen echten Beleg verarbeitet.

Wer priorisieren muss, nimmt **zuerst** die Punkte aus `MANUELLE_AUFGABEN.md`, nicht diese Task.

---

## Offene Fragen (während der Bearbeitung)

- Soll das **Backend** ebenfalls auf `vitest` 4 gehoben werden (verhindert Divergenz zur
  Webapp), oder bewusst auf 2 bleiben? → Bei Bearbeitung mit GF klären, **nicht raten** (§7.4).

---

## Lessons Learned (nach Abschluss)

<nach Abschluss ausfüllen>
