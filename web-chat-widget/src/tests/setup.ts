/**
 * Vitest-Setup für den Onboarding-Wizard.
 * - @testing-library/jest-dom Matchers (toBeInTheDocument …)
 * - global.fetch wird pro Test gestubbt (vi.fn) → kein echtes Netzwerk.
 */
import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});
