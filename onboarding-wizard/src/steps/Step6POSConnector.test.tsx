import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveStep, startSumupConnect } from '../lib/api';
import { Step6POSConnector } from './Step6POSConnector';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, saveStep: vi.fn(), startSumupConnect: vi.fn() };
});
const saveStepMock = vi.mocked(saveStep);
const startSumupMock = vi.mocked(startSumupConnect);

const SESSION = {
  status: 'started' as const,
  current_step: 7,
  step_data: {},
  premium_setup_requested: false,
  expires_at: new Date().toISOString(),
};

// jsdom: window.location ersetzen (nur search/pathname werden gelesen) + assign mocken.
let originalLocation: Location;
function mockLocation(search: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/tok', search, assign: vi.fn() },
  });
}

describe('Step6POSConnector', () => {
  beforeEach(() => {
    saveStepMock.mockReset();
    startSumupMock.mockReset();
    originalLocation = window.location;
    window.history.replaceState = vi.fn();
    mockLocation('');
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('speichert eine Nicht-SumUp-Auswahl ohne pos_system', async () => {
    saveStepMock.mockResolvedValue(SESSION);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<Step6POSConnector token="tok" onSaved={onSaved} />);
    await user.click(screen.getByRole('radio', { name: /klassische Kasse/i }));
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    expect(saveStepMock).toHaveBeenCalledWith('tok', 6, { pos_choice: 'classic' });
    expect(onSaved).toHaveBeenCalledWith(SESSION);
  });

  it('startet den SumUp-OAuth-Flow (persistiert Auswahl + navigiert zur redirect_url)', async () => {
    saveStepMock.mockResolvedValue(SESSION);
    startSumupMock.mockResolvedValue({ redirect_url: 'https://api.sumup.com/authorize?state=xyz' });
    const user = userEvent.setup();
    render(<Step6POSConnector token="tok" onSaved={() => {}} />);
    await user.click(screen.getByRole('button', { name: /mit sumup verbinden/i }));
    expect(saveStepMock).toHaveBeenCalledWith('tok', 6, {
      pos_choice: 'sumup',
      pos_system: 'sumup_lite',
      pos_connected: false,
    });
    expect(startSumupMock).toHaveBeenCalledWith('tok');
    expect(window.location.assign).toHaveBeenCalledWith(
      'https://api.sumup.com/authorize?state=xyz',
    );
  });

  it('zeigt nach Rückkehr (?pos_connected=sumup) den Verbunden-Badge', () => {
    mockLocation('?pos_connected=sumup');
    render(<Step6POSConnector token="tok" onSaved={() => {}} />);
    expect(screen.getByText(/SumUp verbunden/i)).toBeInTheDocument();
  });
});
