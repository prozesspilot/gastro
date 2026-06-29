/**
 * T086/A2 — WinAnsi-Schutz für die PDF-Engine.
 *
 * Der `pdf-lib`-Standardfont (Helvetica) nutzt WinAnsi (CP-1252). Das deckt
 * deutsche Umlaute (ä ö ü ß), das Euro-Zeichen (€) und gängige Interpunktion
 * ab — wirft aber eine Exception, sobald ein nicht-kodierbarer Codepoint
 * (Emoji, CJK, manche „Smart Quotes") gezeichnet werden soll.
 *
 * OCR-Lieferanten-/Belegnamen können beliebigen Unicode enthalten. Damit ein
 * exotisches Zeichen NIE den ganzen Report crasht, schleusen wir jeden Text
 * vor dem Zeichnen durch `toWinAnsiSafe`.
 */

// Die in CP-1252 vorhandenen Codepoints jenseits von Latin-1 (0x80–0x9F-Bereich
// von Windows-1252), die WinAnsiEncoding von pdf-lib kann.
const WIN1252_EXTRA = new Set<number>([
  0x20ac, // €
  0x201a,
  0x0192,
  0x201e,
  0x2026, // …
  0x2020,
  0x2021,
  0x02c6,
  0x2030,
  0x0160,
  0x2039,
  0x0152, // Œ
  0x017d,
  0x2018,
  0x2019, // ' '
  0x201c,
  0x201d, // " "
  0x2022, // •
  0x2013,
  0x2014, // – —
  0x02dc,
  0x2122, // ™
  0x0161,
  0x203a,
  0x0153, // œ
  0x017e,
  0x0178,
]);

/** True, wenn `code` von pdf-lib's WinAnsiEncoding (CP-1252) gezeichnet werden kann. */
function isWinAnsiEncodable(code: number): boolean {
  // Steuerzeichen außer Tab/Newline raus.
  if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
  if (code < 0x20) return false;
  // Latin-1 (printable ASCII + Latin-1 Supplement) ist vollständig abgedeckt …
  if (code <= 0xff) {
    // … außer dem C1-Bereich 0x80–0x9F, der in CP-1252 belegt/teilbelegt ist.
    if (code >= 0x80 && code <= 0x9f) return WIN1252_EXTRA.has(code);
    return true;
  }
  return WIN1252_EXTRA.has(code);
}

/**
 * Ersetzt jedes nicht-WinAnsi-kodierbare Zeichen durch `?`, sodass der Text
 * von Helvetica gezeichnet werden kann, ohne dass `pdf-lib` wirft.
 *
 * `\r`/`\n`/`\t` bleiben erhalten (der Builder entfernt Zeilenumbrüche separat,
 * wo nötig). `null`/`undefined` werden zu `''` normalisiert (defensiv gegen
 * fehlende OCR-Felder).
 */
export function toWinAnsiSafe(input: string | null | undefined): string {
  if (input == null) return '';
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0x3f;
    out += isWinAnsiEncodable(code) ? ch : '?';
  }
  return out;
}
