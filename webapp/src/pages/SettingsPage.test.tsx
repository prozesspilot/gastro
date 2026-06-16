/**
 * Tests für SettingsPage (A3-Reboot T059): Verbindungs-Checks + Info.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from './SettingsPage';
import { ToastProvider } from '../components/ToastProvider';

function renderSettingsPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('SettingsPage', () => {
  it('rendert ohne Crash', () => {
    renderSettingsPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt die Einstellungen-Überschrift', () => {
    renderSettingsPage();
    expect(screen.getByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument();
  });

  it('zeigt die Verbindungen-Sektion', () => {
    renderSettingsPage();
    expect(screen.getByText('Verbindungen')).toBeInTheDocument();
  });

  it('listet die System-Verbindungen Backend/PostgreSQL/Redis', () => {
    renderSettingsPage();
    expect(screen.getByText('Backend API')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByText('Redis Streams')).toBeInTheDocument();
  });

  it('zeigt nach dem Check den Backend-Status', async () => {
    renderSettingsPage();
    // healthHandlers liefert ok:true → mindestens ein "ok"-Detail erscheint
    await waitFor(() => {
      const body = document.body.textContent ?? '';
      expect(body).toContain('Status: ok');
    });
  });
});
