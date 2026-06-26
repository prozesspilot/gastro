/**
 * Tests für ChatsPage (T073) — Liste, Empty-State, Unread-Badge, noTenant, Navigation.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ToastProvider';
import { server } from '../tests/msw/server';
import ChatsPage from './ChatsPage';

const mockGetActiveTenantId = vi.fn<() => string | null>(() => 'tenant-001');
vi.mock('../api', () => ({ getActiveTenantId: () => mockGetActiveTenantId() }));

const BASE = '/api/v1';

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/chats']}>
        <Routes>
          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/chats/:id" element={<div data-testid="detail-page">Detail</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('ChatsPage', () => {
  it('zeigt NoTenantHint ohne aktiven Mandanten', () => {
    mockGetActiveTenantId.mockReturnValueOnce(null);
    renderPage();
    expect(screen.getByText(/Kein Mandant gewählt/i)).toBeInTheDocument();
  });

  it('rendert Chats inkl. Unread-Badge', async () => {
    server.use(
      http.get(`${BASE}/chat/sessions`, () =>
        HttpResponse.json({
          chats: [
            {
              id: 'sess-aaaaaaaa-1111',
              status: 'active',
              created_at: '2026-06-25T09:00:00Z',
              last_activity_at: '2026-06-25T10:00:00Z',
              last_message_at: '2026-06-25T10:00:00Z',
              unread_count: 2,
            },
          ],
        }),
      ),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/Chat sess-aaa/i)).toBeInTheDocument());
    expect(screen.getByText(/2 neu/i)).toBeInTheDocument();
  });

  it('zeigt Empty-State bei keiner Session', async () => {
    server.use(http.get(`${BASE}/chat/sessions`, () => HttpResponse.json({ chats: [] })));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Noch keine Chats/i)).toBeInTheDocument());
  });

  it('zeigt Fehlermeldung bei Server-Fehler', async () => {
    server.use(http.get(`${BASE}/chat/sessions`, () => new HttpResponse(null, { status: 500 })));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/konnten nicht geladen werden/i)).toBeInTheDocument(),
    );
  });

  it('Klick auf einen Chat navigiert zur Detailseite', async () => {
    server.use(
      http.get(`${BASE}/chat/sessions`, () =>
        HttpResponse.json({
          chats: [
            {
              id: 'sess-bbbb-2222',
              status: 'active',
              created_at: '2026-06-25T09:00:00Z',
              last_activity_at: '2026-06-25T10:00:00Z',
              last_message_at: null,
              unread_count: 0,
            },
          ],
        }),
      ),
    );
    renderPage();
    const row = await screen.findByRole('button', { name: /Chat sess-bbb/i });
    await userEvent.click(row);
    expect(await screen.findByTestId('detail-page')).toBeInTheDocument();
  });

  it('beendeter Chat mit Bewertung zeigt Sterne', async () => {
    server.use(
      http.get(`${BASE}/chat/sessions`, () =>
        HttpResponse.json({
          chats: [
            {
              id: 'sess-cccc-3333',
              status: 'closed',
              created_at: '2026-06-25T09:00:00Z',
              last_activity_at: '2026-06-25T10:00:00Z',
              last_message_at: '2026-06-25T10:00:00Z',
              unread_count: 0,
              rating: 4,
            },
          ],
        }),
      ),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByLabelText('Bewertung: 4 von 5 Sternen')).toBeInTheDocument(),
    );
  });
});
