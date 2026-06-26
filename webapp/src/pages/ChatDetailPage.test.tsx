/**
 * Tests für ChatDetailPage (T073) — Thread-Render, Beleg-Link, Staff-Antwort, noTenant.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ToastProvider';
import { server } from '../tests/msw/server';
import ChatDetailPage from './ChatDetailPage';

const mockGetActiveTenantId = vi.fn<() => string | null>(() => 'tenant-001');
vi.mock('../api', () => ({ getActiveTenantId: () => mockGetActiveTenantId() }));

const BASE = '/api/v1';

function renderDetail(id = 'sess-1') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/chats/${id}`]}>
        <Routes>
          <Route path="/chats" element={<div data-testid="list-page">Liste</div>} />
          <Route path="/chats/:id" element={<ChatDetailPage />} />
          <Route path="/belege/:id" element={<div data-testid="beleg-page">Beleg</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function msg(over: Record<string, unknown>) {
  return {
    id: 'm1',
    session_id: 'sess-1',
    sender_type: 'customer',
    body: 'Hallo',
    beleg_id: null,
    created_at: '2026-06-25T10:00:00Z',
    ...over,
  };
}

function sess(over: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    status: 'active',
    closed_at: null,
    closed_by: null,
    rating: null,
    rating_comment: null,
    rated_at: null,
    ...over,
  };
}

describe('ChatDetailPage', () => {
  it('zeigt NoTenantHint ohne aktiven Mandanten', () => {
    mockGetActiveTenantId.mockReturnValueOnce(null);
    renderDetail();
    expect(screen.getByText(/Kein Mandant gewählt/i)).toBeInTheDocument();
  });

  it('rendert den Verlauf inkl. Beleg-Link in die Belege-Detailseite', async () => {
    server.use(
      http.get(`${BASE}/chat/sessions/sess-1/messages`, () =>
        HttpResponse.json({
          messages: [
            msg({ id: 'm1', sender_type: 'customer', body: 'Meine Frage' }),
            msg({ id: 'm2', sender_type: 'staff', body: 'Unsere Antwort' }),
            msg({ id: 'm3', sender_type: 'customer', body: null, beleg_id: 'b-123' }),
          ],
        }),
      ),
    );
    renderDetail();
    await waitFor(() => expect(screen.getByText('Meine Frage')).toBeInTheDocument());
    expect(screen.getByText('Unsere Antwort')).toBeInTheDocument();
    const belegLink = screen.getByRole('link', { name: /Beleg ansehen/i });
    expect(belegLink).toHaveAttribute('href', '/belege/b-123');
  });

  it('Staff-Antwort: ruft reply und zeigt die neue Nachricht', async () => {
    server.use(
      http.get(`${BASE}/chat/sessions/sess-1/messages`, () =>
        HttpResponse.json({ messages: [] }),
      ),
      http.post(`${BASE}/chat/sessions/sess-1/reply`, () =>
        HttpResponse.json(
          { message: msg({ id: 'm-new', sender_type: 'staff', body: 'Meine Antwort' }) },
          { status: 201 },
        ),
      ),
    );
    renderDetail();
    const input = await screen.findByLabelText('Antwort');
    await userEvent.type(input, 'Meine Antwort');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    expect(await screen.findByText('Meine Antwort')).toBeInTheDocument();
  });

  it('Dedup: Reply mit bereits vorhandener id dupliziert nicht', async () => {
    server.use(
      http.get(`${BASE}/chat/sessions/sess-1/messages`, () =>
        HttpResponse.json({ messages: [msg({ id: 'm-x', body: 'Vorhanden' })] }),
      ),
      http.post(`${BASE}/chat/sessions/sess-1/reply`, () =>
        HttpResponse.json({ message: msg({ id: 'm-x', body: 'Vorhanden' }) }, { status: 201 }),
      ),
    );
    renderDetail();
    await screen.findByText('Vorhanden');
    await userEvent.type(await screen.findByLabelText('Antwort'), 'egal');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(screen.getAllByText('Vorhanden')).toHaveLength(1));
  });

  it('Beleg-Nachricht mit Body zeigt Link UND Text', async () => {
    server.use(
      http.get(`${BASE}/chat/sessions/sess-1/messages`, () =>
        HttpResponse.json({
          messages: [msg({ id: 'mb', body: 'Hier mein Beleg', beleg_id: 'b-9' })],
        }),
      ),
    );
    renderDetail();
    const link = await screen.findByRole('link', { name: /Beleg ansehen/i });
    expect(link).toHaveAttribute('href', '/belege/b-9');
    expect(screen.getByText('Hier mein Beleg')).toBeInTheDocument();
  });

  it('beendete Session mit Bewertung: zeigt Sterne + Kommentar, keine Antwort-Eingabe', async () => {
    server.use(
      http.get(`${BASE}/chat/sessions/sess-1/messages`, () =>
        HttpResponse.json({
          session: sess({ status: 'closed', rating: 5, rating_comment: 'Top!' }),
          messages: [msg({ id: 'm1', body: 'Danke' })],
        }),
      ),
    );
    renderDetail();
    await waitFor(() =>
      expect(screen.getByLabelText('Bewertung: 5 von 5 Sternen')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Top!/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Antwort')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Senden' })).not.toBeInTheDocument();
  });

  it('„Chat beenden": ruft close-Endpoint und blendet die Antwort-Eingabe aus', async () => {
    server.use(
      http.get(`${BASE}/chat/sessions/sess-1/messages`, () =>
        HttpResponse.json({ session: sess({ status: 'active' }), messages: [] }),
      ),
      http.post(`${BASE}/chat/sessions/sess-1/close`, () =>
        HttpResponse.json({ session: sess({ status: 'closed', closed_by: 'staff' }) }),
      ),
    );
    renderDetail();
    const closeBtn = await screen.findByRole('button', { name: 'Chat beenden' });
    await userEvent.click(closeBtn);
    await waitFor(() => expect(screen.queryByLabelText('Antwort')).not.toBeInTheDocument());
    expect(screen.getByText(/nicht mehr\s+geantwortet/i)).toBeInTheDocument();
  });
});
