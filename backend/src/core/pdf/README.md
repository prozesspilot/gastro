# core/pdf — PDF-Engine

Generische, modul-unabhängige PDF-Erzeugung. Reine **Buffer-API** (kein File-IO) —
der Caller lädt die Bytes selbst nach MinIO/S3.

Zwei Bausteine:

| Datei | Zweck |
|---|---|
| `image-to-pdf.ts` | Ein Bild (JPEG/PNG/TIFF/WebP) → einseitiges PDF (M02-Archivierung) |
| `document-builder.ts` | Strukturierte Berichte (Überschriften, Tabellen, KPIs) → mehrseitiges PDF |

## Warum `pdf-lib` und nicht puppeteer?

Die M08-Spec (§9) nennt `puppeteer` + `chartjs-node-canvas` (HTML→PDF via Headless-Chromium).
Für den **RAM-/Swap-knappen IONOS-Prod-Server** (kein Chromium installiert; n8n musste wegen
RAM deaktiviert werden) ist das zu schwer. `pdf-lib` läuft **rein in-process** ohne Browser.
Diagramme — falls je nötig — kommen später als vektorielle `pdf-lib`-Balken, nicht über Chart.js.

## Nutzung

```ts
import { PdfDocumentBuilder } from '../../core/pdf';

const pdf = await new PdfDocumentBuilder({ title: 'Monatsbericht Mai 2026' })
  .heading('Monatsbericht Mai 2026')
  .kpiCards([
    { label: 'Belege', value: '47' },
    { label: 'Brutto', value: '4.234,17 €' },
    { label: 'Veränderung', value: '+12 %' },
  ])
  .heading('Top-Lieferanten', 2)
  .table({
    columns: [
      { header: 'Lieferant', width: 3 },
      { header: 'Belege', width: 1, align: 'right' },
      { header: 'Summe', width: 1, align: 'right' },
    ],
    rows: [
      ['Metro AG', '12', '2.890,45 €'],
      ['Edeka Großmarkt', '8', '743,10 €'],
    ],
  })
  .build(); // → Buffer

// danach: await storage.upload(objectKey, pdf, 'application/pdf')
```

### Bausteine des `PdfDocumentBuilder`

- `heading(text, level?)` — Überschrift (Level 1 mit Markenfarbe + Trennlinie, Level 2 kleiner).
- `paragraph(text)` — Fließtext mit Word-Wrap.
- `keyValueRows([{ label, value }])` — Label/Wert-Block (z. B. Kennzahlen).
- `kpiCards([{ label, value }])` — gerahmte Karten, max. 3 pro Reihe.
- `table({ columns, rows, zebra? })` — Tabelle mit Auto-Seitenumbruch (Kopfzeile wiederholt sich).
- `spacer(height)` — vertikaler Abstand.
- `build()` — rendert + setzt Fußzeile (`Seite X / Y` + Erstellungsdatum) auf jeder Seite.

Alle Methoden außer `build()` sind synchron und chainbar.

## WinAnsi-Falle

Der Standardfont (Helvetica, WinAnsi/CP-1252) kann ä/ö/ü/ß/€ und gängige Interpunktion,
**wirft** aber bei Emojis/CJK/exotischem Unicode. Da OCR-Lieferantennamen beliebigen Unicode
enthalten können, schleust der Builder **jeden** Text durch `toWinAnsiSafe` — nicht
kodierbare Zeichen werden zu `?`. Der Report crasht nie an einem exotischen Zeichen.

## GoBD-Metadata

`build()` setzt `Producer='ProzessPilot'`, `Title`, `CreationDate`. Für deterministische
Tests `opts.now` injizieren.

## Was hier NICHT lebt (Folge-Tasks)

- M08-Aggregation/Routen/Migration → T087
- Echte Diagramme, Custom-Branding-Hook
- Embedded-TrueType-Fonts (`@pdf-lib/fontkit`)
- MinIO-Upload (macht der Caller)
