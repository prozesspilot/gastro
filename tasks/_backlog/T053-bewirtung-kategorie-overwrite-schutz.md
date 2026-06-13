# T053 — Bewirtungs-Kategorie vor Overwrite durch categorize schützen

**ID:** T053
**Verantwortlich:** Andreas
**Priorität:** P2 (Datenqualität — Bewirtungs-Sonderfall)
**Branch:** `andreas/T053-bewirtung-overwrite`
**Geschätzt:** 0,5 Tag
**Dependencies:** T048 (categorize) gemerged
**Ziel-Meilenstein:** Pilot — Qualität
**Discord-Channel:** #dev-coordination
**Herkunft:** code-reviewer-Finding auf PR #113 (T048)

---

## Was zu tun ist

Der OCR-Worker (T008) setzt bei Bewirtungs-Detektor-Match bereits `category='bewirtung'` im `extracted`-Status und füllt `payload.bewirtung.{anlass,teilnehmer}`. T048 (`belege-categorize.handler`) überschreibt `category` **bedingungslos** mit dem KI-Resultat. Liefert die KI etwas anderes (z. B. niedrige Confidence → `sonstige_aufwand`), gehen die Bewirtungs-Pflichtfelder gegen eine Nicht-Bewirtungs-Kategorie verloren und die M05-Memo-Logik (`belege-voucher-builder.ts`) greift nicht mehr. (Mitigiert durch den `isBewirtung`-Prompt-Hinweis, aber nicht garantiert.)

**Ziel:** Eine bereits gesetzte `bewirtung`-Kategorie nicht verwerfen — z. B. bei `engine==='claude' && confidence < threshold` die Detektor-Kategorie als Vorschlag erhalten / in `requires_review` die Vorgänger-Kategorie nicht überschreiben.

---

## Akzeptanz-Kriterien

- [ ] Detektor-gesetzte `bewirtung`-Kategorie geht durch categorize nicht verloren, wenn die KI unsicher ist
- [ ] `payload.bewirtung.{anlass,teilnehmer}` bleiben konsistent zur finalen Kategorie
- [ ] Test für den Bewirtung-Konflikt-Fall
- [ ] CI grün

---

## Spec-Referenzen

- `backend/src/modules/m03-categorization/handlers/belege-categorize.handler.ts`
- `backend/src/modules/m01-receipt-intake/services/ocr.service.ts` (Bewirtungs-category-Setzung)
- `backend/src/modules/m05-lexoffice/services/belege-voucher-builder.ts` (Memo-Logik)
