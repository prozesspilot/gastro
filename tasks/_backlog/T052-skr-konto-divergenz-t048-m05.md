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

- [ ] T048-angezeigter `skr_account` == von M05 real gebuchter SKR (für alle 14 Kategorien, SKR03 + SKR04)
- [ ] Bewirtung: 70%-abziehbar-Konto konsistent (kein „6640" vs „6644"-Konflikt)
- [ ] Single-Source dokumentiert; Test, der die Maps gegeneinander prüft
- [ ] CI grün

---

## Spec-Referenzen

- `backend/src/modules/m03-categorization/system-categories.ts`
- `backend/src/modules/m05-lexoffice/services/category-skr-map.ts`
- `Modulkonzept/Konzeptentwicklung/modules/M03_Kategorisierung.md` (SKR-Mapping)
