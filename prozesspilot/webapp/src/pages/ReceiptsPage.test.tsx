/**
 * Tests für ReceiptsPage
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import ReceiptsPage from './ReceiptsPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderReceiptsPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/receipts']}>
        <Routes>
          <Route path="/receipts" element={<ReceiptsPage />} />
          <Route path="/receipts/:receiptId" element={<div>Detail</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('ReceiptsPage', () => {
  it('rendert ohne Crash', () => {
    renderReceiptsPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt irgendwelchen Content nach Laden', async () => {
    renderReceiptsPage();
    await waitFor(() => {
      // Warte bis Skeleton weg ist oder Content geladen
      const body = document.body.textContent;
      // Seite rendert irgendetwas
      expect(body).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('zeigt Receipts wenn vorhanden', async () => {
    server.use(
      http.get(`${BASE}/receipts`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            receipts: [
              {
                id: 'r-001',
                tenant_id: 'tenant-001',
                customer_id: 'cust-001',
                status: 'done',
                original_name: 'mein-beleg.pdf',
                mime_type: 'application/pdf',
                storage_key: null,
                file_size_bytes: 1024,
                file_sha256: null,
                source: 'manual',
                metadata: {},
                error_message: null,
                created_at: '2024-06-01T10:00:00Z',
                updated_at: '2024-06-01T11:00:00Z',
              },
            ],
            total: 1,
            limit: 20,
            offset: 0,
          },
        }),
      ),
    );
    renderReceiptsPage();
    await waitFor(() => {
      expect(screen.getByText('mein-beleg.pdf')).toBeInTheDocument();
    });
  });

  it('zeigt Fehlermeldung bei API-Fehler', async () => {
    server.use(
      http.get(`${BASE}/receipts`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Server-Fehler aufgetreten' } }, { status: 500 }),
      ),
    );
    renderReceiptsPage();
    await waitFor(() => {
      expect(screen.getByText(/server-fehler/i)).toBeInTheDocument();
    });
  });
});
