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
- [x] Eine Tabellenzeile mit einer Zelle aus ~4000 Wörtern erzeugt **mehrere Seiten** und es geht
      **kein** Text verloren (verifiziert durch Auslesen aller Text-Baselines aus den Content-Streams:
      keine Body-Zeile bei `y < bottomLimit`; Test schlägt gegen den alten Code fehl)
- [x] Regressions-Test: mehrzeilige Zelle, die noch auf eine Seite passt (`maxLines > 1`), bleibt unverändert korrekt (1 Seite)
- [x] **Grenzfall (Review-Fix):** Zeile knapp höher als eine Seite (`maxLines==53`, rowHeight ∈ (696.69, 717.89]) — Branch-Schwelle an Header-bereinigte Kapazität (`maxLines <= linesPerPage`) gekoppelt; reproduziert die y=68.69-Baseline gegen den 1. Fix-Stand, grün mit Korrektur
- [x] Bestehende PDF-Tests bleiben grün (jetzt 18 statt 14: +3 Paginierung/Grenzfall, +1 C1-Encoding-Nit)
- [x] `biome check` + build (tsc) sauber
- [ ] code-reviewer-Agent gibt OK

### Mit-Fix (Nit aus PR #204)
- [x] `text-encoding.ts` C1-Branch (0x80–0x9F) von totem `WIN1252_EXTRA.has(code)` auf `return false;`
      + erklärender Kommentar (die CP-1252-Sonderzeichen tragen hohe Unicode-Codepoints, der Set
      enthält keine 0x80–0x9F-Werte → Branch war immer `false`). Mit Test festgeschrieben.
- [ ] KPI-/keyValue-Werte-Clipping **bewusst ausgelassen** (echte Verhaltensänderung → eigener Scope)

---

## Spec-Referenzen
- Review-Kommentar PR #204 (Befund „überhohe Tabellenzeile → stiller Inhaltsverlust")
- `backend/src/core/pdf/document-builder.ts` (`renderTable`, `wrap`)
- `backend/src/core/pdf/README.md`

---

## Notes
- Optionaler Mit-Fix (Nits aus PR #204, nur wenn billig): KPI-/keyValue-Werte auf Box-/Spaltenbreite
  clippen; `text-encoding.ts` C1-Branch von totem `WIN1252_EXTRA.has(code)` auf `return false;` + Kommentar.
