import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App, { getTokenFromPath } from './App';
import { getSession, WizardApiError } from './lib/api';

vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api')>();
  return { ...actual, getSession: vi.fn() };
});
const getSessionMock = vi.mocked(getSession);

const session = (over: Partial<import('./lib/api').PublicSession> = {}) => ({
  status: 'started' as const,
  current_step: 1,
  step_data: {},
  premium_setup_requested: false,
  expires_at: new Date(Date.now() + 86400_000).toISOString(),
  ...over,
});

describe('getTokenFromPath', () => {
  it('liest das erste Pfad-Segment', () => {
    expect(getTokenFromPath('/Xa9Kp2nM4vQ7')).toBe('Xa9Kp2nM4vQ7');
    expect(getTokenFromPath('/tok/step/1')).toBe('tok');
  });
  it('liefert null bei leerem Pfad', () => {
    expect(getTokenFromPath('/')).toBeNull();
    expect(getTokenFromPath('')).toBeNull();
  });
});

describe('App', () => {
  beforeEach(() => getSessionMock.mockReset());

  it('ohne Token → Fehlerhinweis, kein API-Call', () => {
    render(<App initialToken={null} />);
    expect(screen.getByText('Kein Setup-Link.')).toBeInTheDocument();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('lädt Session und zeigt Schritt 1', async () => {
    getSessionMock.mockResolvedValue(session({ current_step: 1 }));
    render(<App initialToken="tok" />);
    expect(await screen.findByText('Erzähl uns von deinem Betrieb')).toBeInTheDocument();
    expect(screen.getByText('Schritt 1 von 7')).toBeInTheDocument();
  });

  it('zeigt Abschluss-Screen bei status=completed', async () => {
    getSessionMock.mockResolvedValue(session({ status: 'completed' }));
    render(<App initialToken="tok" />);
    expect(await screen.findByText(/Setup abgeschlossen/)).toBeInTheDocument();
  });

  it('zeigt „Link abgelaufen" bei 410', async () => {
    getSessionMock.mockRejectedValue(new WizardApiError(410, 'expired', 'expired'));
    render(<App initialToken="tok" />);
    expect(await screen.findByText('Link abgelaufen')).toBeInTheDocument();
  });
});
