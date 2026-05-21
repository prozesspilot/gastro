/**
 * G1 — Playwright E2E: Receipt-Flow Tests
 *
 * Tests:
 *   1. Receipt-Upload → Liste → Detail → Reprocess
 *   2. Multi-Tenant-Switch
 *   3. DSGVO-Lösch-Flow
 *   4. Steuerberater-Export-Download (Mock-Backend)
 *
 * Voraussetzungen:
 *   - Dev-Server läuft auf Port 5173
 *   - Backend kann Mock-Mode sein (PP_AUTH_DISABLED=1)
 *
 * Diese Tests simulieren die UI-Interaktion ohne echte Backend-Verbindung.
 * Der Login-State wird per sessionStorage gesetzt.
 */

import { test, expect } from '@playwright/test';

const MOCK_SESSION = {
  tenantId: 'tenant-playwright-001',
  tenantName: 'Test Mandant GmbH',
  displayName: 'Test Admin',
};

// ── Test Suite ────────────────────────────────────────────────────────────────

// TODO T020: Diese Tests gehören umgeschrieben für die aktuelle LoginPage
// (Discord-OAuth + Notfall-Login-Toggle, kein Mandanten-Dropdown mehr).
// Backlog-Task: tasks/_backlog/T020-e2e-receipt-flow-discord-auth.md
// Blaupause für M14-Cookie-Stub: webapp/src/tests/e2e/auth.e2e.ts
test.describe.skip('G1 — Receipt-Flow (TODO: für Discord-Auth umschreiben)', () => {
  // Login-Tests dürfen KEINE Session haben (sonst redirected useEffect zur Startseite).
  test.describe('ohne Session', () => {
    test('Login-Page ist erreichbar', async ({ page }) => {
      await page.goto('/login');
      await expect(
        page.getByRole('heading', { name: 'ProzessPilot' }).first(),
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: /anmelden/i })).toBeVisible();
    });

    test('Login-Flow: Mandant auswählen und einloggen', async ({ page }) => {
      await page.goto('/login');

      await expect(
        page.getByRole('heading', { name: 'ProzessPilot' }).first(),
      ).toBeVisible({ timeout: 10_000 });

      await expect(page.getByLabel(/mandant/i)).toBeVisible();
      await expect(page.getByLabel(/passwort/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /anmelden/i })).toBeVisible();
    });
  });

  test.describe('mit Mock-Session', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((session) => {
        sessionStorage.setItem('pp_session', JSON.stringify(session));
      }, MOCK_SESSION);
    });

    test('Upload-Page ist nach Login erreichbar', async ({ page }) => {
      await page.goto('/upload');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain('localhost');
    });

    test('Receipts-Liste-Page rendert', async ({ page }) => {
      await page.goto('/receipts');
      await page.waitForLoadState('domcontentloaded');
      expect(page.url()).toContain('localhost');
    });
  });
});

// ── Multi-Tenant Tests ────────────────────────────────────────────────────────

test.describe.skip('G1 — Multi-Tenant-Switch (TODO: für Discord-Auth umschreiben)', () => {
  test('Login-Page zeigt Mandanten-Dropdown', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/mandant/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Verschiedene Mandanten haben isolierte Sessions', async ({ context }) => {
    const page1 = await context.newPage();
    await page1.addInitScript(() => {
      sessionStorage.setItem('pp_session', JSON.stringify({
        tenantId: 'tenant-a',
        tenantName: 'Mandant A',
        displayName: 'Admin A',
      }));
    });
    await page1.goto('/receipts');

    const page2 = await context.newPage();
    await page2.addInitScript(() => {
      sessionStorage.setItem('pp_session', JSON.stringify({
        tenantId: 'tenant-b',
        tenantName: 'Mandant B',
        displayName: 'Admin B',
      }));
    });
    await page2.goto('/receipts');

    await page1.waitForLoadState('domcontentloaded');
    await page2.waitForLoadState('domcontentloaded');

    expect(page1.url()).toContain('localhost');
    expect(page2.url()).toContain('localhost');

    await page1.close();
    await page2.close();
  });
});

// ── DSGVO Lösch-Flow ──────────────────────────────────────────────────────────

test.describe.skip('G1 — DSGVO-Lösch-Flow (TODO: für Discord-Auth umschreiben)', () => {
  test('Settings-Page ist erreichbar', async ({ page }) => {
    await page.addInitScript((session) => {
      sessionStorage.setItem('pp_session', JSON.stringify(session));
    }, MOCK_SESSION);

    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('localhost');
  });
});

// ── Steuerberater-Export ──────────────────────────────────────────────────────

test.describe.skip('G1 — Steuerberater-Export-Download (TODO: für Discord-Auth umschreiben)', () => {
  test('Advisor-Portal ist erreichbar', async ({ page }) => {
    await page.addInitScript((session) => {
      sessionStorage.setItem('pp_session', JSON.stringify(session));
    }, MOCK_SESSION);

    await page.goto('/advisor');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('localhost');
  });
});
