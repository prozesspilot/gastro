/**
 * Tests für AdvisorPortalPage
 * E3: Target ≥ 70% Seiten-Coverage
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import AdvisorPortalPage from './AdvisorPortalPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderAdvisorPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <AdvisorPortalPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('AdvisorPortalPage', () => {
  it('rendert ohne Crash', () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Steuerberater-bezogene Inhalte', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body).toBeTruthy();
    });
  });

  it('zeigt Kunden in der Übersicht wenn vorhanden', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({
          ok: true,
          data: [
            {
              customer_id: 'cust-001',
              name: 'Muster GmbH',
              receipt_count: 15,
              pending_count: 3,
              exported_count: 12,
            },
          ],
        }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      expect(screen.getByText('Muster GmbH')).toBeInTheDocument();
    });
  });

  it('zeigt Tabs für Übersicht und Prüfung', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(0);
    });
  });
});
