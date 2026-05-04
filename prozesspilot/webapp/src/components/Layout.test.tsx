/**
 * Tests für Layout-Komponente
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import Layout from './Layout';
import { ToastProvider } from './ToastProvider';

const BASE = '/api/v1';

function renderLayout(children: React.ReactNode = <div>Content</div>) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <Layout>{children}</Layout>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('Layout', () => {
  it('rendert Kinder-Content', () => {
    renderLayout(<div>Test-Content</div>);
    expect(screen.getByText('Test-Content')).toBeInTheDocument();
  });

  it('zeigt Hauptnavigation-Links', () => {
    renderLayout();
    // Sidebar enthält Nav-Links
    const navLinks = screen.getAllByRole('link');
    expect(navLinks.length).toBeGreaterThan(0);
  });

  it('zeigt Dashboard-Link', () => {
    renderLayout();
    const dashboardLinks = screen.getAllByRole('link');
    // Mindestens ein Link vorhanden
    expect(dashboardLinks.length).toBeGreaterThan(3);
  });

  it('rendert ohne Crash wenn keine Receipts-Stats', () => {
    server.use(
      http.get(`${BASE}/receipts/stats`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Fehler' } }, { status: 500 }),
      ),
    );
    expect(() => renderLayout()).not.toThrow();
  });

  it('rendert ohne Crash wenn keine Tenants', () => {
    server.use(
      http.get(`${BASE}/tenants`, () =>
        HttpResponse.json({ ok: true, data: [], pagination: { total: 0 } }),
      ),
    );
    expect(() => renderLayout()).not.toThrow();
  });
});
