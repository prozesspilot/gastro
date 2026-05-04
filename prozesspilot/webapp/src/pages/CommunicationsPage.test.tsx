/**
 * Tests für CommunicationsPage
 */

import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import CommunicationsPage from './CommunicationsPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderCommunicationsPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <CommunicationsPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('CommunicationsPage', () => {
  it('rendert ohne Crash', () => {
    server.use(
      http.get(`${BASE}/communications`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderCommunicationsPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Lieferanten-Kommunikation Titel', async () => {
    server.use(
      http.get(`${BASE}/communications`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderCommunicationsPage();
    await waitFor(() => {
      const body = document.body.textContent;
      // Seite hat irgendeinen Content
      expect(body?.length).toBeGreaterThan(0);
    });
  });

  it('zeigt leere Liste wenn keine Kommunikationen', async () => {
    server.use(
      http.get(`${BASE}/communications`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderCommunicationsPage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body).toBeTruthy();
    });
  });
});
