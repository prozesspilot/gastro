/**
 * M07 — Mini-JSONPath (Dot-Notation) für Extra-Columns.
 *
 * Reicht für die im Spec genannten Pfade ("foo.bar.baz", inkl.
 * Array-Index-Notation "items[0].name"). Eine echte JSONPath-Implementierung
 * (Filter-Expressions, Wildcards) brauchen wir im MVP nicht; sobald ein
 * Kunde komplexere Pfade fordert, bauen wir auf jsonpath-plus um.
 *
 * Rückgabewerte:
 *  - primitive Werte (string, number, boolean) werden 1:1 durchgereicht
 *  - undefined / null wird zu '' (leere Zelle)
 *  - Objekte/Arrays werden via JSON.stringify serialisiert
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | { [k: string]: JsonValue };

/**
 * Liest "foo.bar[2].baz" aus obj. Gibt undefined zurück, wenn ein Segment
 * fehlt — das ist absichtlich, der Aufrufer entscheidet, was er damit macht.
 */
export function readPath(obj: unknown, path: string): JsonValue {
  if (path === '' || path === '$') return obj as JsonValue;
  // Erlaubt sowohl "$.foo.bar" als auch "foo.bar"
  const cleaned = path.replace(/^\$\.?/, '');
  const segments = parseSegments(cleaned);
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur as JsonValue;
}

/** Wandelt einen JSONPath-Wert in eine flache Tabellen-Zelle. */
export function toCellValue(v: JsonValue): string | number | boolean {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** "foo.bar[2].baz" → ["foo", "bar", "2", "baz"] */
function parseSegments(path: string): string[] {
  const out: string[] = [];
  // Split by '.' first, then expand "x[2]" → "x", "2".
  for (const part of path.split('.')) {
    if (part === '') continue;
    const idx = part.indexOf('[');
    if (idx === -1) {
      out.push(part);
      continue;
    }
    const head = part.slice(0, idx);
    if (head) out.push(head);
    const rest = part.slice(idx);
    for (const m of rest.matchAll(/\[(\d+)\]/g)) {
      out.push(m[1]);
    }
  }
  return out;
}
