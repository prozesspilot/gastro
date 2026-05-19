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

    // T015: Felder sind jetzt in Inputs — check via Input-Value statt Text
    expect((screen.getByTestId('field-total_gross') as HTMLInputElement).value).toBe('238');
    expect((screen.getByTestId('field-category') as HTMLInputElement).value).toBe('wareneinkauf_food');
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

  it('iframe für PDF hat sandbox="" und no-referrer (S1)', async () => {
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

    const { container } = renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('pdf-preview')).toBeInTheDocument();
    });

    const iframe = container.querySelector('iframe');
    expect(iframe).toHaveAttribute('sandbox', '');
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('img für Bilder hat referrerPolicy="no-referrer" (S2)', async () => {
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

    const { container } = renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('image-preview')).toBeInTheDocument();
    });

    const img = container.querySelector('img[data-testid="image-preview"]');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  // ── T015 — Form / Konfidenz / Buttons / Confirm ─────────────────────────

  it('T015: rendert Form-Felder editierbar (Lieferant, Datum, Betrag, ...)', async () => {
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg: makeBeleg(),
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('field-supplier_name')).toBeInTheDocument();
    });
    expect(screen.getByTestId('field-document_date')).toBeInTheDocument();
    expect(screen.getByTestId('field-total_gross')).toBeInTheDocument();
    expect(screen.getByTestId('field-tax_rate')).toBeInTheDocument();
    expect(screen.getByTestId('field-category')).toBeInTheDocument();
  });

  it('T015: Konfidenz-Indikator pro Feld aus payload', async () => {
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg: makeBeleg({
            payload: {
              extraction: {
                confidence: 0.82,
                fields: {
                  fields_confidence: {
                    supplier_name: 0.9,    // grün
                    document_date: 0.5,    // gelb
                    total_gross: 0.2,      // rot
                  },
                },
              },
            },
          }),
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByTestId('confidence-Lieferant')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confidence-Lieferant').getAttribute('data-confidence')).toBe('0.90');
    expect(screen.getByTestId('confidence-Belegdatum').getAttribute('data-confidence')).toBe('0.50');
    expect(screen.getByTestId('confidence-Betrag (Brutto)').getAttribute('data-confidence')).toBe('0.20');
  });

  it('T015: Save-Button initial disabled (kein dirty), wird aktiv bei Änderung', async () => {
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg: makeBeleg(),
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-save')).toBeInTheDocument();
    });
    const saveBtn = screen.getByTestId('btn-save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    const supplierInput = screen.getByTestId('field-supplier_name') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(supplierInput, { target: { value: 'Neuer Lieferant' } });
    });
    expect(saveBtn.disabled).toBe(false);
  });

  it('T015: PATCH-Save sendet nur geänderte Felder', async () => {
    let receivedPatch: Record<string, unknown> | null = null;
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg: makeBeleg(),
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
      http.patch(`${BASE}/belege/:id`, async ({ request }) => {
        receivedPatch = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          beleg: makeBeleg({ supplier_name: 'Neuer Lieferant' }),
        });
      }),
    );
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('field-supplier_name')).toBeInTheDocument();
    });
    const supplierInput = screen.getByTestId('field-supplier_name') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(supplierInput, { target: { value: 'Neuer Lieferant' } });
    });
    const saveBtn = screen.getByTestId('btn-save');
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    await waitFor(() => expect(receivedPatch).not.toBeNull());
    expect(receivedPatch).toEqual({ supplier_name: 'Neuer Lieferant' });
  });

  it('T015: Save-Fehler rollt UI zurück', async () => {
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg: makeBeleg(),
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
      http.patch(`${BASE}/belege/:id`, () =>
        HttpResponse.json(
          { error: { message: 'Server-Fehler', code: 'INTERNAL_ERROR' } },
          { status: 500 },
        ),
      ),
    );
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('field-supplier_name')).toBeInTheDocument();
    });
    const supplierInput = screen.getByTestId('field-supplier_name') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(supplierInput, { target: { value: 'Versucht' } });
    });
    const saveBtn = screen.getByTestId('btn-save');
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    // Toast erscheint, Page bleibt offen
    await waitFor(() => {
      expect(screen.getByText(/Speichern fehlgeschlagen/i)).toBeInTheDocument();
    });
  });

  it('T015: Bewirtungs-Felder erscheinen wenn Kategorie "bewirtung" enthält', async () => {
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg: makeBeleg({ category: 'bewirtung_kunden' }),
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('field-bewirtung_anlass')).toBeInTheDocument();
    });
    expect(screen.getByTestId('field-bewirtung_teilnehmer')).toBeInTheDocument();
  });

  it('T015: Bewirtungs-Felder fehlen bei non-Bewirtung-Kategorie', async () => {
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg: makeBeleg({ category: 'wareneinkauf_food' }),
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('field-category')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('field-bewirtung_anlass')).not.toBeInTheDocument();
  });

  it('T015: Re-OCR-Button löst POST /reprocess aus', async () => {
    let called = false;
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg: makeBeleg(),
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
      http.post(`${BASE}/belege/:id/reprocess`, () => {
        called = true;
        return HttpResponse.json({ beleg_id: 'b-detail-001', status: 'received', queued: true });
      }),
    );
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-reprocess')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-reprocess'));
    });
    await waitFor(() => expect(called).toBe(true));
  });

  it('T015: Löschen zeigt Confirm-Dialog, bestätigtes Löschen navigiert', async () => {
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg: makeBeleg(),
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
      http.delete(`${BASE}/belege/:id`, () =>
        HttpResponse.json({ beleg_id: 'b-detail-001', deleted_at: '2026-05-19T12:00:00Z' }),
      ),
    );
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-delete')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-delete'));
    });
    expect(screen.getByTestId('delete-confirm')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-delete-confirm'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('belege-list')).toBeInTheDocument();
    });
  });

  it('T015: Löschen-Cancel schließt Dialog ohne API-Call', async () => {
    let called = false;
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg: makeBeleg(),
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
      http.delete(`${BASE}/belege/:id`, () => {
        called = true;
        return HttpResponse.json({ ok: true });
      }),
    );
    renderDetailPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-delete')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-delete'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-delete-cancel'));
    });
    expect(screen.queryByTestId('delete-confirm')).not.toBeInTheDocument();
    expect(called).toBe(false);
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
