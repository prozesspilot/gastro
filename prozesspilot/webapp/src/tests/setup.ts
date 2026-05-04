/**
 * Vitest-Setup-Datei
 *
 * Wird vor jedem Test-File ausgeführt:
 * 1. @testing-library/jest-dom Custom Matchers (toBeInTheDocument etc.)
 * 2. MSW (Mock Service Worker) Server Setup + Cleanup
 */

import '@testing-library/jest-dom';
import { server } from './msw/server';
import { afterAll, afterEach, beforeAll } from 'vitest';

// MSW: Server starten vor allen Tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// MSW: Handler nach jedem Test zurücksetzen (isolierte Tests)
afterEach(() => server.resetHandlers());

// MSW: Server nach allen Tests stoppen
afterAll(() => server.close());
