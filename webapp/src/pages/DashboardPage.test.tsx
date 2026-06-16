/**
 * Tests für DashboardPage (A3-Reboot T059): schlanke Belege-Übersicht.
 *
 * `../api` + `../api/belege` werden gemockt — env-robust (kein localStorage)
 * und beide Pfade (kein Mandant / aktiver Mandant) sind testbar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockGetActiveTenantId = vi.fn<() => string | null>(() => null);
const mockListBelege = vi.fn();

vi.mock('../api', () => ({ getActiveTenantId: () => mockGetActiveTenantId() }));
vi.mock('../api/belege', () => ({ listBelege: (opts: unknown) => mockListBelege(opts) }));

import DashboardPage from './DashboardPage';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActiveTenantId.mockReturnValue(null);
});

describe('DashboardPage', () => {
  it('rendert ohne Crash', () => {
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('zeigt einen Link zur Belegliste', () => {
    renderDashboard();
    expect(screen.getByRole('link', { name: /zur belegliste/i })).toBeInTheDocument();
  });

  it('ohne aktiven Mandanten erscheint der Mandanten-Hinweis (kein /belege-Call)', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText(/Mandanten wählen/i)).toBeInTheDocument();
    });
    expect(mockListBelege).not.toHaveBeenCalled();
  });

  it('mit aktivem Mandanten zeigt es die KPI-Zahlen aus /belege', async () => {
    mockGetActiveTenantId.mockReturnValue('tenant-001');
    mockListBelege.mockImplementation((opts: { status?: string }) =>
      Promise.resolve({
        belege: [],
        pagination: {
          page: 1,
          page_size: 1,
          total: opts?.status === 'requires_review' ? 7 : 42,
          total_pages: 1,
        },
      }),
    );
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
    expect(screen.getByText('7')).toBeInTheDocument();
    // ein Call für "gesamt", einer für "requires_review"
    expect(mockListBelege).toHaveBeenCalledTimes(2);
  });
});
