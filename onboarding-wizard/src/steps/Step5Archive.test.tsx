import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveStep } from '../lib/api';
import { Step5Archive } from './Step5Archive';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, saveStep: vi.fn() };
});
const saveStepMock = vi.mocked(saveStep);

const SESSION = {
  status: 'started' as const,
  current_step: 6,
  step_data: {},
  premium_setup_requested: false,
  expires_at: new Date().toISOString(),
};

describe('Step5Archive', () => {
  beforeEach(() => saveStepMock.mockReset());

  it('sendet Default-Provider google_drive', async () => {
    saveStepMock.mockResolvedValue(SESSION);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<Step5Archive token="tok" onSaved={onSaved} />);
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    expect(saveStepMock).toHaveBeenCalledWith('tok', 5, { archive_provider: 'google_drive' });
    expect(onSaved).toHaveBeenCalledWith(SESSION);
  });

  it('sendet den gewählten Provider dropbox', async () => {
    saveStepMock.mockResolvedValue(SESSION);
    const user = userEvent.setup();
    render(<Step5Archive token="tok" onSaved={() => {}} />);
    await user.click(screen.getByRole('radio', { name: /Dropbox/i }));
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    expect(saveStepMock).toHaveBeenCalledWith('tok', 5, { archive_provider: 'dropbox' });
  });
});
