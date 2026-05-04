# ADR-001: PDF-Engine für M08 Monatsreporting

**Status:** Vorgeschlagen  
**Datum:** 2026-05-04  
**Entscheider:** Solo-Agent (autonom/solo)

## Kontext

M08 (Monatsreporting) muss PDF-Berichte für Kunden generieren. Es gibt zwei realistische Optionen:

## Optionen

### Option A: Puppeteer (HTML → PDF)
- **Wie:** Node.js startet Chromium headless, rendert eine HTML-Page zu PDF
- **Pro:** Beliebiges HTML/CSS-Layout, wiederverwendet Webapp-Styling, leicht zu testen
- **Con:** Chromium-Binary ~150MB, langsamer Cold-Start, Linux-Sandbox-Setup nötig

### Option B: pdfkit (programmatisch)
- **Wie:** PDF direkt via Node.js Code (draw-calls, text, tabellen)
- **Pro:** Kein Browser-Binary, kleines Package (~5MB), schnell
- **Con:** Layout-Code komplex, kein HTML/CSS Support, schwer zu stylen

## Entscheidung

**Puppeteer** (Option A).

**Begründung:**
1. Die Berichte haben komplexe Layouts (Diagramme, Tabellen, Branding) die sich in HTML/CSS natürlich ausdrücken
2. Designer kann Templates ändern ohne Backend-Code zu verstehen
3. Puppeteer in Docker ist wohlverstanden (offizielles puppeteer-Docker-Image)
4. Für 50 Kunden/Monat ist der Cold-Start irrelevant (Cron-Job, nicht Real-Time)

## Konsequenzen

- Dockerfile erweitern: `node:20-slim + chromium` oder offizielles `ghcr.io/puppeteer/puppeteer` Image nutzen
- `PUPPETEER_EXECUTABLE_PATH` als ENV-Variable setzen
- Report-Templates als separate HTML-Dateien in `backend/src/modules/m08-reporting/templates/`
- Test: PDF-Generator-Unit-Test mit `jest-pdf-snapshot` oder manueller Prüfung

## Implementierungs-Hinweis

```typescript
import puppeteer from 'puppeteer';

export async function renderReportPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm' } });
  await browser.close();
  return Buffer.from(pdf);
}
```
