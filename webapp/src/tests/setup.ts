/**
 * Vitest-Setup-Datei
 *
 * Wird vor jedem Test-File ausgeführt:
 * 1. @testing-library/jest-dom Custom Matchers (toBeInTheDocument etc.)
 * 2. MSW (Mock Service Worker) Server Setup + Cleanup
 * 3. JSDOM-Polyfills: URL.createObjectURL / revokeObjectURL
 */

import '@testing-library/jest-dom';
import { server } from './msw/server';
import { afterAll, afterEach, beforeAll } from 'vitest';

// JSDOM stellt URL.createObjectURL nicht bereit → stubben damit
// BelegeUploadPage (Thumbnail-Previews) und andere File-Blob-Code nicht crashing.
if (typeof URL.createObjectURL === 'undefined') {
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: (_blob: Blob) => `blob:http://localhost/${Math.random().toString(36).slice(2)}`,
  });
}
if (typeof URL.revokeObjectURL === 'undefined') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    value: (_url: string) => { /* no-op */ },
  });
}

// MSW: Server starten vor allen Tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// MSW: Handler nach jedem Test zurücksetzen (isolierte Tests)
afterEach(() => server.resetHandlers());

// MSW: Server nach allen Tests stoppen
afterAll(() => server.close());
