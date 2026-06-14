# T054 — Lexware-Export: SKR-Konto → Lexoffice-categoryId-UUID angleichen (Buchungs-Endpunkt)

**ID:** T054
**Verantwortlich:** Andreas
**Priorität:** P1 (Blocker vor dem ersten echten Lexware-Export — sonst wird falsch gebucht)
**Branch:** `andreas/T054-skr-categoryid-mapping`
**Geschätzt:** 1 Tag
**Dependencies:** T052 (SKR-Konto-SSoT) gemerged
**Ziel-Meilenstein:** Pilot — Qualität vor F-Export
**Discord-Channel:** #dev-coordination
**Herkunft:** code-reviewer-Finding #1 auf PR #122 (T052)

---

## Was zu tun ist

T052 hat sichergestellt, dass das **angezeigte** SKR-Konto == dem **an M05 übergebenen** SKR-Konto-String ist (Single Source of Truth: `system-categories.ts` → `resolve-export-skr.ts`). Die Garantie endet aber **eine Ebene zu früh**: Lexware bucht nicht über den SKR-String, sondern über die **Lexoffice-`categoryId`-UUID**, die `core/adapters/booking/lexoffice/category.mapper.ts::mapSkrToLexoffice` auflöst.

Zwei Probleme an dieser Übersetzung:

1. **Heuristik-Mismatch:** `pickByHeuristic` (`category.mapper.ts` Z. ~95-123) ist mit einem **abweichenden** SKR-Satz verschlüsselt (z. B. `4100`, `4600`, `4200`) als `system-categories.ts` jetzt einspeist (`4120`, `4610`, …). Konkret matchen nur ~5 von 14 Kategorien; ~8 (u. a. **Bewirtung** `4650`, `personal`, `marketing`, `reise`, `buerokosten`, `reparatur`, `steuer`, `kommunikation`) fallen auf die `FALLBACK_SONSTIGE`-UUID. `sonstige_aufwand` (`4900`) matcht sogar mit falschen Needles (`fortbildung/schulung/weiterbildung`). → Der Wirt sieht „Bewirtung 4650", gebucht wird „Sonstige".

2. **Geister-Tabelle:** `lexoffice_category_map` (von `mapSkrToLexoffice` per `SELECT` gelesen) existiert in **keiner** Migration unter `backend/migrations/`. In Prod wirft der Lookup, **bevor** die Heuristik überhaupt greift (vgl. CLAUDE.md §3.1, Memory `legacy-welt-schema-drift`).

**Ziel:** „angezeigt == gebucht" auch am echten Buchungs-Endpunkt (categoryId-UUID), für alle 14 Kategorien im gewählten Kontenrahmen (`PILOT_SKR_CHART`).

**Lösungsrichtung (zu entscheiden):**
- **A (bevorzugt):** Migration für `lexoffice_category_map` + Seed der 14 SKR-Konten → echte Lexoffice-categoryId-UUIDs pro Tenant (einmaliger Setup-Schritt, evtl. via `listCategories`-Abgleich). Heuristik bleibt nur Notnagel.
- **B:** `pickByHeuristic`-Map auf die `system-categories.ts`-Konten umschlüsseln (schneller, aber bleibt rate-/namens-abhängig und fragil).

---

## Akzeptanz-Kriterien

- [ ] Für alle 14 Kategorien (im `PILOT_SKR_CHART`) löst `mapSkrToLexoffice` auf die **fachlich korrekte** Lexoffice-categoryId auf — nicht auf die Sonstige-UUID (außer für `sonstige_aufwand`)
- [ ] `lexoffice_category_map` hat eine Migration (+ Rollback) ODER der Pfad kommt nachweislich ohne diese Tabelle aus
- [ ] Test, der den SKR→UUID-Pfad für die 14 Konten abdeckt (mit gemocktem `listCategories`/Seed)
- [ ] Bewirtung landet nicht mehr auf „Sonstige"
- [ ] CI grün; manueller Smoke-Test (Beleg bis Lexware) dokumentiert

---

## Spec-Referenzen

- `backend/src/core/adapters/booking/lexoffice/category.mapper.ts` (Heuristik + DB-Lookup)
- `backend/src/modules/m05-lexoffice/services/resolve-export-skr.ts` (liefert den SKR-String)
- `backend/src/modules/m03-categorization/system-categories.ts` (Kontenrahmen-Konten)
- `backend/migrations/` (fehlende `lexoffice_category_map`-Migration)
- `Modulkonzept/Konzeptentwicklung/modules/M05_Lexoffice_Integration.md`
