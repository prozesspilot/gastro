# T094 — Tote Abhängigkeiten entfernen + .gitignore-Lücken schließen

**ID:** T094
**Verantwortlich:** Andreas
**Priorität:** P3 (Housekeeping — kein Feature, kein Blocker)
**Branch:** `andreas/T094-deps-cleanup`
**Geschätzt:** 0,5 Tage Claude-Code-Session
**Dependencies:** — (keine)
**Ziel-Meilenstein:** — (Querschnitt / Repo-Hygiene)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Das Repo belegt lokal 633 MB, davon 600 MB `node_modules`. Eine Verifikation aller
33 Backend-Runtime-Abhängigkeiten gegen den Quellcode (inkl. `await import(...)`-Lazy-Loads
**und** `backend/scripts/`) hat drei Pakete gefunden, die **nirgends im Repo** verwendet
werden — `googleapis` allein ist 114 MB. Diese fliegen raus.

Zusätzlich werden drei lose Enden geschlossen, die seit Wochen uncommitted im
Working-Tree liegen und jeden `/schicht`-Pull blockieren: die `typecheck`-npm-Scripts,
die `.husky/`-Git-Hooks, und die fehlenden `.gitignore`-Einträge für lokale Artefakte.

---

## Akzeptanz-Kriterien

- [ ] `googleapis` (114 MB) aus `backend/package.json` entfernt — null Verwendung im gesamten getrackten Repo
- [ ] `imapflow` (3,1 MB) entfernt — gehört zu M11 (E-Mail/IMAP), Modul ist **nicht gebaut** (CLAUDE.md §3.4)
- [ ] `google-auth-library` aus den **direkten** Dependencies entfernt (bleibt transitiv über `@google-cloud/vision` → `google-gax`; Platzgewinn = 0, korrigiert nur eine falsche Direkt-Deklaration)
- [ ] `qrcode-terminal` + `@types/qrcode-terminal` bleiben **drin** — werden in `backend/scripts/bootstrap-admin.ts:36` für den TOTP-QR-Code genutzt
- [ ] `package-lock.json` konsistent neu erzeugt (`npm install`)
- [ ] `.gitignore` ergänzt um: `.claude/settings.local.json`, `.claude/launch.json`, `webapp/playwright-report/`, `webapp/test-results/`
- [ ] `typecheck`-Script in `backend/package.json` + `webapp/package.json` committet (lag uncommitted vor)
- [ ] `.husky/` (pre-commit, pre-push) committet (lag seit 2026-06-02 uncommitted vor)
- [ ] `npm run build` im Backend grün
- [ ] `npm test` im Backend grün — mit `PP_E2E=1`, sonst skippen DB-Tests still (CLAUDE.md §3.7)
- [ ] `npm run typecheck` in Backend **und** Webapp grün
- [ ] Webapp-Tests grün (durch `.gitignore`-Änderung nicht betroffen, aber Beweis)
- [ ] code-reviewer-Agent gibt OK
- [ ] PR-Description vollständig

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §3.4 — M11 (E-Mail/IMAP) ist **nicht gebaut**, begründet `imapflow`-Entfernung
- `.claude/CLAUDE.md` §3.7 — Tor pro Bau-Schritt: Build + Tests grün, DB-Tests mit `PP_E2E=1`
- `.claude/CLAUDE.md` §6.6 — Secrets/`.env` niemals committen (betrifft `.gitignore`-Sorgfalt)

---

## Notes

**Warum kein Monorepo-Umbau in dieser Task:**
Das Repo besteht aus fünf getrennten npm-Projekten (`backend`, `webapp`, `onboarding-wizard`,
`web-chat-widget`, `infra/load-tests`). Eine Zusammenführung via npm workspaces würde
geschätzt weitere 100–150 MB sparen (z. B. TypeScript liegt aktuell 2× à 23 MB), ist aber
ein echter Umbau an Build- und CI-Kette. Das gehört in eine **eigene** Task mit eigenem
Anker — nicht nebenbei in eine Aufräum-Task (CLAUDE.md §3.7: eine Aufgabe zur Zeit).

**Wenn Google Drive später gebaut wird** (offener Wizard-Punkt, CLAUDE.md §3.6):
**nicht** `googleapis` zurückholen. Stattdessen das Sub-Paket `@googleapis/drive` (~2 MB)
verwenden. Das 114-MB-Monolith enthält Clients für *sämtliche* Google-Dienste
(YouTube, Ads, Calendar …) und war genau deshalb der größte Einzelposten im Repo.

**Fund am Rande (nicht Teil dieser Task):** `tasks/_in_progress/T092-*.md` liegt noch in
`_in_progress`, obwohl PR #240 gemergt ist (Commit `86b1f91`). Gehört per Mini-PR nach
`_done` — separat, nicht hier mitnehmen.

---

## Offene Fragen (während der Bearbeitung)

<keine>

---

## Lessons Learned (nach Abschluss)

Ein naiver „welche Dependency wird nicht importiert"-Scan produziert **Falsch-Positive**:
Dieses Repo nutzt an vielen Stellen bewusst `await import('paket')` (Lazy-Load für
optionale schwere SDKs — `@anthropic-ai/sdk`, `nodemailer`, `@google-cloud/vision`,
`archiver`). Ein Scan, der nur nach statischen `import ... from` sucht, hält diese
fälschlich für tot. Ebenso muss `backend/scripts/` mitgeprüft werden, nicht nur
`backend/src/` — genau daran wäre `qrcode-terminal` beinahe irrtümlich entfernt worden.
Regel für künftige Dependency-Audits: **breit greppen (ganzes Repo), Lazy-Imports
mitdenken, jeden Kandidaten einzeln verifizieren.**
