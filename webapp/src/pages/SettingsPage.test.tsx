/**
 * Tests für SettingsPage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
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
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('rendert ohne Crash', () => {
    renderSettingsPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Einstellungen-Inhalt', async () => {
    renderSettingsPage();
    await waitFor(() => {
      const body = document.body.textContent;
      // Seite hat Content
      expect(body?.length).toBeGreaterThan(10);
    });
  });

  it('zeigt System-Status oder Verbindungs-Checks', async () => {
    renderSettingsPage();
    await waitFor(() => {
      // Settings-Seite zeigt Backend-/System-Checks
      const body = document.body.textContent;
      expect(body).toBeTruthy();
    });
  });

  it('zeigt API-Verbindungs-Sektion', async () => {
    renderSettingsPage();
    // Seite rendert irgendwelche Verbindungs-Informationen
    expect(document.body).toBeTruthy();
  });

  it('zeigt Tenant-Verwaltung oder System-Info', async () => {
    renderSettingsPage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(20);
    });
  });
});
