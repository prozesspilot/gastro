# T088 — PDF-Engine: zell-interne Paginierung überhoher Tabellenzeilen

**ID:** T088
**Verantwortlich:** Steve
**Priorität:** P3 (pathologischer Edge-Case, kein Crash — stiller Inhaltsverlust nur bei Riesen-Zelltext)
**Branch:** `steve/T088-pdf-table-row-pagination`
**Geschätzt:** 0,5 Tag
**Dependencies:** T086 (PDF-Engine) ✅ gemergt
**Ziel-Meilenstein:** Build-out Phase A
**Anker:** Review-Befund PR #204 (code-reviewer) · `backend/src/core/pdf/document-builder.ts` `renderTable`

---

## Was zu tun ist

Im `renderTable` von `backend/src/core/pdf/document-builder.ts` den Fall behandeln, dass eine
**einzelne Tabellenzeile höher als die Seiten-Nutzhöhe** ist (eine Zelle mit sehr vielen
umgebrochenen Zeilen, z. B. ein DSGVO-Text-Blob). Aktuell fügt der Row-Break nur **eine** neue
Seite hinzu; ist `rowHeight` größer als die Nutzhöhe (~717 pt), setzt `this.y -= rowHeight` den
Cursor ins Negative und die unteren Cell-Lines werden bei negativem `y` (unsichtbar, über/unter
der Fußzeile) gezeichnet → **stiller Inhaltsverlust**. Kein Crash, keine Endlosschleife.

Für reale Report-Zeilen (Lieferant/Anzahl/Summe = kurz) irrelevant; relevant wird es erst, wenn
die Engine für DSGVO-Auskunft/GoBD-Doku mit langen Freitext-Zellen genutzt wird.

### Lösungsskizze
- Wenn `rowHeight > pageContentHeight`: die Cell-Lines **seitenweise** zeichnen — pro Seite so
  viele Zeilen wie passen, dann neue Seite + (optional) Header-Wiederholung, Rest weiter.
  Alternativ als pragmatische Untergrenze: die Zeile in Sub-Zeilen-Blöcke à „passt auf eine Seite"
  splitten und jeden Block wie eine eigene Tabellenzeile (ohne Zebra-Versatz-Bruch) behandeln.
- Zebra-Hintergrund + Spalten-Trennung über den Seitenumbruch hinweg konsistent halten.

---

## Akzeptanz-Kriterien
- [ ] Eine Tabellenzeile mit einer Zelle aus ~1200 Wörtern erzeugt **mehrere Seiten** und es geht
      **kein** Text verloren (keine Zeile bei `y < bottomLimit` gezeichnet)
- [ ] Regressions-Test: mehrzeilige Zelle, die noch auf eine Seite passt (`maxLines > 1`), bleibt unverändert korrekt
- [ ] Bestehende 14 PDF-Tests bleiben grün
- [ ] `biome check` + typecheck + build sauber
- [ ] code-reviewer-Agent gibt OK

---

## Spec-Referenzen
- Review-Kommentar PR #204 (Befund „überhohe Tabellenzeile → stiller Inhaltsverlust")
- `backend/src/core/pdf/document-builder.ts` (`renderTable`, `wrap`)
- `backend/src/core/pdf/README.md`

---

## Notes
- Optionaler Mit-Fix (Nits aus PR #204, nur wenn billig): KPI-/keyValue-Werte auf Box-/Spaltenbreite
  clippen; `text-encoding.ts` C1-Branch von totem `WIN1252_EXTRA.has(code)` auf `return false;` + Kommentar.
