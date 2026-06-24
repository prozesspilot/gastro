import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveStep } from '../lib/api';
import { Step3OAuthAccountant } from './Step3OAuthAccountant';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, saveStep: vi.fn() };
});
const saveStepMock = vi.mocked(saveStep);

const SESSION = {
  status: 'started' as const,
  current_step: 4,
  step_data: {},
  premium_setup_requested: false,
  expires_at: new Date().toISOString(),
};

describe('Step3OAuthAccountant', () => {
  beforeEach(() => saveStepMock.mockReset());

  it('zeigt bei lexware_office den Platzhalter-Button und bestätigt', async () => {
    saveStepMock.mockResolvedValue(SESSION);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(
      <Step3OAuthAccountant token="tok" onSaved={onSaved} advisorSystem="lexware_office" />,
    );
    expect(screen.getByRole('button', { name: /kommt bald/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /verstanden/i }));
    expect(saveStepMock).toHaveBeenCalledWith('tok', 3, {
      acknowledged: true,
      advisor_system: 'lexware_office',
      oauth_status: 'placeholder',
    });
    expect(onSaved).toHaveBeenCalledWith(SESSION);
  });

  it('zeigt bei DATEV-CSV-Systemen den CSV-Hinweis ohne Lexware-Button', () => {
    render(<Step3OAuthAccountant token="t" onSaved={() => {}} advisorSystem="datev_csv" />);
    expect(screen.getByRole('heading', { name: /DATEV-CSV/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /kommt bald/i })).not.toBeInTheDocument();
  });
});
