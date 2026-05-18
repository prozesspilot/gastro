/**
 * M14 — Tests für LoginPage (Discord-OAuth-first + Notfall-Login)
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../tests/msw/server';
import { AuthProvider } from '../auth/AuthContext';
import LoginPage from './LoginPage';

// M14-Session-Response Helper
function makeM14Session(role: 'geschaeftsfuehrer' | 'mitarbeiter' = 'geschaeftsfuehrer') {
  return {
    ok: true,
    user: {
      id: 'usr-m14-001',
      display_name: 'Steve Bernhardt',
      role,
      login_method: 'emergency' as const,
    },
  };
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Dashboard</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage M14', () => {
  beforeEach(() => {
    // Default: keine aktive M14-Session
    server.use(
      http.get('/api/v1/auth/session', () =>
        HttpResponse.json({ error: 'no_session', message: 'Nicht eingeloggt' }, { status: 401 }),
      ),
    );
  });

  it('zeigt ProzessPilot Heading + Discord-Button', async () => {
    renderLogin();
    expect(await screen.findByRole('heading', { name: 'ProzessPilot' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /mit discord anmelden/i })).toBeInTheDocument();
  });

  it('zeigt Discord-Link mit korrektem href=/api/v1/auth/discord/login', async () => {
    renderLogin();
    const link = await screen.findByRole('link', { name: /mit discord anmelden/i });
    expect(link).toHaveAttribute('href', '/api/v1/auth/discord/login');
  });

  it('Notfall-Login-Link ist sichtbar + expandiert Formular bei Klick', async () => {
    const user = userEvent.setup();
    renderLogin();
    const toggle = await screen.findByRole('button', { name: /notfall-login/i });
    expect(toggle).toBeInTheDocument();
    // Formular zunächst nicht sichtbar
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    // Klick expandiert das Formular
    await user.click(toggle);
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
  });

  it('Notfall-Formular hat Email + Passwort + TOTP-Felder', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(await screen.findByRole('button', { name: /notfall-login/i }));
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/passwort/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/totp-code/i)).toBeInTheDocument();
  });

  it('Notfall-Login-Submit → erfolgreicher Login → Redirect zu /', async () => {
    // Beginn: keine aktive Session (damit Login-Page nicht sofort redirectet)
    // Nach erfolgreichem POST: session gibt gültigen User zurück
    let sessionCalled = 0;
    server.use(
      http.post('/api/v1/auth/notfall/login', () =>
        HttpResponse.json({ ok: true, display_name: 'Steve', role: 'geschaeftsfuehrer', expires_in: 14400 }),
      ),
      http.get('/api/v1/auth/session', () => {
        sessionCalled += 1;
        // Erster Aufruf (beim Mount): keine Session → 401
        // Zweite und folgende Aufrufe (nach Login): gültige Session
        if (sessionCalled <= 1) {
          return HttpResponse.json({ error: 'no_session', message: 'Nicht eingeloggt' }, { status: 401 });
        }
        return HttpResponse.json(makeM14Session());
      }),
    );

    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole('button', { name: /notfall-login/i }));
    await user.type(await screen.findByLabelText(/email/i), 'steve@prozesspilot.net');
    await user.type(screen.getByLabelText(/passwort/i), 'SecurePass123!');
    await user.type(screen.getByLabelText(/totp-code/i), '123456');
    await user.click(screen.getByRole('button', { name: /notfall-anmeldung/i }));

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('Notfall-Login → invalid_credentials → Fehlermeldung', async () => {
    server.use(
      http.post('/api/v1/auth/notfall/login', () =>
        HttpResponse.json(
          { error: 'invalid_credentials', message: 'Anmeldedaten ungültig.' },
          { status: 401 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderLogin();
    await user.click(await screen.findByRole('button', { name: /notfall-login/i }));
    await user.type(await screen.findByLabelText(/email/i), 'wrong@test.de');
    await user.type(screen.getByLabelText(/passwort/i), 'wrong');
    await user.type(screen.getByLabelText(/totp-code/i), '000000');
    await user.click(screen.getByRole('button', { name: /notfall-anmeldung/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/zugangsdaten ungültig/i);
    });
  });

  it('Notfall-Login → totp_invalid → spezifische TOTP-Fehlermeldung', async () => {
    server.use(
      http.post('/api/v1/auth/notfall/login', () =>
        HttpResponse.json(
          { error: 'totp_invalid', message: 'Der eingegebene Code ist ungültig.' },
          { status: 401 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderLogin();
    await user.click(await screen.findByRole('button', { name: /notfall-login/i }));
    await user.type(await screen.findByLabelText(/email/i), 'steve@prozesspilot.net');
    await user.type(screen.getByLabelText(/passwort/i), 'SecurePass123!');
    await user.type(screen.getByLabelText(/totp-code/i), '999999');
    await user.click(screen.getByRole('button', { name: /notfall-anmeldung/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/totp-code ungültig/i);
    });
  });

  it('Notfall-Login → rate_limit → Rate-Limit-Fehlermeldung', async () => {
    server.use(
      http.post('/api/v1/auth/notfall/login', () =>
        HttpResponse.json(
          { error: 'rate_limit_ip', message: 'Zu viele Fehlversuche.' },
          { status: 429 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderLogin();
    await user.click(await screen.findByRole('button', { name: /notfall-login/i }));
    await user.type(await screen.findByLabelText(/email/i), 'steve@prozesspilot.net');
    await user.type(screen.getByLabelText(/passwort/i), 'SecurePass123!');
    await user.type(screen.getByLabelText(/totp-code/i), '123456');
    await user.click(screen.getByRole('button', { name: /notfall-anmeldung/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/zu viele versuche/i);
    });
  });

  it('Loading-State während Submit', async () => {
    // Hängende Anfrage um Loading-State zu prüfen
    server.use(
      http.post('/api/v1/auth/notfall/login', async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return HttpResponse.json({ ok: true }, { status: 200 });
      }),
    );

    const user = userEvent.setup();
    renderLogin();
    await user.click(await screen.findByRole('button', { name: /notfall-login/i }));
    await user.type(await screen.findByLabelText(/email/i), 'steve@prozesspilot.net');
    await user.type(screen.getByLabelText(/passwort/i), 'SecurePass123!');
    await user.type(screen.getByLabelText(/totp-code/i), '123456');

    const submitBtn = screen.getByRole('button', { name: /notfall-anmeldung/i });
    await user.click(submitBtn);

    // Button zeigt Loading-Text
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /wird angemeldet/i })).toBeInTheDocument();
    });
  });

  it('Bereits eingeloggt (M14-Session) → Redirect zu /', async () => {
    // Aktive Session simulieren
    server.use(
      http.get('/api/v1/auth/session', () =>
        HttpResponse.json(makeM14Session()),
      ),
    );

    renderLogin();

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });
});
