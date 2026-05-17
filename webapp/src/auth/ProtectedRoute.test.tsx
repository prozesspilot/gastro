/**
 * M14 — Tests für ProtectedRoute (mit echtem JWT-AuthContext)
 */

import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../tests/msw/server';
import { AuthProvider } from './AuthContext';
import ProtectedRoute from './ProtectedRoute';

function makeAccessToken(claims: Record<string, unknown>): string {
  // Test-Helper: kein gültiger JWT für Server, aber decodierbar für token-refresh.
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.sig`;
}

const inFuture = Math.floor(Date.now() / 1000) + 600;

function withSession(opts: { user?: Record<string, unknown>; refreshStatus?: number } = {}) {
  const user = opts.user ?? {
    id: 'usr_1', email: 'admin@test.de', display_name: 'Admin',
    tenant_id: 'tnt_x', permissions: ['*'], preset: 'super_admin',
    is_active: true, password_must_change: false, last_login_at: null, created_at: '',
  };
  const token = makeAccessToken({ sub: user.id, tenant_id: user.tenant_id, permissions: user.permissions, preset: user.preset, exp: inFuture });
  server.use(
    http.post('/api/v1/auth/refresh', () =>
      HttpResponse.json({ ok: true, data: { access_token: token, user } }),
    ),
  );
}

function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('leitet zu /login wenn kein User eingeloggt', async () => {
    // default MSW handler antwortet 401 auf /auth/refresh
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <AuthProvider>
          <Routes>
            <Route path="/protected" element={<ProtectedRoute><div>Protected</div></ProtectedRoute>} />
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('zeigt geschützte Inhalte wenn User eingeloggt', async () => {
    withSession();
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <AuthProvider>
          <Routes>
            <Route path="/protected" element={<ProtectedRoute><div data-testid="content">Geschützte Seite</div></ProtectedRoute>} />
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });
  });

  it('leitet bei password_must_change auf /change-password', async () => {
    withSession({
      user: {
        id: 'usr_2', email: 'new@test.de', display_name: 'Neu',
        tenant_id: 'tnt_y', permissions: ['receipts.read'], preset: 'operator',
        is_active: true, password_must_change: true, last_login_at: null, created_at: '',
      },
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<ProtectedRoute><div>Home</div></ProtectedRoute>} />
            <Route path="/change-password" element={<LocationDisplay />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/change-password');
    });
  });

  it('zeigt 403-Hinweis wenn Permission fehlt', async () => {
    withSession({
      user: {
        id: 'usr_3', email: 'op@test.de', display_name: 'Op',
        tenant_id: 'tnt_x', permissions: ['receipts.read'], preset: 'operator',
        is_active: true, password_must_change: false, last_login_at: null, created_at: '',
      },
    });
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin"
              element={
                <ProtectedRoute requirePermission="users.manage">
                  <div>Admin-Only</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/users.manage/);
    });
  });
});
