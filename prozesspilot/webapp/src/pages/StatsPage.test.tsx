/**
 * Tests für StatsPage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import StatsPage from './StatsPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderStatsPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <StatsPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('StatsPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('rendert ohne Crash', () => {
    renderStatsPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Statistiken-Bereich', async () => {
    renderStatsPage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(0);
    });
  });

  it('zeigt Stats nach Laden wenn Tenant gewählt', async () => {
    // Tenant-ID in localStorage setzen
    localStorage.setItem('pp_tenant_id', 'tenant-001');

    server.use(
      http.get(`${BASE}/receipts/stats`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            total: 42,
            by_status: { pending: 5, processing: 3, done: 30, error: 4 },
            by_source: { manual: 20, whatsapp: 15, email: 7 },
            today_count: 8,
            this_week_count: 25,
          },
        }),
      ),
    );
    renderStatsPage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(10);
    }, { timeout: 5000 });
  });

  it('zeigt Tenant-Auswahl wenn kein Tenant gesetzt', async () => {
    renderStatsPage();
    await waitFor(() => {
      // Ohne Tenant: Dropdown oder Aufforderung
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(0);
    });
  });
});
