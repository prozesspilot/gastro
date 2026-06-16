/**
 * Tests für DashboardPage (A3-Reboot T059): schlanke Belege-Übersicht.
 *
 * Ohne aktiven Mandanten zeigt das Dashboard einen Hinweis statt KPI-Zahlen
 * (getActiveTenantId() ist null → kein /belege-Call, sonst 400 ohne Tenant-Header).
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import { ToastProvider } from '../components/ToastProvider';

function renderDashboard() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('DashboardPage', () => {
  it('rendert ohne Crash', () => {
    renderDashboard();
    expect(document.body).toBeTruthy();
  });

  it('zeigt die Dashboard-Überschrift', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('zeigt einen Link zur Belegliste', () => {
    renderDashboard();
    expect(screen.getByRole('link', { name: /zur belegliste/i })).toBeInTheDocument();
  });

  it('ohne aktiven Mandanten erscheint der Mandanten-Hinweis', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/Mandanten wählen/i)).toBeInTheDocument();
    });
  });
});
