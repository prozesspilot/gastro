# prompts/ — Historische Prompt-Sammlung

> **Status:** Archiv. Alle Files hier sind aus der **Phase vor dem Konzept-Reboot Mai 2026** und werden nicht mehr aktiv genutzt.

Mit der Einführung des Claude-Code-Workflows (siehe `Claude_Code_Workflow.md`) und dem Tasks-System (`prozesspilot/tasks/`) sind diese Prompts überholt. Sie bleiben als Referenz erhalten, falls historischer Kontext gebraucht wird.

## Struktur

| Ordner | Inhalt |
|---|---|
| `legacy/` | Alte System-Prompts und Agent-Prompts (vor Konzept-Reboot) |
| `terminal-tasks/` | Alte Aufgaben-Files für parallele Terminal-Sessions (vor Workflow-Setup) |

## Wofür heute verwendet?

**Nicht mehr für tägliches Arbeiten.** Heute nutzen wir:

- **`prozesspilot/.claude/`** für Claude-Code-Konfiguration (Sub-Agents, Slash-Commands)
- **`prozesspilot/tasks/`** für aktive Aufgaben mit klarem Format
- **`Modulkonzept/Konzeptentwicklung/06_Prompt_System.md`** für das aktuelle Prompt-Template-System

## Historischer Kontext aus diesen Files

- Wie wir früher Tasks an parallele Terminal-Sessions verteilt haben (Hinweis für die Workflow-Iteration)
- Welche Probleme die alten Agent-Setups hatten (siehe Diagnose in `Modulkonzept/Konzeptentwicklung/_archive/`)

## Falls du was hier findest, das du brauchst

Übernimm es **nicht 1:1** in den neuen Workflow. Die Prompts gehen von einer anderen Architektur aus (z.B. Customer-Webapp statt internem Tool, kein Discord-Login, keine Magic-Link-Mechanik).

Wenn ein alter Prompt einen guten Kerngedanken enthält, übernimm den Kerngedanken in einen neuen Sub-Agent oder Slash-Command unter `.claude/`.

---

**Letzte Aktualisierung:** 2026-05-15 (Initialer Archiv-Stand)
