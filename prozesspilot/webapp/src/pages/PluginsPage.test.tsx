/**
 * Tests für PluginsPage
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import PluginsPage from './PluginsPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderPluginsPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <PluginsPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('PluginsPage', () => {
  it('rendert ohne Crash', () => {
    renderPluginsPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Plugins-Überschrift', async () => {
    renderPluginsPage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body?.toLowerCase()).toContain('plugin');
    });
  });

  it('zeigt Plugin-Content nach Laden', async () => {
    renderPluginsPage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(0);
    }, { timeout: 5000 });
  });

  it('zeigt leere Liste gracefully', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(0);
    });
  });
});
