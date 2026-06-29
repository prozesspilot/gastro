import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WizardApiError, connectLexware, saveStep } from '../lib/api';
import { Step3OAuthAccountant } from './Step3OAuthAccountant';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, saveStep: vi.fn(), connectLexware: vi.fn() };
});
const saveStepMock = vi.mocked(saveStep);
const connectLexwareMock = vi.mocked(connectLexware);

const SESSION = {
  status: 'started' as const,
  current_step: 4,
  step_data: {},
  premium_setup_requested: false,
  expires_at: new Date().toISOString(),
};

describe('Step3OAuthAccountant', () => {
  beforeEach(() => {
    saveStepMock.mockReset();
    connectLexwareMock.mockReset();
  });

  it('lexware: gültigen Schlüssel speichern → verbunden → Weiter persistiert lexware_connected', async () => {
    connectLexwareMock.mockResolvedValue({ ok: true, company_name: 'Pizzeria Bella GmbH' });
    saveStepMock.mockResolvedValue(SESSION);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<Step3OAuthAccountant token="tok" onSaved={onSaved} advisorSystem="lexware_office" />);

    await user.type(screen.getByLabelText(/API-Schlüssel/i), 'gueltigerschluessel123');
    await user.click(screen.getByRole('button', { name: /speichern & prüfen/i }));

    expect(connectLexwareMock).toHaveBeenCalledWith('tok', 'gueltigerschluessel123', undefined);
    // Verbunden-Ansicht mit Firmenname.
    expect(await screen.findByText(/Verbunden mit Pizzeria Bella GmbH/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^weiter$/i }));
    expect(saveStepMock).toHaveBeenCalledWith('tok', 3, {
      acknowledged: true,
      advisor_system: 'lexware_office',
      lexware_connected: true,
      company_name: 'Pizzeria Bella GmbH',
    });
    expect(onSaved).toHaveBeenCalledWith(SESSION);
  });

  it('lexware: „Speichern & prüfen" ist gesperrt, solange der Schlüssel zu kurz ist', async () => {
    const user = userEvent.setup();
    render(<Step3OAuthAccountant token="tok" onSaved={() => {}} advisorSystem="lexware_office" />);
    const btn = screen.getByRole('button', { name: /speichern & prüfen/i });
    expect(btn).toBeDisabled();
    await user.type(screen.getByLabelText(/API-Schlüssel/i), 'langgenug12');
    expect(btn).toBeEnabled();
  });

  it('lexware: Überspringen persistiert lexware_connected=false ohne connectLexware', async () => {
    saveStepMock.mockResolvedValue(SESSION);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<Step3OAuthAccountant token="tok" onSaved={onSaved} advisorSystem="lexware_office" />);

    await user.click(screen.getByRole('button', { name: /überspringen/i }));
    expect(connectLexwareMock).not.toHaveBeenCalled();
    expect(saveStepMock).toHaveBeenCalledWith('tok', 3, {
      acknowledged: true,
      advisor_system: 'lexware_office',
      lexware_connected: false,
      company_name: null,
    });
    expect(onSaved).toHaveBeenCalledWith(SESSION);
  });

  it('lexware: abgelehnter Schlüssel zeigt die Fehlermeldung und bleibt im Eingabe-Schritt', async () => {
    connectLexwareMock.mockRejectedValue(
      new WizardApiError(422, 'Lexware hat diesen API-Schlüssel abgelehnt.', 'token_rejected'),
    );
    const user = userEvent.setup();
    render(<Step3OAuthAccountant token="tok" onSaved={() => {}} advisorSystem="lexware_office" />);

    await user.type(screen.getByLabelText(/API-Schlüssel/i), 'falscherschluessel1');
    await user.click(screen.getByRole('button', { name: /speichern & prüfen/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/abgelehnt/i);
    // Eingabefeld bleibt sichtbar (keine Verbunden-Ansicht).
    expect(screen.getByLabelText(/API-Schlüssel/i)).toBeInTheDocument();
  });

  it('datev_csv: zeigt den CSV-Hinweis ohne Schlüssel-Eingabe und rückt vor', async () => {
    saveStepMock.mockResolvedValue(SESSION);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<Step3OAuthAccountant token="t" onSaved={onSaved} advisorSystem="datev_csv" />);

    expect(screen.getByRole('heading', { name: /DATEV-CSV/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/API-Schlüssel/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /verstanden/i }));
    expect(saveStepMock).toHaveBeenCalledWith('t', 3, {
      acknowledged: true,
      advisor_system: 'datev_csv',
      lexware_connected: false,
      company_name: null,
    });
  });
});
