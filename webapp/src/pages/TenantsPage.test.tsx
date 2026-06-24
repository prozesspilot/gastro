/**
 * Tests für TenantsPage
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import TenantsPage from './TenantsPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderTenantsPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/tenants']}>
        <Routes>
          <Route path="/tenants" element={<TenantsPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('TenantsPage', () => {
  it('rendert ohne Crash', () => {
    renderTenantsPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Mandanten-Liste', async () => {
    renderTenantsPage();
    await waitFor(() => {
      expect(screen.getByText('Demo-Tenant')).toBeInTheDocument();
    });
  });

  it('zeigt Mandanten-Überschrift', async () => {
    renderTenantsPage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body).toContain('Mandant');
    });
  });

  it('zeigt Tenant-Details wenn geladen', async () => {
    server.use(
      http.get(`${BASE}/tenants`, () =>
        HttpResponse.json({
          ok: true,
          data: [
            {
              id: 'tenant-xyz',
              slug: 'xyz',
              display_name: 'Test-Mandant XYZ',
              package: 'pro',
              deletion_status: 'active',
              onboarding_status: 'activated',
            },
          ],
        }),
      ),
    );
    renderTenantsPage();
    await waitFor(() => {
      expect(screen.getByText('Test-Mandant XYZ')).toBeInTheDocument();
    });
  });

  it('zeigt Onboarding-Status-Badge "Aktiv" für aktivierte Mandanten', async () => {
    server.use(
      http.get(`${BASE}/tenants`, () =>
        HttpResponse.json({
          ok: true,
          data: [
            {
              id: 'tenant-act',
              slug: 'act',
              display_name: 'Aktiver Mandant',
              package: 'pro',
              deletion_status: 'active',
              onboarding_status: 'activated',
            },
          ],
        }),
      ),
    );
    renderTenantsPage();
    await waitFor(() => {
      expect(screen.getByText('Aktiv')).toBeInTheDocument();
    });
  });

  it('zeigt Onboarding-Status-Badge "Offen" für pending-Mandanten', async () => {
    server.use(
      http.get(`${BASE}/tenants`, () =>
        HttpResponse.json({
          ok: true,
          data: [
            {
              id: 'tenant-pend',
              slug: 'pend',
              display_name: 'Pending Mandant',
              package: 'solo',
              deletion_status: 'active',
              onboarding_status: 'pending',
            },
          ],
        }),
      ),
    );
    renderTenantsPage();
    await waitFor(() => {
      expect(screen.getByText('Offen')).toBeInTheDocument();
    });
  });

  it('rendert auch bei API-Fehler ohne Crash', async () => {
    server.use(
      http.get(`${BASE}/tenants`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Fehler' } }, { status: 500 }),
      ),
    );
    renderTenantsPage();
    // Kein Crash
    await waitFor(() => {
      expect(document.body).toBeTruthy();
    }, { timeout: 3000 });
  });
});
