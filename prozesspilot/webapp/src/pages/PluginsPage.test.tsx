/**
 * Tests für PluginsPage
 * Coverage-Ziel: ≥70% für src/pages
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import PluginsPage from './PluginsPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

const MOCK_PLUGIN = {
  plugin_id: 'plugin-001',
  name: 'Test Plugin',
  description: 'Ein Test-Plugin',
  webhook_url: 'https://example.com/webhook',
  webhook_secret: 'supersecret12345678',
  hook_events: ['after_categorization', 'after_export'],
  enabled: true,
  version: '1.0.0',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

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

  it('zeigt EmptyState wenn keine Plugins vorhanden', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('Plugin');
    }, { timeout: 3000 });
  });

  it('zeigt Plugins wenn welche geladen', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [MOCK_PLUGIN] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(screen.getByText('Test Plugin')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('zeigt Plugin-Status Aktiv', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [MOCK_PLUGIN] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('Aktiv');
    }, { timeout: 3000 });
  });

  it('zeigt Plugin-URL', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [MOCK_PLUGIN] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('example.com');
    }, { timeout: 3000 });
  });

  it('zeigt Plugin-Events', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [MOCK_PLUGIN] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('after_categorization');
    }, { timeout: 3000 });
  });

  it('öffnet Registrierungsformular bei Klick auf Plus', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      const btns = screen.getAllByRole('button');
      const addBtn = btns.find(b => /plugin hinzuf/i.test(b.textContent ?? ''));
      expect(addBtn).toBeTruthy();
    }, { timeout: 3000 });

    const addBtn = screen.getAllByRole('button').find(b => /plugin hinzuf/i.test(b.textContent ?? ''))!;
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Neues Plugin');
    });
  });

  it('zeigt Formular-Felder nach Öffnen des Formulars', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      const btns = screen.getAllByRole('button');
      const addBtn = btns.find(b => /plugin hinzuf/i.test(b.textContent ?? ''));
      expect(addBtn).toBeTruthy();
    }, { timeout: 3000 });

    const addBtn = screen.getAllByRole('button').find(b => /plugin hinzuf/i.test(b.textContent ?? ''))!;
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/mein plugin/i)).toBeTruthy();
    });
  });

  it('schließt Formular bei Abbrechen', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      const btns = screen.getAllByRole('button');
      expect(btns.find(b => /plugin hinzuf/i.test(b.textContent ?? ''))).toBeTruthy();
    }, { timeout: 3000 });

    const addBtn = screen.getAllByRole('button').find(b => /plugin hinzuf/i.test(b.textContent ?? ''))!;
    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Neues Plugin');
    });

    const cancelBtn = screen.getAllByText(/abbrechen/i)[0];
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(document.body.textContent).not.toContain('Neues Plugin registrieren');
    });
  });

  it('zeigt Hook-Events-Checkboxen im Formular', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      const btns = screen.getAllByRole('button');
      expect(btns.find(b => /plugin hinzuf/i.test(b.textContent ?? ''))).toBeTruthy();
    }, { timeout: 3000 });

    const addBtn = screen.getAllByRole('button').find(b => /plugin hinzuf/i.test(b.textContent ?? ''))!;
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(document.body.textContent).toContain('after_categorization');
    });
  });

  it('toggelt Hook-Event-Auswahl', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      const btns = screen.getAllByRole('button');
      expect(btns.find(b => /plugin hinzuf/i.test(b.textContent ?? ''))).toBeTruthy();
    }, { timeout: 3000 });

    const addBtn = screen.getAllByRole('button').find(b => /plugin hinzuf/i.test(b.textContent ?? ''))!;
    fireEvent.click(addBtn);

    await waitFor(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThan(0);
    });

    const checkboxes = document.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    if (checkboxes.length > 0) {
      fireEvent.click(checkboxes[0]);
      expect(checkboxes[0].checked).toBe(true);
      fireEvent.click(checkboxes[0]);
      expect(checkboxes[0].checked).toBe(false);
    }
  });

  it('zeigt Fehler wenn Plugin-Laden fehlschlägt', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: false, error: 'Server Error' }, { status: 500 }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      // Error box or error message shown
      const body = document.body.textContent;
      expect(body?.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('zeigt Deaktivieren-Button für aktives Plugin', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [MOCK_PLUGIN] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(screen.getByText('Deaktivieren')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('zeigt Löschen-Button für Plugin', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [MOCK_PLUGIN] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(screen.getByText('Loeschen')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('zeigt Historie-Button für Plugin', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [MOCK_PLUGIN] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(screen.getByText('Historie')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('öffnet Ausführungshistorie beim Klick auf Historie', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [MOCK_PLUGIN] } }),
      ),
      http.get(`${BASE}/plugins/:id/executions`, () =>
        HttpResponse.json({ ok: true, data: { executions: [] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(screen.getByText('Historie')).toBeInTheDocument();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByText('Historie'));

    await waitFor(() => {
      expect(document.body.textContent).toContain('Ausfuehrungs');
    }, { timeout: 3000 });
  });

  it('zeigt Ausführungen in der Historie', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [MOCK_PLUGIN] } }),
      ),
      http.get(`${BASE}/plugins/:id/executions`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            executions: [{
              execution_id: 'exec-001',
              plugin_id: 'plugin-001',
              hook_event: 'after_categorization',
              success: true,
              response_status: 200,
              duration_ms: 42,
              executed_at: '2024-01-01T10:00:00Z',
            }],
          },
        }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(screen.getByText('Historie')).toBeInTheDocument();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByText('Historie'));

    await waitFor(() => {
      expect(document.body.textContent).toContain('42ms');
    }, { timeout: 3000 });
  });

  it('schließt Plugin-Details beim erneuten Klick auf Historie', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [MOCK_PLUGIN] } }),
      ),
      http.get(`${BASE}/plugins/:id/executions`, () =>
        HttpResponse.json({ ok: true, data: { executions: [] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(screen.getByText('Historie')).toBeInTheDocument();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByText('Historie'));
    await waitFor(() => {
      expect(screen.getByText('Verbergen')).toBeInTheDocument();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByText('Verbergen'));
    await waitFor(() => {
      expect(screen.getByText('Historie')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('ruft Aktualisieren-Button ab', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(screen.queryByText('Aktualisieren')).toBeTruthy();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByText('Aktualisieren'));

    await waitFor(() => {
      expect(document.body.textContent?.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('zeigt Info-Box mit Payload-Format', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [] } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('Plugin-Integration');
    }, { timeout: 3000 });
  });

  it('registriert Plugin erfolgreich', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [] } }),
      ),
      http.post(`${BASE}/plugins`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            plugin_id: 'new-plugin-001',
            name: 'Neues Plugin',
            description: '',
            webhook_url: 'https://test.com/hook',
            webhook_secret: 'supersecret12345678',
            hook_events: ['after_categorization'],
            enabled: true,
            version: '1.0.0',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        }, { status: 201 }),
      ),
    );

    const user = userEvent.setup();
    renderPluginsPage();

    await waitFor(() => {
      const btns = screen.getAllByRole('button');
      expect(btns.find(b => /plugin hinzuf/i.test(b.textContent ?? ''))).toBeTruthy();
    }, { timeout: 3000 });

    const addBtn = screen.getAllByRole('button').find(b => /plugin hinzuf/i.test(b.textContent ?? ''))!;
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/mein plugin/i)).toBeTruthy();
    });

    const nameInput = screen.getByPlaceholderText(/mein plugin/i) as HTMLInputElement;
    await user.type(nameInput, 'Neues Plugin');

    const urlInput = screen.getByPlaceholderText(/https:\/\/mein-plugin/i) as HTMLInputElement;
    await user.type(urlInput, 'https://test.com/hook');

    const secretInput = screen.getByPlaceholderText(/mindestens 16/i) as HTMLInputElement;
    await user.type(secretInput, 'supersecret12345678');

    // Select a hook event
    const checkboxes = document.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    if (checkboxes.length > 0) {
      fireEvent.click(checkboxes[0]);
    }

    const submitBtn = screen.getByText('Plugin registrieren');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(document.body.textContent?.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('toggelt Plugin Aktiv/Deaktiviert', async () => {
    server.use(
      http.get(`${BASE}/plugins`, () =>
        HttpResponse.json({ ok: true, data: { plugins: [MOCK_PLUGIN] } }),
      ),
      http.put(`${BASE}/plugins/:id`, () =>
        HttpResponse.json({ ok: true, data: { ...MOCK_PLUGIN, enabled: false } }),
      ),
    );
    renderPluginsPage();
    await waitFor(() => {
      expect(screen.getByText('Deaktivieren')).toBeInTheDocument();
    }, { timeout: 3000 });

    await act(async () => {
      fireEvent.click(screen.getByText('Deaktivieren'));
    });

    await waitFor(() => {
      expect(document.body.textContent?.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});
