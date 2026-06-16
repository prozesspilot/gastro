/**
 * Tests für TenantSelector (A3-Reboot T059).
 *
 * `../api` wird gemockt — so hängt der Test nicht an localStorage (Node-26-Falle)
 * und `window.location.reload` lässt sich sauber prüfen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockGetTenants = vi.fn();
const mockSetActiveTenantId = vi.fn();
const mockGetActiveTenantId = vi.fn<() => string | null>(() => null);

vi.mock('../api', () => ({
  getTenants: () => mockGetTenants(),
  setActiveTenantId: (id: string) => mockSetActiveTenantId(id),
  getActiveTenantId: () => mockGetActiveTenantId(),
}));

import TenantSelector from './TenantSelector';

const TENANTS = [
  { id: 'tenant-001', slug: 'demo', display_name: 'Demo-Tenant', package: 'standard', deletion_status: 'active' },
  { id: 'tenant-002', slug: 'pilot', display_name: 'Pilot-Wirt', package: 'pro', deletion_status: 'active' },
];

const reloadMock = vi.fn();
let originalLocation: Location;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActiveTenantId.mockReturnValue(null);
  mockGetTenants.mockResolvedValue(TENANTS);
  // jsdom: window.location.reload ist non-configurable, aber window.location
  // selbst ist ersetzbar → ganzes location-Objekt mit reload-Mock überschreiben.
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: originalLocation.href, origin: originalLocation.origin, reload: reloadMock },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('TenantSelector', () => {
  it('lädt die Mandanten und zeigt sie als Optionen', async () => {
    render(<TenantSelector />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Demo-Tenant' })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: 'Pilot-Wirt' })).toBeInTheDocument();
  });

  it('Wechsel setzt den aktiven Tenant und lädt die App neu', async () => {
    render(<TenantSelector />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Pilot-Wirt' })).toBeInTheDocument();
    });
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Aktiver Mandant' }),
      'tenant-002',
    );
    expect(mockSetActiveTenantId).toHaveBeenCalledWith('tenant-002');
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('zeigt einen Hinweis, wenn die Mandanten nicht ladbar sind', async () => {
    mockGetTenants.mockRejectedValueOnce(new Error('boom'));
    render(<TenantSelector />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Mandanten nicht ladbar/i);
    });
    expect(mockSetActiveTenantId).not.toHaveBeenCalled();
  });

  it('vorausgewählter Tenant wird als aktiver Wert angezeigt', async () => {
    mockGetActiveTenantId.mockReturnValue('tenant-001');
    render(<TenantSelector />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Demo-Tenant' })).toBeInTheDocument();
    });
    expect(screen.getByRole('combobox', { name: 'Aktiver Mandant' })).toHaveValue('tenant-001');
  });
});
