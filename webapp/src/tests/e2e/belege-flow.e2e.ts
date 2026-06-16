/**
 * Playwright-E2E: Belege-Flow (A3-Reboot T059)
 *
 * Spec: Mitarbeiter_Webapp.md §11.2 + M14_User_Verwaltung_Auth.md §6.2
 *
 * Ersetzt receipt-flow.e2e.ts (Geister-Welt: /receipts, /advisor, /settings/dsgvo
 * wurden im A3-Reboot entfernt). Prüft, dass die belege-Welt-Routen nach dem
 * M14-Cookie-Login erreichbar sind (kein Redirect auf /login).
 *
 * Auth-Modell: M14-Cookie-Session (`pp_auth`); Blaupause: auth.e2e.ts.
 */

import { test, expect } from '@playwright/test';

// ── Shared Session-User ───────────────────────────────────────────────────────

const SESSION_USER = {
  id: 'usr_root',
  display_name: 'Root',
  role: 'geschaeftsfuehrer',
  login_method: 'emergency',
};

// ── Auth-Stub (identisches Pattern wie auth.e2e.ts) ───────────────────────────

/**
 * Stubt das M14-Backend per page.route().
 *
 * Session-State liegt im Closure (nicht auf window), damit Navigation nach
 * Login (page.goto('/belege') etc.) den Flag nicht über addInitScript
 * zurücksetzt. Erst nach erfolgreichem POST /notfall/login liefert /session 200.
 */
async function stubAuth(page: import('@playwright/test').Page, opts: {
  loginFails?: boolean;
} = {}) {
  let loggedIn = false;

  await page.route('**/api/v1/auth/notfall/login', async (route) => {
    if (opts.loginFails) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_credentials', message: 'fail' }),
      });
    }
    loggedIn = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'set-cookie': 'pp_auth=stub; Path=/; HttpOnly' },
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route('**/api/v1/auth/session', async (route) => {
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

  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'NO_REFRESH_TOKEN', message: 'kein Cookie' } }),
    }),
  );

  await page.route('**/api/v1/auth/logout', async (route) => {
    loggedIn = false;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { logged_out: true } }),
    });
  });

  // Layout (A3-Reboot) fragt nur GET /tenants für den Mandanten-Selector an.
  await page.route('**/api/v1/tenants', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [] }),
    }),
  );
  // Belege-Liste (falls ein Tenant aktiv ist) leer zurückgeben.
  await page.route('**/api/v1/belege*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ belege: [], pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 } }),
    }),
  );
}

// Notfall-Login ist standardmäßig zugeklappt (Discord-OAuth ist Primär-Pfad).
async function openEmergencyLogin(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /notfall-login/i }).click();
}

/** Führt den vollen Notfall-Login-Flow durch und wartet auf Dashboard. */
async function performLogin(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await openEmergencyLogin(page);
  await page.getByLabel(/email/i).fill('root@test.de');
  await page.getByLabel('Passwort', { exact: true }).fill('SuperGeheim1234!');
  await page.getByLabel(/totp/i).fill('123456');
  await page.getByRole('button', { name: /notfall-anmeldung/i }).click();
  await expect(page).toHaveURL(/\/$|\/dashboard/, { timeout: 10_000 });
}

// ── Belege-Flow ───────────────────────────────────────────────────────────────

test.describe('Belege-Flow', () => {
  test('Login-Page ist erreichbar und zeigt Discord-Login-Button', async ({ page }) => {
    await stubAuth(page);
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /discord/i })).toBeVisible({ timeout: 10_000 });
    // Kein Mandanten-Dropdown auf der Login-Page (Tenant-Wahl erst nach Login).
    await expect(page.getByLabel(/mandant/i)).not.toBeVisible();
  });

  test('Notfall-Login-Toggle öffnet Email/Passwort/TOTP-Felder', async ({ page }) => {
    await stubAuth(page);
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).not.toBeVisible();
    await openEmergencyLogin(page);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel('Passwort', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/totp/i)).toBeVisible();
  });

  test('Login via Notfall-Login → Dashboard erreichbar', async ({ page }) => {
    await stubAuth(page);
    await performLogin(page);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Upload-Page (/belege/upload) ist nach M14-Cookie-Login erreichbar', async ({ page }) => {
    await stubAuth(page);
    await performLogin(page);
    await page.goto('/belege/upload');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Belege-Liste (/belege) rendert nach M14-Cookie-Login', async ({ page }) => {
    await stubAuth(page);
    await performLogin(page);
    await page.goto('/belege');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Mandanten-Liste (/tenants) ist nach M14-Cookie-Login erreichbar', async ({ page }) => {
    await stubAuth(page);
    await performLogin(page);
    await page.goto('/tenants');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Settings-Page (/settings) ist nach M14-Cookie-Login erreichbar', async ({ page }) => {
    await stubAuth(page);
    await performLogin(page);
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/\/login/);
  });
});
