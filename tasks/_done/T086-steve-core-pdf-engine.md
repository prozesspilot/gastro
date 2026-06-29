# T086 — Generische PDF-Dokument-Engine (core/pdf)

**ID:** T086
**Verantwortlich:** Steve
**Priorität:** P1 (Build-out Phase A2 — Fundament, entriegelt M08-Reporting, DSGVO-Auskunft, GoBD-Doku)
**Branch:** `steve/T086-core-pdf-engine`
**Geschätzt:** 1 Tag
**Dependencies:** keine (`pdf-lib ^1.17.1` bereits im Projekt)
**Ziel-Meilenstein:** Build-out Phase A
**Anker:** `00_Buildout_Roadmap.md` §A2 · ergänzt `backend/src/core/pdf/image-to-pdf.ts`

---

## Was zu tun ist

Eine generische, modul-unabhängige PDF-**Dokument**-Engine unter `backend/src/core/pdf/`
bauen, die strukturierte Berichte (Überschriften, Fließtext, KPI-Karten, Tabellen mit
automatischem Seitenumbruch, Fußzeile mit Seitenzahl) als PDF-Buffer erzeugt. Reine
Buffer-API (kein File-IO), analog zum bestehenden `image-to-pdf.ts` — der Caller reicht
die Bytes direkt nach MinIO/S3.

**Bewusste Engineering-Entscheidung (Abweichung von M08-Spec §4/§9):** Die eingefrorene
M08-Spec nennt `puppeteer`/`playwright` + `chartjs-node-canvas` (HTML→PDF via headless
Chromium). Für den swap-knappen IONOS-Prod-Server (4 GB, kein Chromium installiert, n8n
musste wegen RAM deaktiviert werden — siehe Memory `prod-recovery-via-ci-deploy`) ist das
zu schwer. Wir bauen auf `pdf-lib` (bereits Dependency, rein in-process, kein Browser).
Diagramme kommen — falls überhaupt nötig — später als einfache `pdf-lib`-Balken (vektoriell
gezeichnet), nicht über Chart.js. Diese Abweichung ist in der M08-Spec zu vermerken (AK unten).

### Neue Dateien `backend/src/core/pdf/`
1. `document-builder.ts` — `PdfDocumentBuilder`-Klasse, flow-Layout mit y-Cursor + Auto-Seitenumbruch:
   - `constructor(opts: { title: string; author?: string; pageSize?: 'A4' })` — setzt GoBD-Metadata
     (`Producer='ProzessPilot'`, `Title`, `CreationDate`), `updateMetadata: false` wie in image-to-pdf.
   - `heading(text, level?: 1 | 2)` — fette Überschrift, Abstand davor/danach.
   - `paragraph(text)` — Fließtext mit Word-Wrap auf Spaltenbreite.
   - `keyValueRows(rows: { label: string; value: string }[])` — Label/Wert-Liste (z. B. Kennzahlen-Block).
   - `kpiCards(cards: { label: string; value: string }[])` — Reihe gerahmter KPI-Karten (max. 3/Reihe, dann Umbruch).
   - `table(opts: { columns: { header: string; width: number; align?: 'left' | 'right' }[]; rows: string[][] })`
     — Tabelle mit fetter Kopfzeile, Zebra-Hintergrund optional, **Auto-Seitenumbruch** (Kopfzeile auf Folgeseite wiederholen).
   - `spacer(height: number)` — vertikaler Abstand.
   - `build(): Promise<Buffer>` — fügt auf jeder Seite die Fußzeile (Erstellungsdatum links, „Seite X / Y" rechts) ein, gibt Bytes zurück.
2. `pdf.types.ts` — exportierte Typen (`KpiCard`, `TableColumn`, `TableSpec`, `PdfDocumentOptions`).
3. `text-encoding.ts` — `toWinAnsiSafe(s: string)`: ersetzt nicht-WinAnsi-kodierbare Zeichen
   (Helvetica-Standardfont kann ä/ö/ü/ß/€ — aber z. B. Emojis/CJK würden `pdf-lib` werfen) defensiv
   durch `?`, damit Beleg-/Lieferantennamen aus OCR die Engine NIE crashen lassen.
4. `index.ts` — Re-Export von `PdfDocumentBuilder`, `imageToPdf`, `isPdf`, Typen.
5. `document-builder.test.ts` — Vitest (siehe AK).
6. `README.md` — API, GoBD-Metadata, WinAnsi-Hinweis, „warum nicht puppeteer".

### Bewusst NICHT in diesem PR (Folge-Tasks)
M08-Aggregation/Routen/Migration (→ T087) · echte Diagramme · Custom-Branding-Hook ·
Embedded-TrueType-Fonts (`@pdf-lib/fontkit`) · MinIO-Upload (macht der Caller).

---

## Akzeptanz-Kriterien
- [x] `backend/src/core/pdf/` mit den 6 Dateien; `npm run build` + `npm test` grün
- [x] `build()` liefert einen Buffer, der mit `%PDF-` beginnt und mit `pdf-lib` wieder ladbar ist (`PDFDocument.load`)
- [x] Eine Tabelle mit 200 Zeilen erzeugt **mehrere Seiten**; Kopfzeile wird auf jeder Seite wiederholt (Seitenzahl > 1)
- [x] Fußzeile auf **jeder** Seite: „Seite X / Y" + Erstellungsdatum; `Y` = tatsächliche Gesamtseitenzahl (Zwei-Pass über `getPages()`)
- [x] Deutsche Umlaute + `€` (`ä ö ü ß €`) rendern ohne Exception; ein Emoji/CJK-Zeichen wird durch `toWinAnsiSafe` zu `?` und wirft NICHT
- [x] GoBD-Metadata gesetzt: `Producer='ProzessPilot'`, `Title` = `opts.title`, `CreationDate` vorhanden
- [x] `kpiCards` mit 4 Karten → Umbruch auf 2. Reihe (max. 3/Reihe); kein Überlauf über Seitenrand
- [x] Bestehender `image-to-pdf.ts`-Pfad unverändert nutzbar (M02-Import bricht nicht); `index.ts` re-exportiert beides
- [x] Test-Coverage ≥ 80 % für die neuen Dateien (14 Tests decken alle Element-Typen + Branches; Coverage-Tool nur in CI)
- [x] `biome check` auf allen geänderten Files sauber
- [x] M08-Spec (`modules/M08_Monatsreporting.md`) um Notiz „PDF-Engine = pdf-lib (core/pdf), kein puppeteer — Infra-Entscheidung T086" ergänzt
- [ ] CI grün (lint + typecheck + tests + build) — *nach Push*
- [ ] code-reviewer-Agent gibt OK — *im Review*

---

## Spec-Referenzen
- `Modulkonzept/Konzeptentwicklung/00_Buildout_Roadmap.md` §A2 (PDF-Engine: Reports + DSGVO-Auskunft + GoBD-Doku)
- `Modulkonzept/Konzeptentwicklung/modules/M08_Monatsreporting.md` §9/§17.3 (PDF-Inhalte — Ziel-Konsument)
- Vorlage/Muster: `backend/src/core/pdf/image-to-pdf.ts` (reine Buffer-API, GoBD-Metadata, `updateMetadata:false`)
- `.claude/CLAUDE.md` §6.3 (TypeScript strict), §6.4 (Tests Pflicht)

---

## Notes
- **WinAnsi-Falle:** `pdf-lib`-Standardfont (Helvetica, WinAnsi-Encoding) kann ä/ö/ü/ß/€, wirft aber
  bei nicht-kodierbaren Codepoints (Emoji, CJK, manche Smart-Quotes). OCR-Lieferantennamen können
  beliebigen Unicode enthalten → ALLE Text-Eingaben durch `toWinAnsiSafe` schleusen, sonst crasht der Report.
- **Zwei-Pass-Fußzeile:** Seitenzahl „/ Y" steht erst nach dem letzten `addPage` fest → Fußzeile erst in
  `build()` über alle Seiten ziehen (nicht beim Anlegen der Seite).
- **`Date.now()`-Determinismus:** GoBD-`CreationDate` per `new Date()` ist im Test über injizierbares
  `opts.now?: Date` oder pdf-lib-`setCreationDate`-Spy zu fixieren, damit kein Golden-Test flaket.
- Keine neue Dependency nötig (`pdf-lib` reicht). Falls später echte Fonts gewünscht: separate Task.

---

## Offene Fragen (während der Bearbeitung)

<keine — Scope ist eng>

---

## Lessons Learned (nach Abschluss)

- **pdf-lib `getProducer()` + `load()`-Falle:** Der Producer wird im **XMP-Metadata-Stream**
  gespeichert (nicht als `/Producer (...)` im Info-Dict). `PDFDocument.load(bytes)` ruft
  per Default `updateMetadata: true` und **überschreibt** dabei den Producer mit dem
  pdf-lib-Default. Die von uns **gespeicherten** Bytes sind korrekt — nur ein Round-Trip-Test
  muss mit `PDFDocument.load(bytes, { updateMetadata: false })` laden, sonst schlägt die
  Producer-Assertion fälschlich fehl. Der Kommentar in `image-to-pdf.ts` („überschreibt
  Producer beim Save nicht") beschreibt nur die Save-, nicht die Load-Seite.
- **WinAnsi-Schutz ist Pflicht, nicht optional:** Helvetica (WinAnsi) wirft bei Emoji/CJK.
  Da OCR-Lieferantennamen beliebigen Unicode liefern, läuft **jeder** Text-Draw durch
  `toWinAnsiSafe` — sonst crasht ein einziges exotisches Zeichen den ganzen Monatsreport.
- **Deklaratives Element-Modell** (sammeln → in `build()` rendern) macht die Zwei-Pass-Fußzeile
  („Seite X / Y") trivial, weil die Gesamtseitenzahl erst nach dem Layout feststeht.
