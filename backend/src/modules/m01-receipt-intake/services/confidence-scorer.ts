/**
 * M01 — Confidence-Scorer
 *
 * Kombiniert OCR-Confidence (Provider-Output) und Field-Confidence
 * (Anteil sicher gesetzter Pflichtfelder) zu einem Gesamtwert.
 *
 * Gewichtung (Default): 60 % OCR, 40 % Felder.
 * Beide Werte sind clamped auf [0, 1].
 *
 * Threshold-Vergleich findet im Caller statt (Handler):
 *   overall < profile.routing.low_confidence_threshold (Default 0.75)
 *     ⇒ requires_review.
 */

export interface CombineWeights {
  ocr: number; // 0..1
  fields: number; // 0..1
}

const DEFAULT_WEIGHTS: CombineWeights = { ocr: 0.6, fields: 0.4 };

export function combineConfidence(
  ocrConfidence: number,
  fieldsConfidence: number,
  weights: CombineWeights = DEFAULT_WEIGHTS,
): number {
  const o = clamp01(ocrConfidence);
  const f = clamp01(fieldsConfidence);
  const sum = weights.ocr + weights.fields;
  if (sum === 0) return 0;
  return (o * weights.ocr + f * weights.fields) / sum;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
