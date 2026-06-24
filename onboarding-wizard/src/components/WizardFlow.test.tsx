import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPremium, saveStep } from '../lib/api';
import { WizardFlow } from './WizardFlow';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, saveStep: vi.fn(), requestPremium: vi.fn() };
});
const saveStepMock = vi.mocked(saveStep);
const requestPremiumMock = vi.mocked(requestPremium);

function session(current_step: number, step_data: Record<string, unknown> = {}) {
  return {
    status: 'started' as const,
    current_step,
    step_data,
    premium_setup_requested: false,
    expires_at: new Date().toISOString(),
  };
}

describe('WizardFlow', () => {
  beforeEach(() => {
    saveStepMock.mockReset();
    requestPremiumMock.mockReset();
  });

  it('rendert den Schritt zu current_step inkl. Fortschritt + Navigation', () => {
    render(<WizardFlow token="t" session={session(4)} onSaved={() => {}} />);
    expect(screen.getByText('Schritt 4 von 7')).toBeInTheDocument();
    expect(screen.getByText(/Wie schickst du uns deine Belege/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /zurück/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /überspringen/i })).toBeInTheDocument();
  });

  it('Zurück springt zum vorherigen Schritt', async () => {
    const user = userEvent.setup();
    render(
      <WizardFlow
        token="t"
        session={session(4, { '2': { advisor_system: 'datev_csv' } })}
        onSaved={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /zurück/i }));
    expect(screen.getByText('Schritt 3 von 7')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /DATEV-CSV/i })).toBeInTheDocument();
  });

  it('rückt nach erfolgreichem Speichern eines Schritts vor', async () => {
    saveStepMock.mockResolvedValue(session(6));
    const user = userEvent.setup();
    render(<WizardFlow token="t" session={session(5)} onSaved={() => {}} />);
    // Schritt 5 (Archiv) hat eine Default-Auswahl → direkt Weiter
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    expect(await screen.findByText(/Hast du ein Kassensystem/i)).toBeInTheDocument();
    expect(screen.getByText('Schritt 6 von 7')).toBeInTheDocument();
  });

  it('Überspringen löst Premium-Handoff aus', async () => {
    const premium = { ...session(4), status: 'premium_handoff' as const };
    requestPremiumMock.mockResolvedValue(premium);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<WizardFlow token="tok" session={session(4)} onSaved={onSaved} />);
    await user.click(screen.getByRole('button', { name: /überspringen/i }));
    expect(requestPremiumMock).toHaveBeenCalledWith('tok');
    expect(onSaved).toHaveBeenCalledWith(premium);
  });
});
