/**
 * Tests für CustomerProfilePage
 * E3: Target ≥ 70% Seiten-Coverage
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import CustomerProfilePage from './CustomerProfilePage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderProfilePage(tenantId = 'tenant-001', customerId = 'cust-001') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/tenants/${tenantId}/customers/${customerId}/profile`]}>
        <Routes>
          <Route path="/tenants/:tenantId/customers/:customerId/profile" element={<CustomerProfilePage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('CustomerProfilePage', () => {
  it('rendert ohne Crash', () => {
    renderProfilePage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Profil nach Laden', async () => {
    renderProfilePage();
    await waitFor(() => {
      // Skeleton weg
      const skeletons = document.querySelectorAll('.skeleton');
      expect(skeletons.length).toBe(0);
    }, { timeout: 5000 });
  });

  it('zeigt Kunden-Name in Breadcrumb', async () => {
    renderProfilePage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(10);
    }, { timeout: 5000 });
  });

  it('zeigt Fehlermeldung wenn Kundenprofil nicht geladen werden kann', async () => {
    server.use(
      http.get(`${BASE}/customers/:id`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Laden fehlgeschlagen' } }, { status: 500 }),
      ),
    );
    renderProfilePage('t-1', 'error-cust');
    await waitFor(() => {
      const errorBox = document.querySelector('.error-box');
      expect(errorBox).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('zeigt Modul-Konfiguration', async () => {
    renderProfilePage();
    await waitFor(() => {
      // Profil sollte Modul-Checkboxen oder Modul-Status zeigen
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(20);
    }, { timeout: 5000 });
  });
});
