# T051 — F5: Grün + sauber (kein `customers`/`receipts`-Bezug, CLAUDE.md final)

**ID:** T051
**Verantwortlich:** gemeinsam
**Priorität:** P1 (Pilot-Finish F5 — Drift-Motor endgültig abstellen)
**Branch:** `gemeinsam/T051-gruen-sauber`
**Geschätzt:** 0,5 Tag
**Dependencies:** T050 (Smoke-Test grün)
**Ziel-Meilenstein:** Pilot — F5
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Den Pilot-Stand „versiegeln": `npm run build` + `npm test` grün, **kein aktiver Bezug** mehr auf die Geister-Tabellen `customers`/`receipts`/`customer_profiles` im lebenden Code, und CLAUDE.md §3 auf den dann wahren Stand bringen (M03/categorize ist jetzt LIVE, Bau-Lücke geschlossen).

---

## Akzeptanz-Kriterien

- [ ] `npm run build` + `npm test` grün (keine still-skippenden DB-Tests, die toten Code verbergen)
- [ ] `git grep -nE "(FROM|INTO|UPDATE|JOIN)\s+(receipts|customers|customer_profiles)" backend/src` = 0 im **aktiven** Code (eingefrorene/gelöschte Module ausgenommen)
- [ ] `.claude/CLAUDE.md` §3.2 aktualisiert: M03/Categorize von „Bau-Lücke" → ✅ LIVE; §3.3 entsprechend entschärft
- [ ] `.claude/CLAUDE.md` §3 Stand-Datum + ggf. STRUCTURE/README-Pointer aktualisiert
- [ ] Pilot-Pfad-Diagramm in §3.6 stimmt mit dem realen Code überein
- [ ] code-reviewer-Agent gibt OK

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §3.2/§3.3/§3.6 (F5) — der Wahrheits-Anker, jetzt final
- `infra/decisions/004-datenmodell-customer-vs-tenant.md` — Reboot abgeschlossen vermerken

---

## Claude-Code-Start-Prompt

```
Lies zuerst:
- /tasks/_in_progress/T051-<owner>-gruen-sauber.md (diese Task)
- .claude/CLAUDE.md §3 (komplett)

Prüfe build+test, grep nach Geister-Tabellen im aktiven Code, aktualisiere CLAUDE.md §3 auf den wahren Stand (M03 LIVE).

Bei Unklarheiten: in dieser Task-Datei dokumentieren, NICHT raten.

Wenn fertig: /finish-task
```

---

## Notes

Nach T051 ist der Pilot-Pfad geschlossen. Danach gilt: neue Funktion/neues Modul erst, wenn der Pilot zahlt (CLAUDE.md §3.7). Post-Pilot-Tasks liegen in `tasks/_eingefroren/`.
