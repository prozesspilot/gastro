/**
 * Tests für OnboardingModal
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import OnboardingModal from './OnboardingModal';
import { ToastProvider } from './ToastProvider';

const BASE = '/api/v1';

function renderOnboardingModal() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <OnboardingModal />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('OnboardingModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('zeigt kein Modal wenn Tenants existieren', async () => {
    // Default handler: 1 Tenant vorhanden → kein Onboarding
    renderOnboardingModal();
    await waitFor(() => {
      // Kein Modal-Overlay
      const modal = document.querySelector('[role="dialog"]');
      expect(modal).toBeNull();
    }, { timeout: 3000 });
  });

  it('zeigt Modal wenn keine Tenants vorhanden', async () => {
    server.use(
      http.get(`${BASE}/tenants`, () =>
        HttpResponse.json({ ok: true, data: [], pagination: { total: 0 } }),
      ),
    );
    renderOnboardingModal();
    await waitFor(() => {
      const modal = document.querySelector('[role="dialog"]');
      expect(modal).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('zeigt kein Modal wenn Onboarding übersprungen wurde', async () => {
    localStorage.setItem('pp_onboarding_skipped', '1');
    server.use(
      http.get(`${BASE}/tenants`, () =>
        HttpResponse.json({ ok: true, data: [], pagination: { total: 0 } }),
      ),
    );
    renderOnboardingModal();
    await waitFor(() => {
      const modal = document.querySelector('[role="dialog"]');
      expect(modal).toBeNull();
    }, { timeout: 3000 });
  });
});
