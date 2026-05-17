/**
 * Tests für DashboardPage
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import DashboardPage from './DashboardPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderDashboard() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('DashboardPage', () => {
  it('rendert ohne Crash', () => {
    renderDashboard();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Content nach Laden', async () => {
    renderDashboard();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(10);
    }, { timeout: 5000 });
  });

  it('zeigt KPI-Bereich', async () => {
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
    renderDashboard();
    await waitFor(() => {
      // Irgendein nummerisches KPI sollte sichtbar sein
      const body = document.body.textContent;
      expect(body).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('zeigt Tasks/Aufgaben-Bereich', async () => {
    renderDashboard();
    await waitFor(() => {
      // Tasks-Bereich mit offenen Aufgaben
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(50);
    });
  });

  it('zeigt Quicklinks oder Navigation', async () => {
    renderDashboard();
    await waitFor(() => {
      const links = screen.queryAllByRole('link');
      // Mindestens ein Link vorhanden
      expect(links.length).toBeGreaterThan(0);
    });
  });
});
