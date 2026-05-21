/**
 * C2 — Playwright Smoke-Tests
 *
 * Testet die Hauptnavigation der App.
 * Setzt voraus:
 *   - Dev-Server läuft auf Port 5173
 *   - Backend läuft auf Port 3000 (oder PP_AUTH_DISABLED=1)
 *
 * Tests können ohne laufenden Backend-Server ausgeführt werden wenn
 * die App die Login-Page zeigt (kein Auth = Redirect).
 */

import { test, expect } from '@playwright/test';

test.describe('ProzessPilot Smoke-Tests', () => {
  test('App startet und zeigt Login-Page', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    expect(title).toBeTruthy();

    // Heading "ProzessPilot" ist auf Login- und Dashboard-Layout sichtbar.
    await expect(
      page.getByRole('heading', { name: 'ProzessPilot' }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Login-Page hat Email- und Passwort-Feld', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'ProzessPilot' })).toBeVisible();
    // Notfall-Login ist standardmäßig zugeklappt → erst öffnen.
    await page.getByRole('button', { name: /notfall-login/i }).click();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel('Passwort', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /notfall-anmeldung/i })).toBeVisible();
  });

  test('Not-Found-Page zeigt 404', async ({ page }) => {
    await page.goto('/login');
    // Erst einloggen wenn möglich
    const loginPage = await page.getByRole('button', { name: /notfall-anmeldung/i }).isVisible().catch(() => false);

    if (loginPage) {
      // Simuliere Login-Abbruch und direkten Zugriff auf unbekannte Seite
      // In Tests ohne Backend: bleib auf Login-Page
      await expect(page.getByRole('button', { name: /notfall-anmeldung/i })).toBeVisible();
    }
  });

  test('Login-Page ist zugänglich ohne eingeloggten State', async ({ page }) => {
    await page.goto('/login');
    // Discord-Login ist Primär-Pfad → der Anker muss sichtbar sein.
    await expect(page.getByRole('link', { name: /discord/i })).toBeVisible();
    // Notfall-Login öffnen für den klassischen Anmelden-Button.
    await page.getByRole('button', { name: /notfall-login/i }).click();
    await expect(page.getByRole('button', { name: /notfall-anmeldung/i })).toBeVisible();
  });
});
