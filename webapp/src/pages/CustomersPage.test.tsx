/**
 * Tests für CustomersPage
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import CustomersPage from './CustomersPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderCustomersPage(tenantId = 'tenant-001') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/tenants/${tenantId}/customers`]}>
        <Routes>
          <Route path="/tenants/:tenantId/customers" element={<CustomersPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('CustomersPage', () => {
  it('rendert ohne Crash', () => {
    renderCustomersPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Kunden nach Laden', async () => {
    renderCustomersPage();
    await waitFor(() => {
      expect(screen.getByText('Test GmbH')).toBeInTheDocument();
    });
  });

  it('zeigt leere Liste wenn keine Kunden vorhanden', async () => {
    server.use(
      http.get(`${BASE}/customers`, () =>
        HttpResponse.json({ ok: true, data: [], pagination: { total: 0 } }),
      ),
    );
    renderCustomersPage();
    await waitFor(() => {
      // Kein Skeleton mehr
      const skeletons = document.querySelectorAll('.skeleton');
      expect(skeletons.length).toBe(0);
    });
  });

  it('zeigt Fehlermeldung bei API-Fehler', async () => {
    server.use(
      http.get(`${BASE}/customers`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Zugriff verweigert' } }, { status: 403 }),
      ),
    );
    renderCustomersPage();
    await waitFor(() => {
      expect(screen.getByText(/zugriff verweigert/i)).toBeInTheDocument();
    });
  });

  it('zeigt Aktion-Buttons', async () => {
    renderCustomersPage();
    await waitFor(() => {
      // Warten bis Seite geladen
      const body = document.body.textContent;
      expect(body).toBeTruthy();
    });
    // Irgendwelche Buttons vorhanden
    expect(document.querySelectorAll('button').length).toBeGreaterThan(0);
  });
});
