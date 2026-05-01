/**
 * M02 — Collision-Resolver (M02 §9 / §7.1).
 *
 * Wenn `adapter.exists(path)` true zurückgibt, wird der Filename mit einem
 * Counter-Suffix `_001`, `_002`, … bis maximal 50 erweitert. Das Suffix wird
 * VOR der Endung eingefügt, sodass der File-Type erhalten bleibt.
 *
 * Beispiele:
 *   appendCounter('foo.pdf',           1) → 'foo_001.pdf'
 *   appendCounter('2026-04_Metro.pdf', 3) → '2026-04_Metro_003.pdf'
 *   appendCounter('rechnung',          7) → 'rechnung_007'   // ohne Endung
 */

export const MAX_COLLISION_COUNTER = 50;

export function appendCounter(filename: string, n: number): string {
  if (n <= 0) return filename;
  const padded = String(n).padStart(3, '0');

  // Endung erkennen: letzter Punkt, der nicht am Anfang steht und sinnvoll
  // kurz ist (≤ 6 Zeichen Endung). Sonst Behandeln als Datei ohne Endung.
  const dotIdx = filename.lastIndexOf('.');
  const hasExt = dotIdx > 0 && dotIdx > filename.length - 8 && dotIdx < filename.length - 1;

  if (!hasExt) {
    return `${filename}_${padded}`;
  }
  const stem = filename.slice(0, dotIdx);
  const ext = filename.slice(dotIdx); // mit führendem '.'
  return `${stem}_${padded}${ext}`;
}
