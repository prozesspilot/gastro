/**
 * T016 — React-Hook für den Wizard-Store
 *
 * Bindet den Modul-State via useSyncExternalStore an React-Renders.
 */

import { useSyncExternalStore } from 'react';
import { wizardStore } from './WizardStore';
import type { WizardState } from './wizard.types';

export function useWizardState(): [WizardState, typeof wizardStore.update] {
  const state = useSyncExternalStore(
    wizardStore.subscribe,
    wizardStore.getState,
    wizardStore.getState,
  );
  return [state, wizardStore.update];
}
