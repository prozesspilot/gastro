/**
 * M14 — Playwright-E2E: vollständiger Auth-Lifecycle
 *
 * Spec: Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md §6.2 + §6.4
 *
 * Stubt das M14-Backend per page.route() (Cookie-Session-Flow):
 *   - POST /api/v1/auth/notfall/login → setzt pp_auth-Cookie
 *   - GET  /api/v1/auth/session       → gibt M14SessionUser zurück
 *   - POST /api/v1/auth/logout        → endet Session
 *
 * Szenarien:
 *   1. Login als Geschäftsführer → Dashboard
 *   2. Logout → zurück auf /login
 *   3. Falsche Credentials → generischer Fehler
 *
 * Note: password_must_change-Flow gibt's im M14-Cookie-Flow nicht mehr — Test entfernt.
 */

import { expect, test } from '@playwright/test';

const SESSION_USER = {
  id: 'usr_root',
  display_name: 'Root',
  role: 'geschaeftsfuehrer',
  login_method: 'emergency',
};

async function stubAuth(page: import('@playwright/test').Page, opts: {
  loginFails?: boolean;
} = {}) {
  // Session-State: erst nach erfolgreichem Login auf true setzen.
  // Sonst würde LoginPage uns sofort vom /login wegredirecten (user-useEffect).
  await page.addInitScript(() => {
    (globalThis as { __ppLoggedIn?: boolean }).__ppLoggedIn = false;
  });

  // Notfall-Login-Endpoint (POST) — BASE in auth.ts ist /api/v1/auth
  await page.route('**/api/v1/auth/notfall/login', async (route) => {
    if (opts.loginFails) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_credentials', message: 'fail' }),
      });
    }
    // Erst jetzt darf /session den User liefern.
    await page.evaluate(() => {
      (globalThis as { __ppLoggedIn?: boolean }).__ppLoggedIn = true;
    });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'set-cookie': 'pp_auth=stub; Path=/; HttpOnly' },
      body: JSON.stringify({ ok: true }),
    });
  });

  // Session-Check: 401 vor Login (LoginPage rendert Toggle), 200 nach Login (Dashboard)
  await page.route('**/api/v1/auth/session', async (route) => {
    const loggedIn = await page.evaluate(
      () => (globalThis as { __ppLoggedIn?: boolean }).__ppLoggedIn === true,
    );
    if (!loggedIn) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, user: SESSION_USER }),
    });
  });

  // Refresh-Endpoint (für AuthContext.init)
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'NO_REFRESH_TOKEN', message: 'kein Cookie' } }),
    }),
  );

  await page.route('**/api/v1/auth/logout', async (route) => {
    // Session-Flag zurücksetzen — defensive Konsistenz für Tests, die nach Logout /session erneut prüfen.
    await page.evaluate(() => {
      (globalThis as { __ppLoggedIn?: boolean }).__ppLoggedIn = false;
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { logged_out: true } }) });
  });

  // Layout (A3-Reboot) fragt nur GET /tenants für den Mandanten-Selector an.
  await page.route('**/api/v1/tenants', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) }),
  );
}

// Notfall-Login ist standardmäßig zugeklappt (Discord-OAuth ist Primär-Pfad).
// E2E-Tests müssen den Toggle erst öffnen, bevor Email/Passwort-Felder existieren.
async function openEmergencyLogin(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /notfall-login/i }).click();
}

test.describe('M14 Auth E2E', () => {
  test('Login als super_admin → Dashboard', async ({ page }) => {
    await stubAuth(page);
    await page.goto('/login');
    await openEmergencyLogin(page);
    await page.getByLabel(/email/i).fill('root@test.de');
    await page.getByLabel('Passwort', { exact: true }).fill('SuperGeheim1234!');
    await page.getByLabel(/totp/i).fill('123456');
    await page.getByRole('button', { name: /notfall-anmeldung/i }).click();
    // Nach Login Redirect — kein Login-Heading mehr (Dashboard wird gerendert).
    await expect(page).toHaveURL(/\/$|\/dashboard/);
  });

  test('Falsche Credentials → generische Fehlermeldung', async ({ page }) => {
    await stubAuth(page, { loginFails: true });
    await page.goto('/login');
    await openEmergencyLogin(page);
    await page.getByLabel(/email/i).fill('falsch@test.de');
    await page.getByLabel('Passwort', { exact: true }).fill('wrong');
    await page.getByLabel(/totp/i).fill('123456');
    await page.getByRole('button', { name: /notfall-anmeldung/i }).click();
    await expect(page.getByRole('alert')).toContainText(/zugangsdaten ungültig/i);
  });

  // Hinweis: password_must_change-Flow gibt's im M14-Cookie-Session-Modell nicht mehr —
  // der entsprechende Test wurde entfernt. Passwort-Change ist jetzt manuell über Settings.

  test('Logout vom Dashboard zurück zu /login', async ({ page }) => {
    await stubAuth(page);
    await page.goto('/login');
    await openEmergencyLogin(page);
    await page.getByLabel(/email/i).fill('root@test.de');
    await page.getByLabel('Passwort', { exact: true }).fill('SuperGeheim1234!');
    await page.getByLabel(/totp/i).fill('123456');
    await page.getByRole('button', { name: /notfall-anmeldung/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    // UserMenu öffnen → Logout
    await page.getByLabel(/benutzermenü/i).click();
    await page.getByRole('menuitem', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
