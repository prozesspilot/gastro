# T052 — SKR-Konto-Divergenz T048 (categorize) ↔ M05 (Lexware-Export) vereinheitlichen

**ID:** T052
**Verantwortlich:** Andreas
**Priorität:** P1 (vor M05-Pilot-Export — angezeigter SKR ≠ gebuchter SKR ist falsch/verwirrend)
**Branch:** `andreas/T052-skr-divergenz`
**Geschätzt:** 0,5 Tag
**Dependencies:** T048 (categorize) gemerged
**Ziel-Meilenstein:** Pilot — Qualität vor F-Export
**Discord-Channel:** #dev-coordination
**Herkunft:** code-reviewer-Finding auf PR #113 (T048)

---

## Was zu tun ist

T048 zeigt dem Mitarbeiter/Wirt ein `skr_account` aus `system-categories.ts` (z. B. `bewirtung` → SKR04 `6640`, `wareneinkauf_food` → `5100`). Der **tatsächliche** Lexware-Export bucht aber über `m05-lexoffice/services/category-skr-map.ts` (`categoryToSkr04`) mit **anderen** Werten (z. B. `bewirtung` → `6644` „abziehbar 70 %", `wareneinkauf_food` → `5400`). M05 liest `payload.categorization.skr_account` **nicht**. Folge: der angezeigte weicht vom gebuchten SKR ab — vor allem bei der Bewirtungs-70%-Regel potenziell falsch.

**Ziel:** EINE Quelle der Wahrheit für SKR-Konten. Entweder `category-skr-map.ts` (M05) als Master und `system-categories.ts` daraus speisen, oder die SKR04-Werte in `system-categories.ts` an `category-skr-map.ts` angleichen + dokumentieren.

---

## Akzeptanz-Kriterien

- [x] T048-angezeigter `skr_account` == von M05 real gebuchter SKR (für alle 14 Kategorien, SKR03 + SKR04) — **strukturell garantiert**: M05 konsumiert den persistierten Wert; 28 Tests (14 Kat. × 2 Kontenrahmen) in `resolve-export-skr.test.ts`
- [x] Bewirtung: 70%-abziehbar-Konto konsistent (kein „6640" vs „6644"-Konflikt) — Konflikt aufgelöst: die abweichende `6644`-Map (`category-skr-map.ts`) ist entfernt, es gibt nur noch *einen* Bewirtungs-Wert (`SYSTEM_CATEGORIES`). Ob `6644` (70%) der *fachlich* korrekte SKR04-Wert ist, hängt an der Kontenrahmen-Frage unten.
- [x] Single-Source dokumentiert; Test, der die Pfade gegeneinander prüft — `resolve-export-skr.ts` + Test
- [x] CI grün — Build + 587 Tests grün, Biome sauber (lokal; CI via PR)

---

## Umsetzung (2026-06-14, Steve)

**Ansatz: „einmal entscheiden, persistierten Wert konsumieren" (strukturell sauber).**

Befund war größer als die Task vermutete — **vier** Divergenz-Achsen: (1) Werte, (2) Vokabular
(M05-IDs wie `reisekosten`/`buerobedarf` existieren in den 14 KI-Kategorien nicht → fast alles fiel
auf `4980`), (3) Kontenrahmen (T048=SKR03, M05=SKR04 → garantiert verschieden), (4) der
`category.mapper`-Heuristik-Fallback ist mit SKR03-Nummern verschlüsselt.

Lösung:
- `system-categories.ts` ist die **einzige Quelle** (14 Kategorien, SKR03 + SKR04) + neuer zentraler
  Kontenrahmen-Schalter `PILOT_SKR_CHART`.
- M05 liest künftig den bei der Kategorisierung **persistierten** `payload.categorization.skr_account`
  (`resolve-export-skr.ts`) statt selbst neu zu rechnen → angezeigt == gebucht per Konstruktion,
  unabhängig vom Kontenrahmen. Fallback (Beleg ohne Kategorisierung) läuft ebenfalls über
  `SYSTEM_CATEGORIES`, nie über einen zweiten Pfad.
- Die abweichende `category-skr-map.ts` (+ Test) wurde **gelöscht**.
- `belege-categorize.handler.ts` nutzt jetzt `PILOT_SKR_CHART` statt Literal `'SKR03'`.

## OFFENE FRAGE (an die Steuerberaterin — blockiert NICHT diesen PR)

**Welchen Kontenrahmen führt die Pilot-Steuerberaterin (Lexware Office): SKR03 oder SKR04?**
Aktuell `PILOT_SKR_CHART = 'SKR03'` (Status quo des categorize-Handlers). Code-Intent (M05,
Bewirtungs-Detektor `6644`/`6645`, `ocr.service`) deutete dagegen auf SKR04. Weil M05 den
persistierten Wert konsumiert, ist die Konsistenz **kontenrahmen-neutral** — die Wahl ist nur noch
*ein* Schalter (`PILOT_SKR_CHART`). Mit der Antwort: ggf. auf `'SKR04'` umstellen UND die SKR04-Werte
für Bewirtung (70%-abziehbar: `6640` vs. `6644`) und `wareneinkauf_food` (`5100` vs. `5400`) in
`system-categories.ts` mit der Steuerberaterin bestätigen. → Folge-Task, sobald beantwortet.

---

## Spec-Referenzen

- `backend/src/modules/m03-categorization/system-categories.ts` (SSoT + `PILOT_SKR_CHART`)
- `backend/src/modules/m05-lexoffice/services/resolve-export-skr.ts` (Export-Resolver, T052)
- `backend/src/modules/m05-lexoffice/services/belege-lexware-exporter.ts` (konsumiert den Resolver)
- `Modulkonzept/Konzeptentwicklung/modules/M03_Kategorisierung.md` (SKR-Mapping)
