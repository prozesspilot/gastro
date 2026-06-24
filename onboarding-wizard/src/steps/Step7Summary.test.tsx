import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeWizard } from '../lib/api';
import { Step7Summary } from './Step7Summary';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, completeWizard: vi.fn() };
});
const completeMock = vi.mocked(completeWizard);

const STEP_DATA = {
  '1': { firmenname: 'Pizzeria Bella' },
  '2': { steuerberater_kanzlei: 'Kanzlei Müller', advisor_system: 'lexware_office' },
  '4': { input_channels: ['whatsapp', 'email'] },
  '5': { archive_provider: 'google_drive' },
  '6': { pos_choice: 'sumup', pos_system: 'sumup_lite', pos_connected: true },
};

const COMPLETED = {
  status: 'completed' as const,
  current_step: 7,
  step_data: STEP_DATA,
  premium_setup_requested: false,
  expires_at: new Date().toISOString(),
};

describe('Step7Summary', () => {
  beforeEach(() => completeMock.mockReset());

  it('zeigt die gesammelten Angaben in der Übersicht', () => {
    render(<Step7Summary token="t" onSaved={() => {}} stepData={STEP_DATA} />);
    expect(screen.getByText('Pizzeria Bella')).toBeInTheDocument();
    expect(screen.getByText(/Lexware Office/)).toBeInTheDocument();
    expect(screen.getByText(/WhatsApp \+ E-Mail/)).toBeInTheDocument();
    expect(screen.getByText('Google Drive')).toBeInTheDocument();
    expect(screen.getByText(/SumUp \(verbunden\)/)).toBeInTheDocument();
  });

  it('schließt den Wizard via completeWizard ab', async () => {
    completeMock.mockResolvedValue(COMPLETED);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<Step7Summary token="tok" onSaved={onSaved} stepData={STEP_DATA} />);
    await user.click(screen.getByRole('button', { name: /setup abschließen/i }));
    expect(completeMock).toHaveBeenCalledWith('tok');
    expect(onSaved).toHaveBeenCalledWith(COMPLETED);
  });
});
