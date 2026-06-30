# T055 — Bewirtungs-Memo-Felder an category='bewirtung' koppeln (stale-Schutz)

**ID:** T055
**Verantwortlich:** Andreas
**Priorität:** P3 (Datenqualität — seltener Randfall)
**Branch:** `andreas/T055-bewirtung-memo-gate`
**Geschätzt:** 0,25 Tag
**Dependencies:** T053 gemerged
**Ziel-Meilenstein:** Post-Pilot / Qualität
**Herkunft:** code-reviewer-Finding (MINOR) auf PR #127 (T053)

---

## Was zu tun ist

Der M05-Voucher-Builder (`belege-voucher-builder.ts:98-100`) hängt `bewirtung_anlass`/`bewirtung_teilnehmer`
**unabhängig von `beleg.category`** ans Lexoffice-Memo (Bedingung ist nur `if (fields.bewirtung_anlass)`,
kein category-Gate).

Folge-Szenario seit T053: Setzt der OCR-Detektor `category='bewirtung'` + die Bewirtungs-Felder, und
**überschreibt dann eine SICHERE KI** die Kategorie auf z. B. `wareneinkauf_food` (T053-Scope: sichere KI
gewinnt), bleiben die Bewirtungs-Felder im payload. Der so gebuchte Nicht-Bewirtungs-Beleg trägt dann
trotzdem „Anlass/Teilnehmer" im Memo. Reiner Kontext-Text (kein Buchungswert), aber irreführend.

Das ist **vorbestehend** (Voucher-Builder-Verhalten), T053 hat es nur sichtbarer gemacht.

**Ziel (eine der beiden Optionen):**
- **A:** Memo-Zeilen `Anlass:`/`Teilnehmer:` nur anhängen, wenn `beleg.category === 'bewirtung'` (category-Gate im Voucher-Builder), oder
- **B:** Beim Overwrite einer Detektor-Bewirtung durch eine sichere KI die stale Bewirtungs-Felder
  (`payload.extraction.fields.bewirtung_*` + `payload.bewirtung`) im categorize-Handler löschen.

Option A ist kleiner und lokal; bevorzugt.

---

## Akzeptanz-Kriterien

- [x] Ein als Nicht-Bewirtung gebuchter Beleg trägt KEINE `Anlass:`/`Teilnehmer:`-Memo-Zeilen
      (Option A: category-Gate `beleg.category === 'bewirtung'` im Voucher-Builder, Zeilen 99–104)
- [x] Bewirtungs-Belege tragen sie weiterhin (bestehender Test unverändert grün)
- [x] Test für beide Fälle (2 neue Tests: Nicht-Bewirtung mit stale-Feldern + category=null; beide
      reproduzieren den Bug gegen den alten Code, grün mit Fix)
- [x] Build (tsc) + `biome check` (296 Dateien) + 109 M05-Tests grün

---

## Spec-Referenzen

- `backend/src/modules/m05-lexoffice/services/belege-voucher-builder.ts` (Memo-Zeilen 98-100)
- `backend/src/modules/m03-categorization/handlers/belege-categorize.handler.ts` (T053-Overwrite-Stelle)
