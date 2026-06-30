/**
 * Tests für BelegeDetailPage
 * Spec: T014 — Beleg laden, Status-Badge, Image/PDF-Preview, Back-Button
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import BelegeDetailPage from './BelegeDetailPage';
import { ToastProvider } from '../components/ToastProvider';
import type { Beleg } from '../api/belege';

// Aktiver Mandant vorausgesetzt (sonst greift der NoTenantHint-Guard).
vi.mock('../api', () => ({ getActiveTenantId: () => 'tenant-001' }));

// ── Fake EventSource (jsdom hat keins → Hook wäre sonst no-op) ──────────────────
type SseListener = (ev: MessageEvent) => void;
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  withCredentials: boolean;
  private listeners: Record<string, SseListener[]> = {};
  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: SseListener): void {
    (this.listeners[type] ??= []).push(cb);
  }
  removeEventListener(type: string, cb: SseListener): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== cb);
  }
  close(): void {}
  emit(type: string, data: unknown): void {
    for (const cb of this.listeners[type] ?? []) {
      cb({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeEventSource.instances = [];
});

// useAuth liefert die Rolle für das Button-Gating (categorize/export). `mockAuthRole`
// ist mutable (über Re-Renders stabil; mockReturnValueOnce würde beim 2. Render auf den
// Default zurückfallen). `mock`-Präfix nötig, weil vi.mock gehoisted wird. beforeEach setzt zurück.
let mockAuthRole = 'geschaeftsfuehrer';
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: mockAuthRole } }),
}));

beforeEach(() => {
  mockAuthRole = 'geschaeftsfuehrer';
});

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

  // ── T076 — Kategorisieren + Exportieren ──────────────────────────────────

  function mockGet(beleg: Beleg) {
    server.use(
      http.get(`${BASE}/belege/:id`, () =>
        HttpResponse.json({
          beleg,
          download_url: 'http://localhost/preview.jpg',
          download_expires_at: '2026-05-18T11:00:00Z',
        }),
      ),
    );
  }

  it('T076: Kategorisieren-Button nur bei Status extracted', async () => {
    mockGet(makeBeleg({ status: 'received' }));
    renderDetailPage();
    await waitFor(() => expect(screen.getByTestId('btn-save')).toBeInTheDocument());
    expect(screen.queryByTestId('btn-categorize')).not.toBeInTheDocument();
  });

  it('T076: Kategorisieren ruft POST /categorize + zeigt Toast', async () => {
    let called = false;
    mockGet(makeBeleg({ status: 'extracted' }));
    server.use(
      http.post(`${BASE}/belege/:id/categorize`, () => {
        called = true;
        return HttpResponse.json({
          ok: true,
          data: {
            beleg_id: 'b-detail-001',
            status: 'categorized',
            categorization: {
              category: 'wareneinkauf_food',
              category_label: 'Wareneinkauf Lebensmittel',
              skr_account: '5400',
              confidence: 0.95,
              engine: 'claude',
              requires_review: false,
              bewirtung_preserved: false,
            },
          },
        });
      }),
    );
    renderDetailPage();
    await waitFor(() => expect(screen.getByTestId('btn-categorize')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-categorize'));
    });
    await waitFor(() => expect(called).toBe(true));
    expect(await screen.findByText(/Kategorisiert als/i)).toBeInTheDocument();
  });

  it('T076: Exportieren ruft POST /exports/lexware + zeigt Toast', async () => {
    let called = false;
    mockGet(makeBeleg({ status: 'categorized' }));
    server.use(
      http.post(`${BASE}/belege/:id/exports/lexware`, () => {
        called = true;
        return HttpResponse.json({ beleg_id: 'b-detail-001', status: 'pushed', attempts: 1 });
      }),
    );
    renderDetailPage();
    await waitFor(() => expect(screen.getByTestId('btn-export')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-export'));
    });
    await waitFor(() => expect(called).toBe(true));
    expect(await screen.findByText(/An Lexware Office exportiert/i)).toBeInTheDocument();
  });

  it('T076: Export-Fehler (422 not_categorized) zeigt verständlichen Toast (Legacy-Error-Shape)', async () => {
    mockGet(makeBeleg({ status: 'categorized' }));
    server.use(
      http.post(`${BASE}/belege/:id/exports/lexware`, () =>
        HttpResponse.json(
          {
            error: 'not_categorized',
            beleg_id: 'b-detail-001',
            message: 'Beleg ist noch nicht kategorisiert — erst /categorize, dann exportieren.',
          },
          { status: 422 },
        ),
      ),
    );
    renderDetailPage();
    await waitFor(() => expect(screen.getByTestId('btn-export')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-export'));
    });
    expect(await screen.findByText(/noch nicht kategorisiert/i)).toBeInTheDocument();
  });

  it('T076: Kategorisieren mit requires_review zeigt Prüf-Toast inkl. Konfidenz', async () => {
    mockGet(makeBeleg({ status: 'extracted' }));
    server.use(
      http.post(`${BASE}/belege/:id/categorize`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            beleg_id: 'b-detail-001',
            status: 'requires_review',
            categorization: {
              category: 'sonstige_betriebsausgaben',
              category_label: 'Sonstige Betriebsausgaben',
              skr_account: '6300',
              confidence: 0.5,
              engine: 'claude',
              requires_review: true,
              bewirtung_preserved: false,
            },
          },
        }),
      ),
    );
    renderDetailPage();
    await waitFor(() => expect(screen.getByTestId('btn-categorize')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-categorize'));
    });
    expect(await screen.findByText(/bitte prüfen \(Konfidenz 50 %\)/i)).toBeInTheDocument();
  });

  it('T076: Export mit status skipped zeigt „Bereits exportiert"-Toast', async () => {
    mockGet(makeBeleg({ status: 'categorized' }));
    server.use(
      http.post(`${BASE}/belege/:id/exports/lexware`, () =>
        HttpResponse.json({
          beleg_id: 'b-detail-001',
          status: 'skipped',
          external_id: 'lex-1',
          attempts: 1,
        }),
      ),
    );
    renderDetailPage();
    await waitFor(() => expect(screen.getByTestId('btn-export')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-export'));
    });
    expect(await screen.findByText(/bereits an Lexware exportiert/i)).toBeInTheDocument();
  });

  it('T076: Kategorisieren ist bei ungespeicherten Änderungen gesperrt', async () => {
    mockGet(makeBeleg({ status: 'extracted' }));
    renderDetailPage();
    const btn = (await screen.findByTestId('btn-categorize')) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    const supplierInput = screen.getByTestId('field-supplier_name') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(supplierInput, { target: { value: 'Geändert' } });
    });
    expect((screen.getByTestId('btn-categorize') as HTMLButtonElement).disabled).toBe(true);
  });

  it('T076: support-Rolle sieht keine Kategorisieren/Export-Buttons', async () => {
    mockAuthRole = 'support';
    mockGet(makeBeleg({ status: 'extracted' }));
    renderDetailPage();
    await waitFor(() => expect(screen.getByTestId('btn-save')).toBeInTheDocument());
    expect(screen.queryByTestId('btn-categorize')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-export')).not.toBeInTheDocument();
  });

  // ── T078 — „Als geprüft bestätigen" (requires_review → categorized) ───────

  it('T078: Bestätigen-Button nur bei Status requires_review', async () => {
    mockGet(makeBeleg({ status: 'categorized' }));
    renderDetailPage();
    await waitFor(() => expect(screen.getByTestId('btn-save')).toBeInTheDocument());
    expect(screen.queryByTestId('btn-confirm-review')).not.toBeInTheDocument();
  });

  it('T078: Bestätigen ruft POST /confirm-review + zeigt Toast', async () => {
    let called = false;
    mockGet(makeBeleg({ status: 'requires_review' }));
    server.use(
      http.post(`${BASE}/belege/:id/confirm-review`, () => {
        called = true;
        return HttpResponse.json({ ok: true, data: { beleg_id: 'b-detail-001', status: 'categorized' } });
      }),
    );
    renderDetailPage();
    await waitFor(() => expect(screen.getByTestId('btn-confirm-review')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-confirm-review'));
    });
    await waitFor(() => expect(called).toBe(true));
    expect(await screen.findByText(/Als geprüft bestätigt/i)).toBeInTheDocument();
  });

  it('T078: 422 BEWIRTUNG_FIELDS_REQUIRED zeigt verständlichen Toast', async () => {
    mockGet(makeBeleg({ status: 'requires_review', category: 'bewirtung_kunden' }));
    server.use(
      http.post(`${BASE}/belege/:id/confirm-review`, () =>
        HttpResponse.json(
          {
            ok: false,
            error: {
              code: 'BEWIRTUNG_FIELDS_REQUIRED',
              message: 'Bei Bewirtungs-Belegen sind Anlass und Teilnehmer Pflichtfelder — bitte erst ergänzen und speichern.',
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderDetailPage();
    // Bei category 'bewirtung_kunden' erscheinen Bewirtungs-Felder; Bestätigen-Button ist da.
    await waitFor(() => expect(screen.getByTestId('btn-confirm-review')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-confirm-review'));
    });
    expect(await screen.findByText(/Anlass und Teilnehmer Pflichtfelder/i)).toBeInTheDocument();
  });

  it('T078: Bestätigen bei ungespeicherten Änderungen gesperrt', async () => {
    mockGet(makeBeleg({ status: 'requires_review' }));
    renderDetailPage();
    const btn = (await screen.findByTestId('btn-confirm-review')) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    const supplierInput = screen.getByTestId('field-supplier_name') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(supplierInput, { target: { value: 'Geändert' } });
    });
    expect((screen.getByTestId('btn-confirm-review') as HTMLButtonElement).disabled).toBe(true);
  });

  it('T078: support-Rolle sieht keinen Bestätigen-Button', async () => {
    mockAuthRole = 'support';
    mockGet(makeBeleg({ status: 'requires_review' }));
    renderDetailPage();
    await waitFor(() => expect(screen.getByTestId('btn-save')).toBeInTheDocument());
    expect(screen.queryByTestId('btn-confirm-review')).not.toBeInTheDocument();
  });

  // ── T074 — Live-Status via SSE ─────────────────────────────────────────────

  it('T091: lädt den Beleg bei beleg.status-Event neu (keine ungespeicherten Edits)', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    let calls = 0;
    server.use(
      http.get(`${BASE}/belege/:id`, () => {
        calls++;
        return HttpResponse.json({
          beleg: makeBeleg({ status: calls === 1 ? 'extracting' : 'categorized' }),
          download_url: null,
          download_expires_at: null,
        });
      }),
    );

    renderDetailPage();
    await waitFor(() =>
      expect(screen.getByTestId('status-badge')).toHaveTextContent('Extrahierung läuft'),
    );

    const es = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    expect(es?.url).toBe('/api/v1/events?tenant=tenant-001');
    await act(async () => {
      es?.emit('beleg.status', { beleg_id: 'b-detail-001', status: 'categorized' });
    });

    // refreshBeleg() hat neu geladen → Badge zeigt den frischen Status.
    await waitFor(() =>
      expect(screen.getByTestId('status-badge')).toHaveTextContent('Kategorisiert'),
    );
  });

  it('T091: bei ungespeicherten Edits nur Status-Badge, Formular bleibt erhalten', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    let calls = 0;
    server.use(
      http.get(`${BASE}/belege/:id`, () => {
        calls++;
        return HttpResponse.json({
          beleg: makeBeleg({ status: 'extracting' }),
          download_url: null,
          download_expires_at: null,
        });
      }),
    );

    renderDetailPage();
    await waitFor(() => expect(screen.getByTestId('field-supplier_name')).toBeInTheDocument());

    // Edit machen → isDirty.
    await act(async () => {
      fireEvent.change(screen.getByTestId('field-supplier_name'), {
        target: { value: 'Geänderter Lieferant GmbH' },
      });
    });
    const callsBeforeEvent = calls;

    const es = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    await act(async () => {
      es?.emit('beleg.status', { beleg_id: 'b-detail-001', status: 'categorized' });
    });

    // Badge aktualisiert …
    await waitFor(() =>
      expect(screen.getByTestId('status-badge')).toHaveTextContent('Kategorisiert'),
    );
    // … aber KEIN Reload (kein erneuter GET) und der Edit bleibt erhalten.
    expect(calls).toBe(callsBeforeEvent);
    expect((screen.getByTestId('field-supplier_name') as HTMLInputElement).value).toBe(
      'Geänderter Lieferant GmbH',
    );
  });

  it('T091: ignoriert beleg.status-Events für einen anderen Beleg', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    mockGet(makeBeleg({ status: 'extracting' }));

    renderDetailPage();
    await waitFor(() =>
      expect(screen.getByTestId('status-badge')).toHaveTextContent('Extrahierung läuft'),
    );

    const es = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    await act(async () => {
      es?.emit('beleg.status', { beleg_id: 'fremder-beleg', status: 'categorized' });
    });

    // Unverändert.
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Extrahierung läuft');
  });
});
