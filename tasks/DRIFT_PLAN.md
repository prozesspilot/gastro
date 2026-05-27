# Drift-Audit → Task-Plan (Stand 2026-05-27)

Abgeleitet aus dem Konzept↔Code-Audit `Modulkonzept/Konzeptentwicklung/_audit/REPORT-2026-05-26.md`.
Ziel: **nicht erneut abdriften** (jede Task referenziert die maßgebliche Spec-§) und **parallel arbeiten können** (klare Owner + Abhängigkeiten + Lanes).

## Owner-Konvention (CLAUDE.md §2)
- **Steve** — Frontend / Webapp
- **Andreas** — Backend / Infra / DB
- **Gemeinsam** — Architektur-Entscheidungen

## Task-Übersicht

| Task | Titel | Owner | Welle | Pilot? | hängt ab von | blockt |
|------|-------|-------|-------|--------|--------------|--------|
| **T028** | Architektur-Entscheidung Legacy-`customer`-Welt | Gemeinsam | 5 | ✅ | — | T029, (T019) |
| **T024** | Task-Datenmodell (Migration + RLS) | Andreas | 5 | ✅ | — | T025, T027 |
| **T030** | Spec-Migrations-Referenzen + M15-Callback fixen | Andreas | 5 | ✅ (Quick-Win) | — | — |
| **T031** | Discord-Bot-Service (Notifications/Bridge) | Andreas | 5 | ✅ | — | — |
| **T016** | Onboarding-Wizard Skeleton *(bestand)* | Steve | 5 | ✅ | — | — |
| **T025** | Task-Backend-API | Andreas | 6 | ✅ | T024 | T026 |
| **T027** | Auto-Trigger-Engine | Andreas | 6 | ✅ | T024 | — |
| **T029** | Datenmodell-Doku auf `tenants`/`belege` | Andreas | 6 | ✅ | T028 | — |
| **T026** | Webapp Task-Dashboard `/tasks` (Mock ersetzen) | Steve | 7 | ✅ | T025 | — |
| **T022** | POS-Cron auf Owner-Connection *(bestand)* | Andreas | 6 | ✅ (vor RLS) | — | — |
| **T019** | Alte `/receipts`-Routen entfernen *(bestand)* | Andreas | 6 | ⚪ | T028 | — |
| **T023** | Integrationstests M05/M15 *(bestand)* | Andreas | 7 | ⚪ | — | — |
| **T021** | M03-Detector entkoppeln *(bestand)* | Andreas | 7 | ⚪ | — | — |
| **T020** | E2E auf Discord-Auth *(bestand)* | Steve | 8 | ⚪ | — | — |
| **T032** | Event-Vertrag §4.3 abgleichen | Andreas | 8 | ⚪ | (T029) | — |
| **T033** | JSON-Felder snake_case | Andreas | 8 | ⚪ | — | — |
| **T034** | Webapp-Spec Socket.io→SSE | Steve | 8 | ⚪ | — | — |
| **T035** | `invoices` + Auto-Rechnung | Andreas | 8 | ⚪ | — | T036 |
| **T036** | Provisions-Übersicht (GF) | Steve | 8 | ⚪ | T035 | — |
| **T037** | Customer-Chat + Web-Chat-Widget | Steve+Andreas | 8 | ⚪ | — | — |

✅ = Pilot-relevant (KW22) · ⚪ = Post-Pilot / Cleanup

## Abhängigkeits-Graph (Pilot-Kern)

```
T028 (Entscheidung, gemeinsam) ─┬─► T029 (Datenmodell-Doku)
                                └─► T019 (Routen-Cleanup)

T024 (Task-Schema) ─┬─► T025 (Task-API) ──► T026 (Task-UI, Steve)
                    └─► T027 (Auto-Trigger)

unabhängig startbar: T030, T031, T016, T022
Post-Pilot: T035 ──► T036 ; T032, T033, T034, T037 frei
```

## Parallele Lanes — so arbeitet ihr gleichzeitig ohne Kollision

**Sofort parallel (Welle 5):**
- **Andreas:** `T028` (kurz, gemeinsam entscheiden) → dann `T024` (Task-Schema) starten; `T030` (Doku-Quick-Win) dazwischen.
- **Steve:** `T016` (Onboarding-Wizard) — komplett unabhängig vom Backend, kein gemeinsames File. Ideal, während Andreas das Task-Backend baut.

**Danach (Welle 6–7):**
- **Andreas:** `T025` (Task-API, nach T024) → `T027` (Auto-Trigger, nach T024) → `T031` (Discord) → `T022`.
- **Steve:** sobald `T025` gemerged: `T026` (Task-Dashboard-UI). Vorher weiter an `T016`.

**Kollisions-Hinweise:**
- T024/T025/T027 (Backend) und T016/T026 (Frontend) berühren **unterschiedliche Verzeichnisse** → parallel safe.
- T028 zuerst gemeinsam klären — sonst driften T029 und T019 auseinander.
- Migrations-Nummern (T024, T035) bei parallelen PRs koordinieren (CLAUDE.md §6.5: bei Kollision umnummerieren).

## Empfohlene Reihenfolge (Pilot zuerst)
1. **T028** (gemeinsam, kurz) — entscheidet das Datenmodell-Zielbild.
2. **T024** (Andreas) + **T016** (Steve) parallel.
3. **T030** (Andreas, Quick-Win) + **T029** (nach T028).
4. **T025** → **T027** (Andreas), **T031** (Andreas), **T022** (Andreas).
5. **T026** (Steve, nach T025) — schließt die sichtbare „Admin-Seite wie früher"-Lücke.
6. Rest Post-Pilot (T019/T021/T023/T020 + T032–T037).

## Re-Drift-Schutz
- Jede Task nennt ihre Spec-§ in den **Spec-Referenzen** — vor Implementierung lesen.
- Konzept-Audit periodisch wiederholen (`konzept-auditor`-Agent) — der Default-Report liegt unter `_audit/`.
- Bei Schnittstellen-Änderung **zuerst Spec aktualisieren, dann Code** (CLAUDE.md §8).
