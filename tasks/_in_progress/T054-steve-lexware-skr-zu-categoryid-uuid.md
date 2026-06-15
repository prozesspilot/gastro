# T054 — Lexware-Export: SKR-Konto → Lexoffice-categoryId-UUID angleichen (Buchungs-Endpunkt)

**ID:** T054
**Verantwortlich:** Steve
**Priorität:** P1 (Blocker vor dem ersten echten Lexware-Export — sonst wird falsch gebucht)
**Branch:** `steve/T054-categoryid-mapping`
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

- [x] Für alle 14 Kategorien löst `mapSkrToLexoffice` über die aus `SYSTEM_CATEGORIES` abgeleitete Heuristik auf die richtige Lexoffice-categoryId auf — Test deckt 14/14 ab, keine auf Sonstige (außer `sonstige_aufwand`)
- [x] `lexoffice_category_map` hat eine Migration (+ Rollback) — `120_lexoffice_category_map.sql` mit RLS (eigener Tenant + globale `'default'`-Zeilen)
- [x] Test, der den SKR→UUID-Pfad für die 14 Konten abdeckt (gemocktes `listCategories`) — `category.mapper.test.ts` (22 Tests)
- [x] Bewirtung (SKR03 4650 / SKR04 6640) landet nicht mehr auf „Sonstige" — eigener Test
- [x] CI grün; **manuelle** Verifikation gegen den echten Lexware-Account als Setup-Schritt dokumentiert (`MANUELLE_AUFGABEN.md`, T054)

**Gewählte Lösungsrichtung:** A (Migration) + B (Heuristik aus SSoT) kombiniert — siehe unten.

---

## Umsetzung (2026-06-14, Steve)

- **Migration `120_lexoffice_category_map.sql` (+ Rollback):** legt die zuvor fehlende
  „Geister-Tabelle" an. `customer_id TEXT` (Tenant-UUID oder `'default'`), PK `(customer_id, skr_account)`.
  RLS nach Repo-Muster: eigene Zeilen + globale `'default'`-Zeilen lesbar, nur eigene schreibbar.
- **`CategoryMapper` RLS-fest:** alle DB-Ops laufen auf EINER Connection mit transaktions-lokalem
  `app.current_tenant` (sonst sähe der Tenant unter FORCE RLS seine Zeilen nicht). Best-effort-
  Cache-INSERTs über SAVEPOINTs, damit ein Schreibfehler die Auflösung nicht kippt.
- **Heuristik aus `SYSTEM_CATEGORIES`:** neue `categoryIdForSkrAccount` (Reverse-Lookup SKR→Kategorie
  über beide Kontenrahmen) ersetzt die alte, fremd-verschlüsselte SKR-Map. Needles auf die
  Lexware-Standardnamen gegründet (recherchiert: Bewirtungskosten, Reisekosten, Telekommunikation,
  Wareneingang …). → vierte Divergenz-Achse strukturell weg, chart-korrekt.
- **Grenze (bewusst):** die exakten Kategorienamen pro Account sind öffentlich nicht vollständig
  enumeriert → einmalige Verifikation gegen den echten Pilot-Account ist ein manueller Setup-Schritt.

---

## Review-Nachschärfung (PR #124, code-reviewer)

- **MAJOR #1 (Bug) gefixt:** `pickByHeuristic` war API-Reihenfolge-abhängig (food konnte auf die
  non-food-`categoryId` kippen). Jetzt Needle-für-Needle, spezifischste zuerst → reihenfolge-
  unabhängig. Test mit umgedrehter Lexware-Reihenfolge ergänzt.
- **MAJOR #2 (Test) gefixt:** echter RLS-Integration-Test `lexoffice-category-map-rls.test.ts`
  (Muster wie T041, `SET LOCAL ROLE gastro_app`, läuft in CI gegen Postgres): Cross-Tenant-Read
  blockt, `'default'` nicht schreib-/löschbar, fremde customer_id nicht schreibbar.
- **MINORs:** Mapper-Auflösung aus dem Retry-Loop memoisiert (kein 3×-Connect pro Beleg);
  Policy-Kommentar in der Migration; Release-im-Throw-Assertion; Branch/Verantwortlich korrigiert.

---

## Spec-Referenzen

- `backend/src/core/adapters/booking/lexoffice/category.mapper.ts` (Heuristik + DB-Lookup)
- `backend/src/modules/m05-lexoffice/services/resolve-export-skr.ts` (liefert den SKR-String)
- `backend/src/modules/m03-categorization/system-categories.ts` (Kontenrahmen-Konten)
- `backend/migrations/` (fehlende `lexoffice_category_map`-Migration)
- `Modulkonzept/Konzeptentwicklung/modules/M05_Lexoffice_Integration.md`
