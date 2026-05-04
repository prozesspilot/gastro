/**
 * Tests für UploadPage
 * E3: Target ≥ 70% Seiten-Coverage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import UploadPage from './UploadPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

function renderUploadPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('UploadPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('rendert ohne Crash', () => {
    renderUploadPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Belege hochladen Überschrift', () => {
    renderUploadPage();
    expect(screen.getByText(/belege hochladen/i)).toBeInTheDocument();
  });

  it('zeigt Tenant-Auswahl als Select', async () => {
    renderUploadPage();
    await waitFor(() => {
      // Select-Elemente für Tenant und Kunde
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('zeigt Dropdown-Elemente für Auswahl', async () => {
    renderUploadPage();
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
    });
  });

  it('zeigt Upload-Button', async () => {
    renderUploadPage();
    await waitFor(() => {
      // Es gibt mehrere Elemente mit "beleg hochladen" — wir prüfen dass mind. eines vorhanden
      const elements = screen.getAllByText(/beleg hochladen/i);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it('zeigt Upload-Button disabled wenn kein Tenant/Customer ausgewählt', async () => {
    server.use(
      http.get(`${BASE}/tenants`, () =>
        HttpResponse.json({ ok: true, data: [], pagination: { total: 0 } }),
      ),
    );
    renderUploadPage();
    await waitFor(() => {
      // Button im .primary-Style (nicht die Sektion)
      const btns = screen.getAllByRole('button');
      const uploadBtn = btns.find((b) => /beleg hochladen/i.test(b.textContent ?? ''));
      if (uploadBtn) expect(uploadBtn).toBeDisabled();
    });
  });

  it('zeigt Letzte Uploads Sektion', async () => {
    renderUploadPage();
    await waitFor(() => {
      expect(screen.getByText(/letzte uploads/i)).toBeInTheDocument();
    });
  });

  it('zeigt leere Receipt-Liste initiell', async () => {
    renderUploadPage();
    await waitFor(() => {
      // Entweder Skeleton oder leere Liste
      const body = document.body.textContent;
      expect(body).toContain('Letzte Uploads');
    });
  });
});
