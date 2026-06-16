/**
 * Tests für Layout-Komponente (A3-Reboot T059): belege-Welt-Shell.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import { AuthProvider } from '../auth/AuthContext';
import Layout from './Layout';
import { ToastProvider } from './ToastProvider';

const BASE = '/api/v1';

function renderLayout(children: React.ReactNode = <div>Content</div>) {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter>
          <Layout>{children}</Layout>
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>,
  );
}

describe('Layout', () => {
  it('rendert Kinder-Content', () => {
    renderLayout(<div>Test-Content</div>);
    expect(screen.getByText('Test-Content')).toBeInTheDocument();
  });

  it('zeigt die belege-Welt-Navigation (Dashboard/Belege/Mandanten/Einstellungen)', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Belege' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beleg hochladen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mandanten' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toBeInTheDocument();
  });

  it('enthält keine Geister-Welt-Nav-Einträge', () => {
    renderLayout();
    expect(screen.queryByRole('link', { name: /Kunden/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Statistik/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Steuerberater/i })).not.toBeInTheDocument();
  });

  it('zeigt den Tenant-Selector in der Topbar', async () => {
    renderLayout();
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Aktiver Mandant' })).toBeInTheDocument();
    });
  });

  it('rendert ohne Crash wenn keine Mandanten geladen werden können', () => {
    server.use(
      http.get(`${BASE}/tenants`, () =>
        HttpResponse.json({ ok: false, error: { message: 'Fehler' } }, { status: 500 }),
      ),
    );
    expect(() => renderLayout()).not.toThrow();
  });

  it('rendert ohne Crash wenn die Mandanten-Liste leer ist', () => {
    server.use(http.get(`${BASE}/tenants`, () => HttpResponse.json({ ok: true, data: [] })));
    expect(() => renderLayout()).not.toThrow();
  });
});
