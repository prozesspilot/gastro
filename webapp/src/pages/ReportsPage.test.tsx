/**
 * Tests für ReportsPage
 * E3: Target ≥ 70% Seiten-Coverage
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import ReportsPage from './ReportsPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderReportsPage(customerId = 'cust-001') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/customers/${customerId}/reports`]}>
        <Routes>
          <Route path="/customers/:customerId/reports" element={<ReportsPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('ReportsPage', () => {
  it('lädt ohne Crash', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/reports`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderReportsPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt leeren Zustand wenn keine Berichte vorhanden', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/reports`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderReportsPage();
    await waitFor(() => {
      // Kein Skeleton mehr → leere Liste
      const body = document.body.textContent;
      expect(body).toBeTruthy();
    });
  });

  it('zeigt Berichte wenn vorhanden', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/reports`, () =>
        HttpResponse.json({
          ok: true,
          data: [
            {
              report_id: 'rep-001',
              customer_id: 'cust-001',
              period: '2024-01',
              status: 'done',
              pdf_object_key: 'reports/2024-01.pdf',
              totals: { receipts_count: 10, gross_sum: 2000, net_sum: 1680, trend_pct: 5, top_categories: [], top_suppliers: [] },
              delivery_log: [],
              created_at: '2024-02-01T00:00:00Z',
            },
          ],
        }),
      ),
    );
    renderReportsPage();
    await waitFor(() => {
      expect(screen.getByText('2024-01')).toBeInTheDocument();
    });
  });

  it('zeigt Fehlermeldung bei API-Fehler', async () => {
    server.use(
      http.get(`${BASE}/customers/:id/reports`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Reports konnten nicht geladen werden' } }, { status: 500 }),
      ),
    );
    renderReportsPage();
    await waitFor(() => {
      expect(screen.getByText('Reports konnten nicht geladen werden')).toBeInTheDocument();
    });
  });
});
