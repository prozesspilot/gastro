/**
 * Tests für LoginPage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import LoginPage from './LoginPage';
import { AuthProvider } from '../auth/AuthContext';

function renderLoginPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('LoginPage', () => {
  // sessionStorage zwischen Tests leeren, damit kein Anmelde-State übertragen wird
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('zeigt ProzessPilot Heading', () => {
    renderLoginPage();
    expect(screen.getByRole('heading', { name: 'ProzessPilot' })).toBeInTheDocument();
  });

  it('zeigt Tenant-Auswahl und Passwort-Feld', async () => {
    renderLoginPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/mandant/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/passwort/i)).toBeInTheDocument();
  });

  it('Submit-Button ist anfangs disabled (kein Tenant gewählt)', async () => {
    // Mock: leere Tenant-Liste
    server.use(
      http.get('/api/v1/tenants', () =>
        HttpResponse.json({ ok: true, data: [], pagination: { total: 0 } }),
      ),
    );
    renderLoginPage();
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /anmelden/i });
      expect(btn).toBeDisabled();
    });
  });

  it('zeigt Tenants in der Auswahl', async () => {
    renderLoginPage();
    await waitFor(() => {
      expect(screen.getByText('Demo-Tenant')).toBeInTheDocument();
    });
  });

  it('Login leitet zu Dashboard weiter', async () => {
    renderLoginPage();
    await waitFor(() => {
      expect(screen.getByText('Demo-Tenant')).toBeInTheDocument();
    });

    const btn = screen.getByRole('button', { name: /anmelden/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    await waitFor(() => {
      // Nach Login → Dashboard
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('zeigt Submit-Button in nicht-ladenden Zustand', async () => {
    renderLoginPage();
    // Nach Laden des Tenants: Button ist sichtbar
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /anmelden/i })).toBeInTheDocument();
    });
  });
});
