import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveStep } from '../lib/api';
import { Step2Steuerberater } from './Step2Steuerberater';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, saveStep: vi.fn() };
});
const saveStepMock = vi.mocked(saveStep);

const SESSION = {
  status: 'started' as const,
  current_step: 3,
  step_data: {},
  premium_setup_requested: false,
  expires_at: new Date().toISOString(),
};

describe('Step2Steuerberater', () => {
  beforeEach(() => saveStepMock.mockReset());

  it('blockt bei leerer Kanzlei und ruft saveStep NICHT', async () => {
    const user = userEvent.setup();
    render(<Step2Steuerberater token="t" onSaved={() => {}} />);
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    expect(saveStepMock).not.toHaveBeenCalled();
  });

  it('sendet gültige Daten inkl. advisor_system und ruft onSaved', async () => {
    saveStepMock.mockResolvedValue(SESSION);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<Step2Steuerberater token="tok" onSaved={onSaved} />);
    await user.type(screen.getByLabelText('Steuerberater-Kanzlei'), 'Kanzlei Müller');
    await user.type(screen.getByLabelText('Ansprechpartner'), 'Frau Müller');
    await user.type(screen.getByLabelText('E-Mail Steuerberater'), 'kanzlei@example.de');
    await user.selectOptions(screen.getByLabelText(/Welches System/i), 'sevdesk');
    await user.click(screen.getByRole('button', { name: /weiter/i }));

    expect(saveStepMock).toHaveBeenCalledTimes(1);
    const [token, step, payload] = saveStepMock.mock.calls[0];
    expect(token).toBe('tok');
    expect(step).toBe(2);
    expect(payload).toMatchObject({
      steuerberater_kanzlei: 'Kanzlei Müller',
      ansprechpartner: 'Frau Müller',
      steuerberater_email: 'kanzlei@example.de',
      advisor_system: 'sevdesk',
    });
    // leeres optionales Telefon wird nicht mitgesendet
    expect(payload).not.toHaveProperty('steuerberater_telefon');
    expect(onSaved).toHaveBeenCalledWith(SESSION);
  });
});
