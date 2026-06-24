import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveStep } from '../lib/api';
import { Step4InputChannel } from './Step4InputChannel';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, saveStep: vi.fn() };
});
const saveStepMock = vi.mocked(saveStep);

const SESSION = {
  status: 'started' as const,
  current_step: 5,
  step_data: {},
  premium_setup_requested: false,
  expires_at: new Date().toISOString(),
};

describe('Step4InputChannel', () => {
  beforeEach(() => saveStepMock.mockReset());

  it('verlangt mindestens einen Kanal', async () => {
    const user = userEvent.setup();
    render(<Step4InputChannel token="t" onSaved={() => {}} />);
    await user.click(screen.getByRole('button', { name: /weiter/i }));
    expect(saveStepMock).not.toHaveBeenCalled();
    expect(screen.getByText(/mindestens einen Kanal/i)).toBeInTheDocument();
  });

  it('sendet die gewählten input_channels als Array', async () => {
    saveStepMock.mockResolvedValue(SESSION);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<Step4InputChannel token="tok" onSaved={onSaved} />);
    await user.click(screen.getByLabelText('whatsapp'));
    await user.click(screen.getByLabelText('email'));
    await user.click(screen.getByRole('button', { name: /weiter/i }));

    expect(saveStepMock).toHaveBeenCalledTimes(1);
    const [, step, payload] = saveStepMock.mock.calls[0];
    expect(step).toBe(4);
    expect(payload).toEqual({ input_channels: ['whatsapp', 'email'] });
    expect(onSaved).toHaveBeenCalledWith(SESSION);
  });
});
