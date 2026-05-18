/**
 * Tests für BelegeDetailPage
 * Spec: T014 — Beleg laden, Status-Badge, Image/PDF-Preview, Back-Button
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import BelegeDetailPage from './BelegeDetailPage';
import { ToastProvider } from '../components/ToastProvider';
import type { Beleg } from '../api/belege';

const BASE = '/api/v1';

// ── Mock-Daten ────────────────────────────────────────────────────────────────

function makeBeleg(overrides: Partial<Beleg> = {}): Beleg {
  return {
    id:              'b-detail-001',
    status:          'received',
    source_channel:  'manual_upload',
    received_at:     '2026-05-18T10:00:00Z',
    file_object_key: 'tenant-001/b-001.jpg',
    file_mime_type:  'image/jpeg',
    file_size_bytes: 204800,
    supplier_name:   'Test GmbH',
    document_date:   '2026-05-17',
    total_gross:     238.0,
    currency:        'EUR',
    category:        'wareneinkauf_food',
    ...overrides,
  };
}

function renderDetailPage(id = 'b-detail-001') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/belege/${id}`]}>
        <Routes>
          <Route path="/belege/:id" element={<BelegeDetailPage />} />
          <Route path="/belege" element={<div data-testid="belege-list">Liste</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BelegeDetailPage', () => {
  it('rendert ohne Crash', () => {
    renderDetailPage();
    expect(document.body).toBeTruthy();
  });

  it('lädt Beleg via API und zeigt Metadaten', async () => {
    const beleg = makeBeleg();
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg,
          download_url:        'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );

    renderDetailPage();

    await waitFor(() => {
      // Lieferant-Name erscheint in h1 und in Metadaten-Tabelle → getAllByText
      expect(screen.getAllByText('Test GmbH').length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/238/)).toBeInTheDocument();
    expect(screen.getByText('wareneinkauf_food')).toBeInTheDocument();
  });

  it('zeigt Status-Badge mit korrektem Label', async () => {
    const beleg = makeBeleg({ status: 'completed' });
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg,
          download_url:        'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('status-badge')).toBeInTheDocument();
    });

    expect(screen.getByTestId('status-badge')).toHaveTextContent('Abgeschlossen');
  });

  it('zeigt requires_review Status-Badge', async () => {
    const beleg = makeBeleg({ status: 'requires_review' });
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg,
          download_url:        'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('status-badge')).toHaveTextContent('Prüfung nötig');
    });
  });

  it('zeigt Image-Preview für JPEG', async () => {
    const beleg = makeBeleg({ file_mime_type: 'image/jpeg' });
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg,
          download_url:        'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('image-preview')).toBeInTheDocument();
    });

    const img = screen.getByTestId('image-preview') as HTMLImageElement;
    expect(img.src).toContain('preview.jpg');
  });

  it('zeigt Image-Preview für PNG', async () => {
    const beleg = makeBeleg({ file_mime_type: 'image/png' });
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg,
          download_url:        'http://localhost/preview.png',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('image-preview')).toBeInTheDocument();
    });
  });

  it('zeigt iframe für PDF', async () => {
    const beleg = makeBeleg({ file_mime_type: 'application/pdf' });
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg,
          download_url:        'http://localhost/doc.pdf',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('pdf-preview')).toBeInTheDocument();
    });

    const iframe = screen.getByTestId('pdf-preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('doc.pdf');
  });

  it('Back-Button navigiert zu /belege', async () => {
    const beleg = makeBeleg();
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg,
          download_url:        'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getAllByText('Test GmbH').length).toBeGreaterThan(0);
    });

    const backBtn = screen.getByRole('button', { name: /zurück zur belegliste/i });
    await act(async () => {
      fireEvent.click(backBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('belege-list')).toBeInTheDocument();
    });
  });

  it('zeigt Fehlermeldung wenn API versagt', async () => {
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json(
          { error: { message: 'Nicht gefunden', code: 'NOT_FOUND' } },
          { status: 404 },
        ),
      ),
    );

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('zeigt Loading-Skeleton während fetch', async () => {
    server.use(
      http.get(`${BASE}/belege/:id`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return HttpResponse.json({
          beleg: makeBeleg(),
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        });
      }),
    );

    renderDetailPage();

    // Während des Ladens: kein Status-Badge
    expect(screen.queryByTestId('status-badge')).not.toBeInTheDocument();

    // Nach dem Laden: Badge vorhanden
    await waitFor(() => {
      expect(screen.getByTestId('status-badge')).toBeInTheDocument();
    }, { timeout: 5000 });
  });
});
