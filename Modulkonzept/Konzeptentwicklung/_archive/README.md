# _archive/ — Historische Konzept-Dokumente

> **Status:** Read-only. Diese Files sind veraltet, werden nicht mehr gepflegt, dürfen aber nicht gelöscht werden (historische Referenz).

## Was hier liegt

### Vor Konzept-Reboot (vor Mai 2026)

| Datei | Was es war | Warum archiviert |
|---|---|---|
| `Foundation_Spec.md` | Sprint-0-Foundation-Spezifikation | Sprint-Phase abgeschlossen, neue Roadmap in Customer-Outcome-Form |
| `Sprint_0_Foundation.md` | Sprint-0-Detail-Plan | erfüllt, neue Tranche-Struktur ersetzt das |
| `Sprint_1_MVP.md` | Sprint-1-MVP-Plan | erfüllt |
| `AGENTS_AUTONOM.md` | Konzept für autonome Agenten | überholt durch Claude-Code-Sub-Agents in `.claude/agents/` |
| `AGENT_SOLO.md` | Solo-Agent-Setup | dito |
| `CLEANUP_PLAN.md` | Aufräum-Plan vor Reboot | erfüllt durch Konzept-Reboot Mai 2026 |
| `Github_Sync_Setup.md` | Setup-Anleitung GitHub-Sync | überholt durch GitHub-Actions-Workflows in `.github/workflows/` |
| `Server_Umzug.md` | Server-Migrations-Notizen | erledigt, Hetzner-Setup neu in Architektur-Hauptdokument |

### Status-HTMLs (vor Mai 2026)

| Datei | Datum | Was es war |
|---|---|---|
| `STATUS_AUDIT_2026-05-12.html` | 12.05.2026 | Audit-Status nach Drift-Identifikation |
| `STATUS_LOGIN_FIX.html` | Mai 2026 | Status nach Login-Fix |
| `STATUS_POST_FIX_AUTONOMOUS.html` | Mai 2026 | Status nach Autonomer-Agent-Fix |
| `ProzessPilot_Fortschritt.html` | Anfang Mai 2026 | Fortschritts-Übersicht |
| `ProzessPilot_Status_Mai2026.html` | Anfang Mai 2026 | Mai-Status |
| `prozesspilot_gesamtkonzept.html` | vor Mai 2026 | Erste Konzept-Übersicht |

**Aktueller Status:** Siehe [STATUS.html](../STATUS.html) (eine Datei, regelmäßig aktualisiert).

## Wann darf was hier rein?

Wenn ein bestehendes Konzept-Dokument grundlegend ersetzt wird durch eine neue Version, kann die alte Version nach `_archive/` verschoben werden. Wichtig:

- Datei umbenennen mit Datum-Suffix: `<original>_alt_YYYY-MM-DD.md`
- Im neuen Dokument einen Hinweis "Ersetzt: [_archive/...](../_archive/...)" hinterlegen
- README.md hier aktualisieren

## Wann darf was gelöscht werden?

**Nie**, ohne explizite Geschäftsführer-Entscheidung. Auch alte Status-Files können bei späteren Audits oder rechtlichen Fragen wichtig werden.

---

**Letzte Aktualisierung:** 2026-05-15 (Aufräumen nach Konzept-Reboot)
