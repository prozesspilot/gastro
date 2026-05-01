/**
 * M03 — confidence-scorer.ts
 *
 * Kombiniert Engine-Confidence + Validierungsergebnis zu einer Final-Confidence.
 *
 * Regeln (aus M03-Spec §7.1 & §12):
 *   - Override   → immer 1.0
 *   - Master-Data→ engineConfidence (bereits ≥ 0.9 gefiltert)
 *   - Claude     → engineConfidence aus Tool-Use Response
 *   - Fallback bei Claude-Fehler → 0.5 (Sonst-Fallback in claude-categorizer.ts)
 *
 * Abzug 0.1 wenn required fields fehlen (skr_account oder category leer).
 */

import type { CategorizationEngine } from './types';

export interface CombineInput {
  engineConfidence: number;
  engine: CategorizationEngine;
  hasCategory: boolean;
  hasSkrAccount: boolean;
}

export function combineCategorizationConfidence(input: CombineInput): number {
  let base: number;
  if (input.engine === 'override') {
    base = 1.0;
  } else if (input.engine === 'master_data') {
    base = clamp01(input.engineConfidence);
  } else if (input.engine === 'fallback_after_error') {
    base = 0.5;
  } else {
    // claude_sonnet_4_6 oder claude_cached
    base = clamp01(input.engineConfidence);
  }

  if (!input.hasCategory || !input.hasSkrAccount) {
    base = Math.max(0, base - 0.1);
  }

  return round4(base);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
