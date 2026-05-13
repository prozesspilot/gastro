/**
 * M14 — Playwright-E2E: vollständiger Auth-Lifecycle
 *
 * Spec: Konzeptentwicklung/modules/M14_User_Verwaltung_Auth.md §6.2 + §6.4
 *
 * Stubt das Backend per page.route(), damit der Test ohne echten Server läuft.
 * Szenarien:
 *   1. Login als super_admin → Dashboard
 *   2. Forced password_must_change → Redirect auf /change-password
 *   3. Logout → zurück auf /login
 *   4. Falsche Credentials → generischer Fehler
 */

import { expect, test } from '@playwright/test';

function jwtFor(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ ...claims, exp: Math.floor(Date.now() / 1000) + 600 })}.sig`;
}

const SUPER_ADMIN = {
  id: 'usr_root', email: 'root@test.de', display_name: 'Root',
  tenant_id: null, permissions: ['*'], preset: 'super_admin',
  is_active: true, password_must_change: false, last_login_at: null, created_at: '',
};

const NEW_USER = {
  id: 'usr_neu', email: 'neu@test.de', display_name: 'Neu',
  tenant_id: 'tnt_a', permissions: ['receipts.read'], preset: 'operator',
  is_active: true, password_must_change: true, last_login_at: null, created_at: '',
};

async function stubAuth(page: import('@playwright/test').Page, opts: {
  loginUser?: Record<string, unknown>;
  loginFails?: boolean;
} = {}) {
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'NO_REFRESH_TOKEN', message: 'kein Cookie' } }),
    }),
  );

  await page.route('**/api/v1/auth/login', (route) => {
    if (opts.loginFails) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'fail' } }),
      });
    }
    const user = opts.loginUser ?? SUPER_ADMIN;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'set-cookie': 'pp_refresh=stub; Path=/api/v1/auth; HttpOnly' },
      body: JSON.stringify({
        ok: true,
        data: {
          access_token: jwtFor({ sub: user.id, tenant_id: user.tenant_id, permissions: user.permissions, preset: user.preset }),
          user,
        },
      }),
    });
  });

  await page.route('**/api/v1/auth/logout', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { logged_out: true } }) }),
  );

  // Belegt /receipts/stats (vom Layout angefragt) damit Dashboard-Render nicht crasht
  await page.route('**/api/v1/customers/*/stats', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { customer_id: 'c1', receipts_by_month: [], by_category: [], top_suppliers: [], export_rate: {}, processing_times: {} } }) }),
  );
  await page.route('**/api/v1/tenants', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) }),
  );
  await page.route('**/api/v1/receipts/stats', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { total: 0, by_status: {}, by_source: {}, today_count: 0, this_week_count: 0 } }) }),
  );
}

test.describe('M14 Auth E2E', () => {
  test('Login als super_admin → Dashboard', async ({ page }) => {
    await stubAuth(page);
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('root@test.de');
    await page.getByLabel('Passwort', { exact: true }).fill('SuperGeheim1234!');
    await page.getByRole('button', { name: /anmelden/i }).click();
    // Nach Login Redirect — kein Login-Heading mehr (Dashboard wird gerendert).
    await expect(page).toHaveURL(/\/$|\/dashboard/);
  });

  test('Falsche Credentials → generische Fehlermeldung', async ({ page }) => {
    await stubAuth(page, { loginFails: true });
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('falsch@test.de');
    await page.getByLabel('Passwort', { exact: true }).fill('wrong');
    await page.getByRole('button', { name: /anmelden/i }).click();
    await expect(page.getByRole('alert')).toContainText(/Login fehlgeschlagen/i);
  });

  test('password_must_change → Redirect /change-password', async ({ page }) => {
    await stubAuth(page, { loginUser: NEW_USER });
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('neu@test.de');
    await page.getByLabel('Passwort', { exact: true }).fill('temp-pwd-1234XY');
    await page.getByRole('button', { name: /anmelden/i }).click();
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole('heading', { name: /passwort ändern/i })).toBeVisible();
  });

  test('Logout vom Dashboard zurück zu /login', async ({ page }) => {
    await stubAuth(page);
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('root@test.de');
    await page.getByLabel('Passwort', { exact: true }).fill('SuperGeheim1234!');
    await page.getByRole('button', { name: /anmelden/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    // UserMenu öffnen → Logout
    await page.getByLabel(/benutzermenü/i).click();
    await page.getByRole('menuitem', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
