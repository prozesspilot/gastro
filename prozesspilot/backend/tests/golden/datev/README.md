# DATEV Golden Files

Diese Golden-Files enthalten Referenz-CSV-Daten für DATEV-Format-510-Validierung.

## Format-Anforderungen (DATEV Format 510)

1. Zeile 1: `"EXTF";700;...` (Kopfzeile)
2. BOM: UTF-8 BOM vorhanden (`﻿`)
3. Dezimaltrenner: Komma (kein Punkt)
4. Belegdatum: DDMM-Format (4 Zeichen)
5. BU-Schlüssel: 19% → "9", 7% → "2", 0% → "40"
6. Belegfeld 1: max 12 Zeichen
7. Buchungstext: max 60 Zeichen
8. Umsatz: positiv, Soll/Haben in Spalte "S/H" ("S" oder "H")

## Testfälle

- `case_01_lebensmittel.csv` — Wareneinkauf 19%, SKR03 3100
- `case_02_energie.csv` — Energie 19%, SKR03 4240
- `case_03_mischtaxe.csv` — Mischsatz 7%+19% (zwei Zeilen)
- `case_04_steuerfrei.csv` — Steuerfreie Leistung, BU-Schlüssel 40

## Verwendung in Tests

```ts
import { renderDatevCsv } from '../../../src/modules/m04-datev/services/csv-renderer';
import { readFileSync } from 'fs';

const expected = readFileSync('./tests/golden/datev/case_01_lebensmittel.csv', 'utf-8');
const actual = renderDatevCsv(receipts, profile);
expect(actual).toBe(expected);
```
