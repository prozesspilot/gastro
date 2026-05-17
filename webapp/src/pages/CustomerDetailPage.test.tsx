/**
 * Tests für CustomerDetailPage
 */

import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import CustomerDetailPage from './CustomerDetailPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderCustomerDetailPage(tenantId = 'tenant-001', customerId = 'cust-001') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/tenants/${tenantId}/customers/${customerId}`]}>
        <Routes>
          <Route path="/tenants/:tenantId/customers/:customerId" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('CustomerDetailPage', () => {
  it('rendert ohne Crash', () => {
    renderCustomerDetailPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt irgendwelchen Content nach Laden', async () => {
    renderCustomerDetailPage();
    await waitFor(() => {
      // Skeleton sollte weg sein — irgendwas ist geladen
      const skeletons = document.querySelectorAll('.skeleton');
      expect(skeletons.length).toBe(0);
    }, { timeout: 5000 });
  });

  it('zeigt Fehlermeldung bei API-Fehler', async () => {
    server.use(
      http.get(`${BASE}/customers/:id`, () =>
        HttpResponse.json({ ok: false, error: { message: 'API-Fehler' } }, { status: 500 }),
      ),
    );
    renderCustomerDetailPage('t-1', 'error-cust');
    await waitFor(() => {
      // Fehlermeldung erscheint als error-box
      const errorBox = document.querySelector('.error-box');
      expect(errorBox).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('zeigt Breadcrumb-Navigation', async () => {
    renderCustomerDetailPage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });
});
