import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveStep } from '../lib/api';
import { Step1Stammdaten } from './Step1Stammdaten';

// Modul mocken, WizardApiError aber erhalten (Step1 importiert beides).
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, saveStep: vi.fn() };
});

const saveStepMock = vi.mocked(saveStep);

const READY_SESSION = {
  status: 'started' as const,
  current_step: 2,
  step_data: {},
  premium_setup_requested: false,
  expires_at: new Date().toISOString(),
};

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Firmenname'), 'Pizzeria Bella');
  await user.type(screen.getByLabelText('Inhaber/Geschäftsführer'), 'Mario Rossi');
  await user.type(screen.getByLabelText('Straße & Hausnummer'), 'Hauptstr. 1');
  await user.type(screen.getByLabelText('PLZ'), '29614');
  await user.type(screen.getByLabelText('Stadt'), 'Soltau');
  await user.type(screen.getByLabelText('Steuernummer'), '11/123/45678');
  await user.type(screen.getByLabelText('Telefon'), '0151 1234567');
  await user.type(screen.getByLabelText('E-Mail'), 'mario@bella.de');
}

describe('Step1Stammdaten', () => {
  beforeEach(() => {
    saveStepMock.mockReset();
  });

  it('zeigt Validierungsfehler und ruft saveStep NICHT bei leerem Formular', async () => {
    const user = userEvent.setup();
    render(<Step1Stammdaten token="t" onSaved={() => {}} />);
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    expect(saveStepMock).not.toHaveBeenCalled();
    expect(screen.getByText('Mindestens 3 Zeichen.')).toBeInTheDocument();
  });

  it('validiert PLZ-Format', async () => {
    const user = userEvent.setup();
    render(<Step1Stammdaten token="t" onSaved={() => {}} />);
    await user.type(screen.getByLabelText('PLZ'), '12');
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    expect(screen.getByText('PLZ muss 5 Ziffern sein.')).toBeInTheDocument();
    expect(saveStepMock).not.toHaveBeenCalled();
  });

  it('sendet Stammdaten bei gültiger Eingabe und ruft onSaved', async () => {
    saveStepMock.mockResolvedValue(READY_SESSION);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<Step1Stammdaten token="tok" onSaved={onSaved} />);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /weiter/i }));

    expect(saveStepMock).toHaveBeenCalledTimes(1);
    const [token, step, payload] = saveStepMock.mock.calls[0];
    expect(token).toBe('tok');
    expect(step).toBe(1);
    expect(payload).toMatchObject({
      firmenname: 'Pizzeria Bella',
      plz: '29614',
      email: 'mario@bella.de',
      rechtsform: 'einzelunternehmen',
      branche: 'restaurant',
      mitarbeiter_anzahl: 1,
      belegvolumen_monat: 0,
    });
    // leere optionale USt-ID wird NICHT mitgesendet (strict schema)
    expect(payload).not.toHaveProperty('ust_id');
    expect(onSaved).toHaveBeenCalledWith(READY_SESSION);
  });
});
