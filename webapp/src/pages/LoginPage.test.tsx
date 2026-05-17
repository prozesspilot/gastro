/**
 * M14 — Tests für LoginPage (Email + Password)
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../tests/msw/server';
import { AuthProvider } from '../auth/AuthContext';
import LoginPage from './LoginPage';

const inFuture = Math.floor(Date.now() / 1000) + 600;

function tokenFor(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.sig`;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Dashboard</div>} />
          <Route path="/change-password" element={<div>Change-Pwd</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('zeigt ProzessPilot Heading + Email + Password', async () => {
    renderLogin();
    expect(await screen.findByRole('heading', { name: 'ProzessPilot' })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/passwort/i)).toBeInTheDocument();
  });

  it('Login leitet zu Dashboard weiter', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({
          ok: true,
          data: {
            access_token: tokenFor({ sub: 'usr_1', tenant_id: 't1', permissions: ['*'], preset: 'super_admin', exp: inFuture }),
            user: {
              id: 'usr_1', email: 'admin@test.de', display_name: 'Admin',
              tenant_id: 't1', permissions: ['*'], preset: 'super_admin',
              is_active: true, password_must_change: false, last_login_at: null, created_at: '',
            },
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(await screen.findByLabelText(/email/i), 'admin@test.de');
    await user.type(screen.getByLabelText(/passwort/i), 'SuperSecret123!');
    await user.click(screen.getByRole('button', { name: /anmelden/i }));
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('Falsche Credentials → generische Fehlermeldung', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json(
          { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'fail' } },
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(await screen.findByLabelText(/email/i), 'foo@bar.de');
    await user.type(screen.getByLabelText(/passwort/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /anmelden/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/login fehlgeschlagen/i);
    });
  });

  it('Bei password_must_change → Redirect /change-password', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({
          ok: true,
          data: {
            access_token: tokenFor({ sub: 'usr_2', tenant_id: 't1', permissions: ['receipts.read'], preset: 'operator', exp: inFuture }),
            user: {
              id: 'usr_2', email: 'neu@test.de', display_name: 'Neu',
              tenant_id: 't1', permissions: ['receipts.read'], preset: 'operator',
              is_active: true, password_must_change: true, last_login_at: null, created_at: '',
            },
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(await screen.findByLabelText(/email/i), 'neu@test.de');
    await user.type(screen.getByLabelText(/passwort/i), 'temp-passwort-XY');
    await user.click(screen.getByRole('button', { name: /anmelden/i }));
    await waitFor(() => {
      expect(screen.getByText('Change-Pwd')).toBeInTheDocument();
    });
  });

  it('Account locked → spezifische Fehlermeldung', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json(
          { ok: false, error: { code: 'ACCOUNT_LOCKED', message: 'locked' } },
          { status: 423 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderLogin();
    await user.type(await screen.findByLabelText(/email/i), 'a@b.de');
    await user.type(screen.getByLabelText(/passwort/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /anmelden/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/gesperrt/i);
    });
  });
});
