/**
 * Tests für ReceiptDetailPage
 * E3: Target ≥ 70% Seiten-Coverage
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import ReceiptDetailPage from './ReceiptDetailPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderWithRouter(receiptId: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/receipts/${receiptId}`]}>
        <Routes>
          <Route path="/receipts/:receiptId" element={<ReceiptDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('ReceiptDetailPage', () => {
  it('rendert ohne Crash', () => {
    // Default MSW handler reagiert sofort — trotzdem kurz pending
    renderWithRouter('receipt-test-id');
    // Wir prüfen dass kein Crash auftritt
    expect(document.body).toBeTruthy();
  });

  it('zeigt Beleg-Dateiname nach Laden', async () => {
    renderWithRouter('receipt-test-id');
    await waitFor(() => {
      expect(screen.getByText('test-beleg.pdf')).toBeInTheDocument();
    });
  });

  it('zeigt StatusBadge des Belegs', async () => {
    renderWithRouter('receipt-test-id');
    await waitFor(() => {
      // Status "done" → "Fertig"
      expect(screen.getByText('Fertig')).toBeInTheDocument();
    });
  });

  it('zeigt Fehler-Box bei API-Fehler', async () => {
    server.use(
      http.get(`${BASE}/receipts/:id`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Nicht gefunden' } }, { status: 404 }),
      ),
    );
    renderWithRouter('nonexistent');
    await waitFor(() => {
      expect(screen.getByText('Nicht gefunden')).toBeInTheDocument();
    });
  });

  it('zeigt Beleg-Quell-Informationen', async () => {
    server.use(
      http.get(`${BASE}/receipts/:id`, ({ params }) =>
        HttpResponse.json({
          ok: true,
          data: {
            id: params['id'],
            tenant_id: 'tenant-001',
            customer_id: 'cust-001',
            status: 'extracted',
            original_name: 'rechnung-2024.pdf',
            mime_type: 'application/pdf',
            storage_key: 'receipts/test/r.pdf',
            file_size_bytes: 51200,
            file_sha256: null,
            source: 'whatsapp',
            metadata: {},
            error_message: null,
            created_at: '2024-06-15T10:00:00Z',
            updated_at: '2024-06-15T10:01:00Z',
          },
        }),
      ),
    );
    renderWithRouter('r-whatsapp-001');
    await waitFor(() => {
      expect(screen.getByText('rechnung-2024.pdf')).toBeInTheDocument();
    });
  });
});
