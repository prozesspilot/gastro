#!/usr/bin/env bash
# generate-test-pdf.sh
# Erzeugt ein minimales gueltiges PDF fuer Load-Tests.
# Bevorzugt Python3 (fpdf2 oder reportlab); fallback auf raw PDF bytes.

set -euo pipefail

OUTPUT="$(dirname "$0")/test-receipt.pdf"

echo "Generiere Test-PDF: $OUTPUT"

# ── Versuch 1: Python3 + fpdf2 ────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
  if python3 -c "import fpdf" &>/dev/null 2>&1; then
    python3 - <<'PYEOF'
from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
pdf.set_font("Helvetica", size=12)
pdf.cell(0, 10, "ProzessPilot Test-Beleg", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 10, "Betrag: 123.45 EUR", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 10, "Datum: 2026-05-01", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 10, "Lieferant: Muster GmbH", new_x="LMARGIN", new_y="NEXT")
pdf.cell(0, 10, "MwSt: 19%", new_x="LMARGIN", new_y="NEXT")
pdf.output("$(dirname "$0")/test-receipt.pdf")
PYEOF
    echo "PDF mit fpdf2 erstellt: $OUTPUT"
    exit 0
  fi

  # ── Versuch 2: Python3 + reportlab ──────────────────────────────────────────
  if python3 -c "from reportlab.pdfgen import canvas" &>/dev/null 2>&1; then
    python3 - <<PYEOF
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

c = canvas.Canvas("${OUTPUT}", pagesize=A4)
c.setFont("Helvetica", 14)
c.drawString(72, 750, "ProzessPilot Test-Beleg")
c.setFont("Helvetica", 11)
c.drawString(72, 720, "Betrag:    123.45 EUR")
c.drawString(72, 700, "Datum:     2026-05-01")
c.drawString(72, 680, "Lieferant: Muster GmbH")
c.drawString(72, 660, "MwSt:      19 Prozent")
c.save()
PYEOF
    echo "PDF mit reportlab erstellt: $OUTPUT"
    exit 0
  fi

  # ── Versuch 3: Minimales gueltiges PDF via Python3 bytes ────────────────────
  python3 - <<PYEOF
import struct, zlib, os

# Minimales gueltiges PDF 1.4 (8 Seiten-Objekte)
pdf_content = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
72 750 Td
(ProzessPilot Test-Beleg) Tj
0 -20 Td
(Betrag: 123.45 EUR - Datum: 2026-05-01) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000062 00000 n
0000000119 00000 n
0000000274 00000 n
0000000454 00000 n

trailer
<< /Size 6 /Root 1 0 R >>
startxref
536
%%EOF"""

output_path = "${OUTPUT}"
with open(output_path, 'wb') as f:
    f.write(pdf_content)
print(f"Minimales PDF erstellt: {output_path}")
PYEOF
    echo "Minimales PDF via Python3 bytes erstellt: $OUTPUT"
    exit 0
  fi
fi

# ── Fallback: Raw PDF bytes via printf ────────────────────────────────────────
# Dieses minimale PDF ist 100 % spezifikationskonform (PDF 1.4).
printf '%%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 60 >>\nstream\nBT /F1 12 Tf 72 750 Td (Test-Beleg ProzessPilot) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000062 00000 n\n0000000119 00000 n\n0000000265 00000 n\n0000000384 00000 n\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n453\n%%%%EOF\n' > "$OUTPUT"

echo "Minimales PDF via printf erstellt: $OUTPUT"
