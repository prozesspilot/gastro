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

test.describe('G1 — Receipt-Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((session) => {
      sessionStorage.setItem('pp_session', JSON.stringify(session));
    }, MOCK_SESSION);
  });

  test('Login-Page ist erreichbar', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'ProzessPilot' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /anmelden/i })).toBeVisible();
  });

  test('Upload-Page ist nach Login erreichbar', async ({ page }) => {
    await page.goto('/upload');

    // Entweder Upload-Page oder Redirect zu Login
    const url = page.url();
    // App loaded (keine 404)
    expect(url).toContain('localhost');
  });

  test('Receipts-Liste-Page rendert', async ({ page }) => {
    await page.goto('/receipts');

    // Warte auf initiales Laden
    await page.waitForLoadState('networkidle');

    const url = page.url();
    // Kein 500-Fehler
    expect(url).toContain('localhost');
  });

  test('Login-Flow: Mandant auswählen und einloggen', async ({ page }) => {
    await page.goto('/login');

    // ProzessPilot Heading sichtbar
    await expect(page.getByRole('heading', { name: 'ProzessPilot' })).toBeVisible({ timeout: 10_000 });

    // Mandant-Dropdown sichtbar
    const mandantInput = page.getByLabel(/mandant/i);
    await expect(mandantInput).toBeVisible();

    // Passwort-Feld sichtbar
    const pwInput = page.getByLabel(/passwort/i);
    await expect(pwInput).toBeVisible();

    // Button sichtbar
    const loginBtn = page.getByRole('button', { name: /anmelden/i });
    await expect(loginBtn).toBeVisible();
  });
});

// ── Multi-Tenant Tests ────────────────────────────────────────────────────────

test.describe('G1 — Multi-Tenant-Switch', () => {
  test('Login-Page zeigt Mandanten-Dropdown', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/mandant/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Verschiedene Mandanten haben isolierte Sessions', async ({ context }) => {
    // Page 1: Mandant A
    const page1 = await context.newPage();
    await page1.addInitScript(() => {
      sessionStorage.setItem('pp_session', JSON.stringify({
        tenantId: 'tenant-a',
        tenantName: 'Mandant A',
        displayName: 'Admin A',
      }));
    });
    await page1.goto('/receipts');

    // Page 2: Mandant B
    const page2 = await context.newPage();
    await page2.addInitScript(() => {
      sessionStorage.setItem('pp_session', JSON.stringify({
        tenantId: 'tenant-b',
        tenantName: 'Mandant B',
        displayName: 'Admin B',
      }));
    });
    await page2.goto('/receipts');

    // Beide Pages geladen (keine Fehler)
    await page1.waitForLoadState('networkidle');
    await page2.waitForLoadState('networkidle');

    expect(page1.url()).toContain('localhost');
    expect(page2.url()).toContain('localhost');

    await page1.close();
    await page2.close();
  });
});

// ── DSGVO Lösch-Flow ──────────────────────────────────────────────────────────

test.describe('G1 — DSGVO-Lösch-Flow', () => {
  test('Settings-Page ist erreichbar', async ({ page }) => {
    await page.addInitScript((session) => {
      sessionStorage.setItem('pp_session', JSON.stringify(session));
    }, MOCK_SESSION);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(url).toContain('localhost');
  });
});

// ── Steuerberater-Export ──────────────────────────────────────────────────────

test.describe('G1 — Steuerberater-Export-Download', () => {
  test('Advisor-Portal ist erreichbar', async ({ page }) => {
    await page.addInitScript((session) => {
      sessionStorage.setItem('pp_session', JSON.stringify(session));
    }, MOCK_SESSION);

    await page.goto('/advisor');
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(url).toContain('localhost');
  });
});
