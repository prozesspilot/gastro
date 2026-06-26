/**
 * T071 — Tests für App (Token-Parsing + Session-Zustände).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App, { getTokenFromPath } from './App';
import * as api from './lib/api';

vi.mock('./lib/api', async (orig) => {
  const actual = await orig<typeof import('./lib/api')>();
  return {
    ...actual,
    getSession: vi.fn(),
    listMessages: vi.fn(async () => []),
    sendMessage: vi.fn(),
    uploadBeleg: vi.fn(),
  };
});

describe('getTokenFromPath', () => {
  it('liest das erste Pfad-Segment', () => {
    expect(getTokenFromPath('/abc123')).toBe('abc123');
  });
  it('unterstützt /c/<token>', () => {
    expect(getTokenFromPath('/c/xyz-789')).toBe('xyz-789');
  });
  it('null bei leerem Pfad', () => {
    expect(getTokenFromPath('/')).toBeNull();
  });
});

const session = (over: Partial<api.PublicChatSession>): api.PublicChatSession => ({
  status: 'active',
  expires_at: null,
  closed_at: null,
  rating: null,
  rating_comment: null,
  ...over,
});

describe('App — Session-Zustände', () => {
  it('aktive Session → Chat-Eingabe sichtbar', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session({ status: 'active' }));
    render(<App initialToken="tok" />);
    await waitFor(() => expect(screen.getByLabelText('Nachricht')).toBeInTheDocument());
    expect(screen.getByLabelText('Beleg hochladen')).toBeInTheDocument();
  });

  it('beendete Session ohne Bewertung → Sterne-Abfrage', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session({ status: 'closed' }));
    render(<App initialToken="tok" />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /chat beendet/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Bewertung senden' })).toBeInTheDocument();
  });

  it('beendete Session mit Bewertung → Danke-Ansicht', async () => {
    vi.mocked(api.getSession).mockResolvedValue(
      session({ status: 'closed', rating: 4, rating_comment: 'Top Service' }),
    );
    render(<App initialToken="tok" />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /danke für deine bewertung/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Top Service/)).toBeInTheDocument();
  });

  it('410 → „Chat nicht mehr aktiv"', async () => {
    vi.mocked(api.getSession).mockRejectedValue(new api.ChatApiError(410, 'weg', 'revoked'));
    render(<App initialToken="tok" />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /nicht mehr aktiv/i })).toBeInTheDocument(),
    );
  });

  it('404 → „Link ungültig"', async () => {
    vi.mocked(api.getSession).mockRejectedValue(new api.ChatApiError(404, 'weg', 'not_found'));
    render(<App initialToken="tok" />);
    await waitFor(() => expect(screen.getByText(/ungültig/i)).toBeInTheDocument());
  });

  it('revoked Session → „Chat nicht mehr aktiv"', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session({ status: 'revoked' }));
    render(<App initialToken="tok" />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /nicht mehr aktiv/i })).toBeInTheDocument(),
    );
  });

  it('kein Token → Fehlermeldung', async () => {
    render(<App initialToken={null} />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /schiefgelaufen/i })).toBeInTheDocument(),
    );
  });
});
