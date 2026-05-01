# Load Test Fixtures

## test-receipt.pdf

Die Upload-Tests benoetigen eine Datei `fixtures/test-receipt.pdf`.

### Option 1 — Generierungsskript ausfuehren (empfohlen)

```bash
chmod +x fixtures/generate-test-pdf.sh
./fixtures/generate-test-pdf.sh
```

Das Skript versucht in dieser Reihenfolge:
1. Python3 + `fpdf2` (`pip install fpdf2`)
2. Python3 + `reportlab` (`pip install reportlab`)
3. Minimales PDF via rohe Python3-Bytes
4. Fallback: Raw-Bytes via `printf` (kein Python benoetigt)

### Option 2 — Python3 manuell

```bash
pip install fpdf2
python3 -c "
from fpdf import FPDF
pdf = FPDF()
pdf.add_page()
pdf.set_font('Helvetica', size=12)
pdf.cell(0, 10, 'Test-Beleg 123.45 EUR')
pdf.output('fixtures/test-receipt.pdf')
"
```

### Option 3 — Echte Test-PDF ablegen

Einfach eine beliebige PDF-Datei (z. B. eine gescannte Quittung) als
`fixtures/test-receipt.pdf` ablegen. Die Datei sollte zwischen 50 KB und 2 MB
gross sein, um realistischen Upload-Traffic zu simulieren.

### Hinweis zur Dateigrösse

| Groesse  | Simulation            |
|----------|-----------------------|
| < 10 KB  | Winziges Dokument     |
| 50-500KB | Typischer Scan        |
| 1-2 MB   | Hochaufloesender Scan |

Fuer den Standardtest ist jede valide PDF-Datei ausreichend.
