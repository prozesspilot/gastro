# T<ID> — <Titel>

**ID:** T<ID>
**Verantwortlich:** Steve / Andreas / gemeinsam
**Priorität:** P0 / P1 / P2 / P3
**Branch:** `<owner>/T<ID>-<kurz>`
**Geschätzt:** X Tage Claude-Code-Session
**Dependencies:** [T<XXX>, T<YYY>] — diese müssen erst in `_done/` sein
**Ziel-Meilenstein:** M0 / M1 / M2 / M3 / M4 / M5 / M6
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

<Klare Beschreibung in 1-3 Sätzen. Was ist das Ziel?>

---

## Akzeptanz-Kriterien

- [ ] <konkretes überprüfbares Kriterium 1>
- [ ] <konkretes überprüfbares Kriterium 2>
- [ ] <konkretes überprüfbares Kriterium 3>
- [ ] CI grün (lint + typecheck + tests + build)
- [ ] Test-Coverage ≥ 80% für neue/geänderte Dateien
- [ ] code-reviewer-Agent gibt OK
- [ ] PR-Description vollständig
- [ ] Spec-Files aktualisiert wenn Änderungen am Konzept

---

## Spec-Referenzen

- `Modulkonzept/Konzeptentwicklung/<datei>.md` — <warum relevant>
- `Modulkonzept/Konzeptentwicklung/modules/M<XX>_<name>.md` — <warum relevant>

---

## Claude-Code-Start-Prompt

```
Lies zuerst:
- /tasks/_in_progress/T<ID>-<kurz>.md (diese Task)
- <weitere Spec-Files>
- <Referenz-Implementierung wenn vorhanden, z.B. ähnliches Modul>

Implementiere dann gemäß den Akzeptanz-Kriterien.

Beachte:
- <Spezifischer Hinweis 1>
- <Spezifischer Hinweis 2>

Nutze test-writer-Agent für die Tests.
Bei Unklarheiten: Frage in dieser Task-Datei dokumentieren, NICHT raten.

Wenn fertig: /finish-task
```

---

## Notes

<Optional: Edge-Cases, bekannte Gotchas, alternative Ansätze die wir erwogen haben>

---

## Offene Fragen (während der Bearbeitung)

<Hier dokumentieren wenn beim Implementieren Fragen auftauchen, die geklärt werden müssen, bevor weitergearbeitet werden kann>

---

## Lessons Learned (nach Abschluss)

<Was haben wir aus dieser Task gelernt? Wird ggf. in CLAUDE.md übernommen>
