/**
 * MSW-Server für Node.js-Umgebung (Vitest/jsdom)
 *
 * Nutzt setupServer statt setupWorker — setupWorker läuft nur im Browser.
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
