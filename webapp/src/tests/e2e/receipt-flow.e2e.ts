/**
 * G1 — Playwright E2E: Receipt-Flow Tests
 *
 * Spec: Mitarbeiter_Webapp.md §11.2 + M14_User_Verwaltung_Auth.md §6.2
 *
 * Tests:
 *   1. Receipt-Flow (Login + Upload/Liste/Detail)
 *   2. DSGVO-Lösch-Flow (Settings erreichbar)
 *   3. Steuerberater-Export-Download (Advisor-Portal erreichbar)
 *
 * Auth-Modell: M14-Cookie-Session (`pp_auth`).
 * Blaupause: webapp/src/tests/e2e/auth.e2e.ts (stubAuth-Funktion).
 *
 * Hinweis: Multi-Tenant-Switch via Mandanten-Dropdown auf Login-Page
 * gibt es nicht mehr — Tenant-Kontext kommt aus der Server-Session.
 * Dieser Test-Block wurde entfernt (T020).
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
 * Login (page.goto('/upload') etc.) den Flag nicht über addInitScript
 * zurücksetzt. Erst nach erfolgreichem POST /notfall/login liefert /session 200.
 */
async function stubAuth(page: import('@playwright/test').Page, opts: {
  loginFails?: boolean;
} = {}) {
  // Session-State im Closure, NICHT auf window — sonst setzt addInitScript ihn
  // bei jeder Navigation (page.goto nach Login) wieder auf false.
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

  // Layout-Anfragen abdecken damit Dashboard-Render nicht crasht
  await page.route('**/api/v1/customers/*/stats', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { customer_id: 'c1', receipts_by_month: [], by_category: [], top_suppliers: [], export_rate: {}, processing_times: {} } }),
    }),
  );
  await page.route('**/api/v1/tenants', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [] }),
    }),
  );
  await page.route('**/api/v1/receipts/stats', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { total: 0, by_status: {}, by_source: {}, today_count: 0, this_week_count: 0 } }),
    }),
  );
  await page.route('**/api/v1/receipts*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [], meta: { total: 0, page: 1, limit: 20 } }),
    }),
  );
  await page.route('**/api/v1/belege*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: [], meta: { total: 0, page: 1, limit: 20 } }),
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

// ── G1 — Receipt-Flow ─────────────────────────────────────────────────────────

test.describe('G1 — Receipt-Flow', () => {
  test('Login-Page ist erreichbar und zeigt Discord-Login-Button', async ({ page }) => {
    await stubAuth(page);
    await page.goto('/login');
    // Discord-OAuth ist Primär-Pfad — kein "Anmelden"-Button, sondern Discord-Link
    await expect(page.getByRole('link', { name: /discord/i })).toBeVisible({ timeout: 10_000 });
    // Kein Mandanten-Dropdown (wurde entfernt, T020)
    await expect(page.getByLabel(/mandant/i)).not.toBeVisible();
  });

  test('Notfall-Login-Toggle öffnet Email/Passwort/TOTP-Felder', async ({ page }) => {
    await stubAuth(page);
    await page.goto('/login');
    // Vor dem Öffnen des Toggles sind die Felder nicht sichtbar
    await expect(page.getByLabel(/email/i)).not.toBeVisible();
    await openEmergencyLogin(page);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel('Passwort', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/totp/i)).toBeVisible();
  });

  test('Login via Notfall-Login → Dashboard erreichbar', async ({ page }) => {
    await stubAuth(page);
    await performLogin(page);
    // Dashboard oder Root ist erreichbar nach Login
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Upload-Page ist nach M14-Cookie-Login erreichbar', async ({ page }) => {
    await stubAuth(page);
    await performLogin(page);
    await page.goto('/upload');
    await page.waitForLoadState('domcontentloaded');
    // Nicht auf /login redirected = Protected-Route hat M14-Session akzeptiert
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Receipts-Liste-Page rendert nach M14-Cookie-Login', async ({ page }) => {
    await stubAuth(page);
    await performLogin(page);
    await page.goto('/receipts');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/\/login/);
  });
});

// ── G1 — DSGVO-Lösch-Flow ────────────────────────────────────────────────────

test.describe('G1 — DSGVO-Lösch-Flow', () => {
  test('Settings-Page ist nach M14-Cookie-Login erreichbar', async ({ page }) => {
    await stubAuth(page);
    await performLogin(page);
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Settings DSGVO-Route ist nach M14-Cookie-Login erreichbar', async ({ page }) => {
    await stubAuth(page);
    await performLogin(page);
    await page.goto('/settings/dsgvo');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/\/login/);
  });
});

// ── G1 — Steuerberater-Export-Download ───────────────────────────────────────

test.describe('G1 — Steuerberater-Export-Download', () => {
  test('Advisor-Portal ist nach M14-Cookie-Login erreichbar', async ({ page }) => {
    await stubAuth(page);
    // Advisor-Page-Anfragen abfangen damit die Seite nicht crasht
    await page.route('**/api/v1/exports*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: [] }),
      }),
    );
    await performLogin(page);
    await page.goto('/advisor');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/\/login/);
  });
});
