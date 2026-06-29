/**
 * T082 — Tests für TasksPage: Tabs, Liste, Empty/Error, Schnellaktionen,
 * Rollen-Gate (support read-only), Anlegen-Modal. Cross-tenant → KEIN
 * NoTenantHint (kein getActiveTenantId-Mock nötig).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ToastProvider';
import { server } from '../tests/msw/server';
import TasksPage from './TasksPage';

const BASE = '/api/v1';

// useAuth mocken — Rolle pro Test über h.user.role umstellbar.
const h = vi.hoisted(() => ({
  user: {
    id: 'user-001',
    role: 'mitarbeiter' as 'geschaeftsfuehrer' | 'mitarbeiter' | 'support',
    display_name: 'Test',
    displayName: 'Test',
  },
}));
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: h.user, hasPermission: () => true }),
}));

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-001',
    tenant_id: null,
    type: 'sonstige',
    title: 'Beleg prüfen',
    description: null,
    reference_type: null,
    reference_id: null,
    status: 'offen',
    priority: 'hoch',
    assigned_to: null,
    created_by: 'user-002',
    claimed_at: null,
    due_at: null,
    completed_at: null,
    created_at: '2026-06-25T09:00:00Z',
    updated_at: '2026-06-25T09:00:00Z',
    assigned_to_name: null,
    created_by_name: 'Chef',
    tenant_name: 'Pizzeria Bella',
    collaborator_count: 0,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/tasks']}>
        <TasksPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  h.user.role = 'mitarbeiter';
});

describe('TasksPage', () => {
  it('rendert Aufgaben in der Tabelle', async () => {
    server.use(http.get(`${BASE}/tasks`, () => HttpResponse.json({ tasks: [makeTask()] })));
    renderPage();
    await waitFor(() => expect(screen.getByText('Beleg prüfen')).toBeInTheDocument());
    expect(screen.getByText('Pizzeria Bella')).toBeInTheDocument();
  });

  it('zeigt Empty-State ohne Aufgaben', async () => {
    server.use(http.get(`${BASE}/tasks`, () => HttpResponse.json({ tasks: [] })));
    renderPage();
    await waitFor(() => expect(screen.getByText('Keine Aufgaben')).toBeInTheDocument());
  });

  it('zeigt Fehlermeldung bei Server-Fehler', async () => {
    server.use(http.get(`${BASE}/tasks`, () => new HttpResponse(null, { status: 500 })));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/konnten nicht geladen werden/i)).toBeInTheDocument(),
    );
  });

  it('Tab-Wechsel auf „Team" lädt die Team-View neu', async () => {
    const seenViews: string[] = [];
    server.use(
      http.get(`${BASE}/tasks`, ({ request }) => {
        seenViews.push(new URL(request.url).searchParams.get('view') ?? '');
        return HttpResponse.json({ tasks: [] });
      }),
    );
    renderPage();
    await waitFor(() => expect(seenViews).toContain('mine'));
    await userEvent.click(screen.getByRole('tab', { name: 'Team' }));
    await waitFor(() => expect(seenViews).toContain('team'));
  });

  it('„Übernehmen" schickt Status in_arbeit ans Backend', async () => {
    let statusBody: unknown = null;
    server.use(
      http.get(`${BASE}/tasks`, () => HttpResponse.json({ tasks: [makeTask({ status: 'offen' })] })),
      http.post(`${BASE}/tasks/task-001/status`, async ({ request }) => {
        statusBody = await request.json();
        return HttpResponse.json({ task: makeTask({ status: 'in_arbeit' }) });
      }),
    );
    renderPage();
    const btn = await screen.findByRole('button', { name: 'Übernehmen' });
    await userEvent.click(btn);
    await waitFor(() => expect(statusBody).toEqual({ status: 'in_arbeit' }));
  });

  it('support sieht KEINEN Anlegen-Button und KEINE Aktionen (read-only)', async () => {
    h.user.role = 'support';
    server.use(
      http.get(`${BASE}/tasks`, () => HttpResponse.json({ tasks: [makeTask({ status: 'offen' })] })),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Beleg prüfen')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Neue Aufgabe/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Übernehmen' })).not.toBeInTheDocument();
  });

  it('Anlegen-Modal: Mitarbeiter legt eine Aufgabe an', async () => {
    let createdTitle: string | null = null;
    server.use(
      http.get(`${BASE}/tasks`, () => HttpResponse.json({ tasks: [] })),
      http.post(`${BASE}/tasks`, async ({ request }) => {
        const body = (await request.json()) as { title?: string };
        createdTitle = body.title ?? null;
        return HttpResponse.json({ task: makeTask({ title: body.title }) }, { status: 201 });
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Neue Aufgabe/i }));

    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Titel/i), 'Kasse abrechnen');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(createdTitle).toBe('Kasse abrechnen'));
  });
});
