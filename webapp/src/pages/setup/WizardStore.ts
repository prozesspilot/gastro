/**
 * T016 — Onboarding-Wizard State Store
 *
 * Spec: Onboarding_Wizard.md §6.3 (Session-Persistenz)
 *
 * DECISION: Kein externes State-Library (Zustand ist in der Webapp-package.json
 * nicht installiert). Stattdessen localStorage-basierte Persistenz via einfachem
 * Modul-State + Subscriber-Pattern. Reicht für einen Single-Page-Flow mit 3 Steps.
 */

import type { WizardState } from './wizard.types';
import { INITIAL_WIZARD_STATE } from './wizard.types';

const STORAGE_KEY = 'pp_wizard_state';

// ── Hydration aus localStorage ─────────────────────────────────────────────────

function loadFromStorage(): WizardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...INITIAL_WIZARD_STATE };
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    // Merge mit Default damit neue Felder nicht fehlen
    return {
      ...INITIAL_WIZARD_STATE,
      ...parsed,
      step1: { ...INITIAL_WIZARD_STATE.step1, ...(parsed.step1 ?? {}) },
      step2: { ...INITIAL_WIZARD_STATE.step2, ...(parsed.step2 ?? {}) },
      step3: { ...INITIAL_WIZARD_STATE.step3, ...(parsed.step3 ?? {}) },
    };
  } catch {
    return { ...INITIAL_WIZARD_STATE };
  }
}

function saveToStorage(state: WizardState): void {
  try {
    // DECISION: TOTP-Secret wird NICHT in localStorage gespeichert (Sicherheit).
    // Es muss nach Seiten-Reload neu vom Backend angefordert werden.
    const safeState: WizardState = {
      ...state,
      step1: { ...state.step1, totpSecret: '', totpConfirm: '' },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
  } catch {
    // localStorage nicht verfügbar — kein Hard-Fail
  }
}

// ── Modul-State + Subscriber ───────────────────────────────────────────────────

type Subscriber = (state: WizardState) => void;

let current: WizardState = loadFromStorage();
const subscribers = new Set<Subscriber>();

function notify(): void {
  for (const sub of subscribers) {
    sub(current);
  }
}

// ── Öffentliche API ────────────────────────────────────────────────────────────

export const wizardStore = {
  getState(): WizardState {
    return current;
  },

  subscribe(fn: Subscriber): () => void {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },

  update(patch: Partial<WizardState>): void {
    current = {
      ...current,
      ...patch,
      step1: { ...current.step1, ...(patch.step1 ?? {}) },
      step2: { ...current.step2, ...(patch.step2 ?? {}) },
      step3: { ...current.step3, ...(patch.step3 ?? {}) },
    };
    saveToStorage(current);
    notify();
  },

  reset(): void {
    current = { ...INITIAL_WIZARD_STATE };
    localStorage.removeItem(STORAGE_KEY);
    notify();
  },
};
