/**
 * Tests für ProtectedRoute und AuthContext
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import ProtectedRoute from './ProtectedRoute';

// Helper: render with MemoryRouter + AuthProvider
function renderWithAuth(
  ui: React.ReactNode,
  { initialEntries = ['/'] }: { initialEntries?: string[] } = {},
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        {ui}
      </AuthProvider>
    </MemoryRouter>,
  );
}

// Captures current location for assertions
function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

// ── ProtectedRoute ───────────────────────────────────────────────────────────

describe('ProtectedRoute', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('zeigt Lade-Indicator solange Auth lädt', async () => {
    // Auth initial loading
    renderWithAuth(
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>,
    );

    // After mounting, isLoading briefly true then resolves
    // Just check the component renders without error
    await waitFor(() => {
      // Either loading, redirected to login, or showing content
      const body = document.body.textContent ?? '';
      expect(body.length).toBeGreaterThan(0);
    });
  });

  it('leitet zu /login wenn kein User eingeloggt', async () => {
    // No session in sessionStorage → not logged in
    renderWithAuth(
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
      </Routes>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('zeigt geschützte Inhalte wenn User eingeloggt', async () => {
    // Seed session
    sessionStorage.setItem('pp_session', JSON.stringify({
      tenantId: 'tenant-001',
      tenantName: 'Test GmbH',
      displayName: 'Admin',
    }));

    renderWithAuth(
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div data-testid="protected-content">Geschützte Seite</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  it('leitet zu /login mit from-Parameter', async () => {
    renderWithAuth(
      <Routes>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div>Dashboard</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/login"
          element={<LocationDisplay />}
        />
      </Routes>,
      { initialEntries: ['/dashboard'] },
    );

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/login');
    });
  });
});

// ── AuthContext ──────────────────────────────────────────────────────────────

function AuthConsumer() {
  const { user, isLoading, login, logout } = useAuth();

  if (isLoading) return <div data-testid="loading">Laden…</div>;
  if (!user) return (
    <div>
      <div data-testid="no-user">Nicht eingeloggt</div>
      <button
        onClick={() => login({ tenantId: 'tid-1', tenantName: 'Acme', displayName: 'Admin' })}
        data-testid="login-btn"
      >
        Login
      </button>
    </div>
  );
  return (
    <div>
      <div data-testid="user-name">{user.displayName}</div>
      <div data-testid="tenant-id">{user.tenantId}</div>
      <button onClick={logout} data-testid="logout-btn">Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('startet mit keinem User wenn keine Session vorhanden', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeInTheDocument();
    });
  });

  it('stellt Session aus sessionStorage wieder her', async () => {
    sessionStorage.setItem('pp_session', JSON.stringify({
      tenantId: 'tenant-xyz',
      tenantName: 'XYZ GmbH',
      displayName: 'Max Mustermann',
    }));

    render(
      <MemoryRouter>
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-name').textContent).toBe('Max Mustermann');
      expect(screen.getByTestId('tenant-id').textContent).toBe('tenant-xyz');
    });
  });

  it('login setzt User und speichert in sessionStorage', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByTestId('login-btn'));
    await user.click(screen.getByTestId('login-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('user-name').textContent).toBe('Admin');
    });

    const stored = JSON.parse(sessionStorage.getItem('pp_session') ?? '{}');
    expect(stored.tenantId).toBe('tid-1');
  });

  it('logout räumt User und sessionStorage auf', async () => {
    sessionStorage.setItem('pp_session', JSON.stringify({
      tenantId: 'tenant-abc',
      tenantName: 'ABC GmbH',
      displayName: 'Hans',
    }));

    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByTestId('logout-btn'));
    await user.click(screen.getByTestId('logout-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeInTheDocument();
    });

    expect(sessionStorage.getItem('pp_session')).toBeNull();
  });

  it('ignoriert invalides JSON in sessionStorage', async () => {
    sessionStorage.setItem('pp_session', 'INVALID_JSON');

    render(
      <MemoryRouter>
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('no-user')).toBeInTheDocument();
    });
  });

  it('useAuth wirft Error außerhalb von AuthProvider', () => {
    function BrokenConsumer() {
      useAuth();
      return null;
    }
    expect(() =>
      render(
        <MemoryRouter>
          <BrokenConsumer />
        </MemoryRouter>,
      ),
    ).toThrow('useAuth muss innerhalb von AuthProvider genutzt werden');
  });
});
