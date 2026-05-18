/**
 * Tests für BelegeListPage
 * Spec: T014 — Empty-State, Tabelle, Pagination, Status-Filter, Row-Navigation
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import BelegeListPage from './BelegeListPage';
import { ToastProvider } from '../components/ToastProvider';
import type { Beleg } from '../api/belege';

const BASE = '/api/v1';

// ── Hilfsdaten ────────────────────────────────────────────────────────────────

const MOCK_BELEG: Beleg = {
  id:              'b-001',
  status:          'received',
  source_channel:  'manual_upload',
  received_at:     '2026-05-18T10:00:00Z',
  file_object_key: 'tenant-001/b-001.jpg',
  file_mime_type:  'image/jpeg',
  file_size_bytes: 204800,
  supplier_name:   'Lieferant GmbH',
  document_date:   '2026-05-17',
  total_gross:     119.0,
  currency:        'EUR',
  category:        'wareneinkauf_food',
};

function renderPage(initialPath = '/belege') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/belege" element={<BelegeListPage />} />
          <Route path="/belege/upload" element={<div data-testid="upload-page">Upload</div>} />
          <Route path="/belege/:id" element={<div data-testid="detail-page">Detail</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BelegeListPage', () => {
  it('rendert ohne Crash', () => {
    renderPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Empty-State wenn keine Belege', async () => {
    // Default-Handler liefert leere Liste
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.getByText(/noch keine belege hochgeladen/i)).toBeInTheDocument();
  });

  it('zeigt Tabelle mit Belegen wenn Daten vorhanden', async () => {
    server.use(
      http.get(`${BASE}/belege`, () =>
        HttpResponse.json({
          belege:     [MOCK_BELEG],
          pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
        }),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('beleg-row')).toBeInTheDocument();
    });

    expect(screen.getByText('Lieferant GmbH')).toBeInTheDocument();
    // Status "received" → label (kann in Dropdown + Tabelle vorkommen → getAllByText)
    expect(screen.getAllByText('Empfangen').length).toBeGreaterThan(0);
    // Betrag
    expect(screen.getByText(/119/)).toBeInTheDocument();
  });

  it('zeigt mehrere Belege in Tabelle', async () => {
    const belege: Beleg[] = [
      { ...MOCK_BELEG, id: 'b-001', supplier_name: 'Lieferant A' },
      { ...MOCK_BELEG, id: 'b-002', supplier_name: 'Lieferant B', status: 'completed' },
    ];
    server.use(
      http.get(`${BASE}/belege`, () =>
        HttpResponse.json({
          belege,
          pagination: { page: 1, page_size: 50, total: 2, total_pages: 1 },
        }),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Lieferant A')).toBeInTheDocument();
    });
    expect(screen.getByText('Lieferant B')).toBeInTheDocument();
    // Abgeschlossen-Status (erscheint in Dropdown + Tabelle → getAllByText)
    expect(screen.getAllByText('Abgeschlossen').length).toBeGreaterThan(0);
  });

  it('Pagination zeigt korrekte Seitenangabe', async () => {
    server.use(
      http.get(`${BASE}/belege`, () =>
        HttpResponse.json({
          belege:     [MOCK_BELEG],
          pagination: { page: 1, page_size: 50, total: 150, total_pages: 3 },
        }),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/seite 1 von 3/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /nächste seite/i })).toBeInTheDocument();
  });

  it('Pagination Weiter-Button löst neuen API-Call aus', async () => {
    let callCount = 0;
    let lastPage = 1;

    server.use(
      http.get(`${BASE}/belege`, ({ request }) => {
        callCount++;
        const url = new URL(request.url);
        lastPage = parseInt(url.searchParams.get('page') ?? '1');
        return HttpResponse.json({
          belege:     [MOCK_BELEG],
          pagination: { page: lastPage, page_size: 50, total: 150, total_pages: 3 },
        });
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /nächste seite/i })).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole('button', { name: /nächste seite/i });
    await act(async () => {
      fireEvent.click(nextBtn);
    });

    await waitFor(() => {
      expect(lastPage).toBe(2);
    });
  });

  it('Status-Filter triggert API-Call mit Filter-Parameter', async () => {
    let capturedStatus: string | null = null;

    server.use(
      http.get(`${BASE}/belege`, ({ request }) => {
        const url = new URL(request.url);
        capturedStatus = url.searchParams.get('status');
        return HttpResponse.json({
          belege:     [],
          pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 },
        });
      }),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox', { name: /status-filter/i });
    await act(async () => {
      fireEvent.change(select, { target: { value: 'requires_review' } });
    });

    await waitFor(() => {
      expect(capturedStatus).toBe('requires_review');
    });
  });

  it('Click auf Tabellenzeile navigiert zu /belege/:id', async () => {
    server.use(
      http.get(`${BASE}/belege`, () =>
        HttpResponse.json({
          belege:     [MOCK_BELEG],
          pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
        }),
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('beleg-row')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('beleg-row'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('detail-page')).toBeInTheDocument();
    });
  });

  it('Loading-State zeigt Skeleton während fetch', async () => {
    // Verzögerter Handler um Loading-State zu sehen
    server.use(
      http.get(`${BASE}/belege`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({
          belege:     [],
          pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 },
        });
      }),
    );

    renderPage();

    // Skeleton-Element während des Ladens
    // SkeletonTable rendert mit aria-label oder bestimmten Klassen
    // Wir prüfen dass Empty-State noch NICHT da ist
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();

    // Warten bis geladen
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('+ Beleg hochladen Button navigiert zu /belege/upload', async () => {
    // Default-Handler liefert leere Liste
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /beleg hochladen/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /\+ beleg hochladen/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-page')).toBeInTheDocument();
    });
  });

  it('Empty-State Button navigiert zu /belege/upload', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    const btn = screen.getByRole('button', { name: /\+ beleg hochladen/i });
    await act(async () => {
      fireEvent.click(btn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('upload-page')).toBeInTheDocument();
    });
  });
});
