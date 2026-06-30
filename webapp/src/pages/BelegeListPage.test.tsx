/**
 * Tests für BelegeListPage
 * Spec: T014 — Empty-State, Tabelle, Pagination, Status-Filter, Row-Navigation
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import BelegeListPage from './BelegeListPage';
import { ToastProvider } from '../components/ToastProvider';
import type { Beleg } from '../api/belege';

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

// Default: aktiver Mandant vorhanden (sonst greift der NoTenantHint-Guard).
// Einzelne Tests können den noTenant-Pfad per mockReturnValueOnce(null) prüfen.
const mockGetActiveTenantId = vi.fn<() => string | null>(() => 'tenant-001');
vi.mock('../api', () => ({ getActiveTenantId: () => mockGetActiveTenantId() }));

// useAuth-Rolle für das Batch-Export-Gating (gf-only). `mock`-Präfix wegen vi.mock-Hoisting.
let mockAuthRole = 'geschaeftsfuehrer';
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: mockAuthRole } }),
}));

beforeEach(() => {
  mockAuthRole = 'geschaeftsfuehrer';
});

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

  it('zeigt den Mandanten-Hinweis ohne aktiven Mandanten (kein 400)', async () => {
    mockGetActiveTenantId.mockReturnValueOnce(null);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Mandanten wählen/i)).toBeInTheDocument();
    });
  });

  // ── T076 — Batch-Export ──────────────────────────────────────────────────

  it('T076: Batch-Export-Button sichtbar für Geschäftsführer', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('btn-batch-export')).toBeInTheDocument();
    });
  });

  it('T076: Batch-Export-Button NICHT sichtbar für Mitarbeiter', async () => {
    mockAuthRole = 'mitarbeiter';
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\+ beleg hochladen/i })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('btn-batch-export')).not.toBeInTheDocument();
  });

  it('T076: Batch-Export mit Bestätigung ruft Endpoint + zeigt Summary-Toast', async () => {
    let called = false;
    server.use(
      http.post(`${BASE}/exports/lexware/batch`, () => {
        called = true;
        return HttpResponse.json({ pushed: 2, skipped: 1, failed: 0, results: [] });
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-batch-export')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-batch-export'));
    });
    // Bestätigungs-Dialog → bestätigen
    const confirmBtn = await screen.findByRole('button', { name: /jetzt exportieren/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() => expect(called).toBe(true));
    expect(await screen.findByText(/2 exportiert, 1 übersprungen, 0 fehlgeschlagen/i)).toBeInTheDocument();
  });

  // ── T074 — Live-Status via SSE ─────────────────────────────────────────────

  it('T074: aktualisiert den Beleg-Status live bei eingehendem SSE-Event', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    server.use(
      http.get(`${BASE}/belege`, () =>
        HttpResponse.json({
          belege: [{ ...MOCK_BELEG, id: 'b-001', status: 'extracting' }],
          pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
        }),
      ),
    );

    renderPage();
    await waitFor(() => expect(screen.getByTestId('beleg-row')).toBeInTheDocument());

    // Initial: Status "extracting" → Label "Extrahiert (läuft)" in der Zeile.
    const row = screen.getByTestId('beleg-row');
    expect(within(row).getByText('Extrahiert (läuft)')).toBeInTheDocument();

    // SSE-Stream wurde mit Tenant-Query + Credentials geöffnet.
    const es = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    expect(es?.url).toBe('/api/v1/events?tenant=tenant-001');
    expect(es?.withCredentials).toBe(true);

    // Event eintreffen lassen → Status der Zeile wechselt zu "Kategorisiert".
    await act(async () => {
      es?.emit('beleg.status', { beleg_id: 'b-001', status: 'categorized' });
    });
    await waitFor(() => {
      expect(within(screen.getByTestId('beleg-row')).getByText('Kategorisiert')).toBeInTheDocument();
    });
  });

  it('T074: ignoriert SSE-Events für nicht angezeigte Belege', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    server.use(
      http.get(`${BASE}/belege`, () =>
        HttpResponse.json({
          belege: [{ ...MOCK_BELEG, id: 'b-001', status: 'extracting' }],
          pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
        }),
      ),
    );

    renderPage();
    await waitFor(() => expect(screen.getByTestId('beleg-row')).toBeInTheDocument());

    const es = FakeEventSource.instances[FakeEventSource.instances.length - 1];
    await act(async () => {
      es?.emit('beleg.status', { beleg_id: 'fremder-beleg', status: 'categorized' });
    });

    // Status der angezeigten Zeile bleibt unverändert.
    expect(within(screen.getByTestId('beleg-row')).getByText('Extrahiert (läuft)')).toBeInTheDocument();
  });

  it('T076: Batch-Export mit failed>0 zeigt Fehler-Summary-Toast', async () => {
    server.use(
      http.post(`${BASE}/exports/lexware/batch`, () =>
        HttpResponse.json({ pushed: 1, skipped: 0, failed: 2, results: [] }),
      ),
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId('btn-batch-export')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('btn-batch-export'));
    });
    const confirmBtn = await screen.findByRole('button', { name: /jetzt exportieren/i });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });
    expect(
      await screen.findByText(/1 exportiert, 0 übersprungen, 2 fehlgeschlagen/i),
    ).toBeInTheDocument();
  });
});
