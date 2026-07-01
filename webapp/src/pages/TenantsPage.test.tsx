/**
 * Tests für TenantsPage
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('zeigt Onboarding-Status-Badge "Wizard fertig" für wizard_done-Mandanten', async () => {
    server.use(
      http.get(`${BASE}/tenants`, () =>
        HttpResponse.json({
          ok: true,
          data: [
            {
              id: 'tenant-wd',
              slug: 'wd',
              display_name: 'Wizard-Done Mandant',
              package: 'standard',
              deletion_status: 'active',
              onboarding_status: 'wizard_done',
            },
          ],
        }),
      ),
    );
    renderTenantsPage();
    await waitFor(() => {
      expect(screen.getByText('Wizard fertig')).toBeInTheDocument();
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

  // ── T093: Mandanten-Anlage ────────────────────────────────────────────────

  it('öffnet das Anlage-Formular über "Neuer Kunde"', async () => {
    server.use(http.get(`${BASE}/tenants`, () => HttpResponse.json({ ok: true, data: [] })));
    renderTenantsPage();
    fireEvent.click(await screen.findByTestId('btn-new-tenant'));
    expect(screen.getByTestId('input-display-name')).toBeInTheDocument();
    expect(screen.getByTestId('select-package')).toBeInTheDocument();
  });

  it('deaktiviert "Anlegen" bei zu kurzem Firmennamen', async () => {
    server.use(http.get(`${BASE}/tenants`, () => HttpResponse.json({ ok: true, data: [] })));
    renderTenantsPage();
    fireEvent.click(await screen.findByTestId('btn-new-tenant'));
    fireEvent.change(screen.getByTestId('input-display-name'), { target: { value: 'ab' } });
    expect(screen.getByTestId('btn-create-tenant')).toBeDisabled();
  });

  it('legt einen neuen Mandanten an und reiht ihn in die Liste ein', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get(`${BASE}/tenants`, () => HttpResponse.json({ ok: true, data: [] })),
      http.post(`${BASE}/tenants`, async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            ok: true,
            data: {
              id: 'new-1',
              slug: 'neuer-wirt',
              display_name: posted.display_name,
              package: posted.package,
              deletion_status: 'active',
              onboarding_status: 'pending',
            },
          },
          { status: 201 },
        );
      }),
    );
    renderTenantsPage();
    fireEvent.click(await screen.findByTestId('btn-new-tenant'));
    fireEvent.change(screen.getByTestId('input-display-name'), { target: { value: 'Neuer Wirt' } });
    fireEvent.change(screen.getByTestId('select-package'), { target: { value: 'pro' } });
    fireEvent.click(screen.getByTestId('btn-create-tenant'));

    await waitFor(() => {
      expect(screen.getByText('Neuer Wirt')).toBeInTheDocument();
    });
    expect(posted).toMatchObject({ display_name: 'Neuer Wirt', package: 'pro' });
    // Formular ist nach Erfolg wieder zu.
    expect(screen.queryByTestId('input-display-name')).not.toBeInTheDocument();
  });

  it('zeigt eine Fehlermeldung, wenn der Slug bereits vergeben ist (409)', async () => {
    server.use(
      http.get(`${BASE}/tenants`, () => HttpResponse.json({ ok: true, data: [] })),
      http.post(`${BASE}/tenants`, () =>
        HttpResponse.json(
          { ok: false, error: { code: 'SLUG_TAKEN', message: 'Der Slug „belegt" ist bereits vergeben.' } },
          { status: 409 },
        ),
      ),
    );
    renderTenantsPage();
    fireEvent.click(await screen.findByTestId('btn-new-tenant'));
    fireEvent.change(screen.getByTestId('input-display-name'), { target: { value: 'Zur Post' } });
    fireEvent.change(screen.getByTestId('input-slug'), { target: { value: 'belegt' } });
    fireEvent.click(screen.getByTestId('btn-create-tenant'));

    await waitFor(() => {
      expect(screen.getByTestId('new-tenant-error')).toBeInTheDocument();
    });
    // Formular bleibt offen, damit der Nutzer korrigieren kann.
    expect(screen.getByTestId('input-display-name')).toBeInTheDocument();
  });
});
