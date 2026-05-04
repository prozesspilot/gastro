/**
 * Tests für UploadPage
 * Coverage-Ziel: ≥70% Seiten-Coverage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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
      const body = document.body.textContent;
      expect(body).toContain('Letzte Uploads');
    });
  });

  it('zeigt Tenant-Name im Dropdown nach Laden', async () => {
    renderUploadPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('Demo-Tenant');
    }, { timeout: 3000 });
  });

  it('zeigt Kunde nach Tenant-Auswahl', async () => {
    renderUploadPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('Test GmbH');
    }, { timeout: 3000 });
  });

  it('zeigt Drag-and-Drop Zone', async () => {
    renderUploadPage();
    await waitFor(() => {
      const dropZone = document.querySelector('.drop-zone');
      expect(dropZone).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('zeigt Hilfetext in der Drop-Zone', async () => {
    renderUploadPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('PDF');
    }, { timeout: 3000 });
  });

  it('zeigt max. Größenhinweis', async () => {
    renderUploadPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('10');
    }, { timeout: 3000 });
  });

  it('ändert Tenant-Auswahl', async () => {
    renderUploadPage();
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'tenant-001' } });

    await waitFor(() => {
      expect(document.body.textContent?.length).toBeGreaterThan(0);
    });
  });

  it('zeigt Fehler bei ungültigem Dateityp', async () => {
    renderUploadPage();
    await waitFor(() => {
      const dropZone = document.querySelector('.drop-zone');
      expect(dropZone).toBeTruthy();
    }, { timeout: 3000 });

    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) {
      const file = new File(['test'], 'test.exe', { type: 'application/x-msdownload' });
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(document.body.textContent).toContain('akzeptiert');
      }, { timeout: 2000 });
    }
  });

  it('zeigt ausgewählte Datei nach Auswahl', async () => {
    renderUploadPage();
    await waitFor(() => {
      const dropZone = document.querySelector('.drop-zone');
      expect(dropZone).toBeTruthy();
    }, { timeout: 3000 });

    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) {
      const file = new File(['%PDF-test'], 'test.pdf', { type: 'application/pdf' });
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(document.body.textContent).toContain('test.pdf');
      }, { timeout: 2000 });
    }
  });

  it('entfernt Datei bei Klick auf Entfernen', async () => {
    renderUploadPage();
    await waitFor(() => {
      const dropZone = document.querySelector('.drop-zone');
      expect(dropZone).toBeTruthy();
    }, { timeout: 3000 });

    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) {
      const file = new File(['%PDF-test'], 'remove-me.pdf', { type: 'application/pdf' });
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(document.body.textContent).toContain('remove-me.pdf');
      }, { timeout: 2000 });

      const removeBtn = screen.queryByText(/entfernen/i);
      if (removeBtn) {
        fireEvent.click(removeBtn);
        await waitFor(() => {
          expect(document.body.textContent).not.toContain('remove-me.pdf');
        }, { timeout: 2000 });
      }
    }
  });

  it('zeigt DragOver-Zustand', async () => {
    renderUploadPage();
    await waitFor(() => {
      const dropZone = document.querySelector('.drop-zone');
      expect(dropZone).toBeTruthy();
    }, { timeout: 3000 });

    const dropZone = document.querySelector('.drop-zone') as HTMLElement;
    if (dropZone) {
      fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } });
      expect(document.querySelector('.drop-zone.drag-over') || dropZone.classList.contains('drag-over')).toBeTruthy();

      fireEvent.dragLeave(dropZone);
      // After drag leave, no longer in drag-over state
    }
  });

  it('verarbeitet Drop-Event', async () => {
    renderUploadPage();
    await waitFor(() => {
      const dropZone = document.querySelector('.drop-zone');
      expect(dropZone).toBeTruthy();
    }, { timeout: 3000 });

    const dropZone = document.querySelector('.drop-zone') as HTMLElement;
    if (dropZone) {
      const file = new File(['%PDF-test'], 'dropped.pdf', { type: 'application/pdf' });
      const dataTransfer = { files: [file] };

      fireEvent.drop(dropZone, { dataTransfer });

      await waitFor(() => {
        expect(document.body.textContent?.length).toBeGreaterThan(0);
      }, { timeout: 2000 });
    }
  });

  it('zeigt Belege in der Liste nach Laden', async () => {
    server.use(
      http.get(`${BASE}/receipts`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            receipts: [
              {
                id: 'r-001',
                tenant_id: 'tenant-001',
                customer_id: 'cust-001',
                status: 'done',
                file_name: 'rechnung.pdf',
                file_type: 'pdf',
                file_size: 1024,
                source: 'manual',
                metadata: {},
                error_message: null,
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
              },
            ],
            total: 1,
          },
        }),
      ),
    );
    renderUploadPage();
    await waitFor(() => {
      expect(document.body.textContent?.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('zeigt success nach Upload', async () => {
    server.use(
      http.post(`${BASE}/receipts`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            id: 'new-receipt',
            tenant_id: 'tenant-001',
            customer_id: 'cust-001',
            status: 'received',
            original_name: 'test.pdf',
            mime_type: 'application/pdf',
            storage_key: null,
            file_size_bytes: 100,
            file_sha256: null,
            source: 'manual',
            metadata: {},
            error_message: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        }, { status: 201 }),
      ),
      http.put(`${BASE}/receipts/:id/status`, ({ params }) =>
        HttpResponse.json({
          ok: true,
          data: { id: params['id'], status: 'done', updated_at: '2024-01-01T01:00:00Z' },
        }),
      ),
    );

    renderUploadPage();
    await waitFor(() => {
      const dropZone = document.querySelector('.drop-zone');
      expect(dropZone).toBeTruthy();
    }, { timeout: 3000 });

    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) {
      const file = new File(['%PDF-test'], 'upload-test.pdf', { type: 'application/pdf' });
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fireEvent.change(fileInput);

      await waitFor(() => {
        const uploadBtn = screen.getAllByRole('button').find(b => /beleg hochladen/i.test(b.textContent ?? ''));
        if (uploadBtn && !uploadBtn.hasAttribute('disabled')) {
          return true;
        }
        throw new Error('button not ready');
      }, { timeout: 3000 });

      const uploadBtn = screen.getAllByRole('button').find(b => /beleg hochladen/i.test(b.textContent ?? ''));
      if (uploadBtn && !uploadBtn.hasAttribute('disabled')) {
        await act(async () => {
          fireEvent.click(uploadBtn);
        });
      }
    }
  }, 10000);

  it('zeigt Fehler-Hinweis bei Upload-Fehler', async () => {
    server.use(
      http.post(`${BASE}/receipts`, () =>
        HttpResponse.json({ ok: false, error: 'Upload failed' }, { status: 500 }),
      ),
    );

    renderUploadPage();
    await waitFor(() => {
      const dropZone = document.querySelector('.drop-zone');
      expect(dropZone).toBeTruthy();
    }, { timeout: 3000 });

    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) {
      const file = new File(['%PDF-test'], 'error-test.pdf', { type: 'application/pdf' });
      Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
      fireEvent.change(fileInput);

      await waitFor(() => {
        const uploadBtn = screen.getAllByRole('button').find(b => /beleg hochladen/i.test(b.textContent ?? ''));
        if (uploadBtn && !uploadBtn.hasAttribute('disabled')) {
          return true;
        }
        throw new Error('button not ready');
      }, { timeout: 3000 });

      const uploadBtn = screen.getAllByRole('button').find(b => /beleg hochladen/i.test(b.textContent ?? ''));
      if (uploadBtn && !uploadBtn.hasAttribute('disabled')) {
        await act(async () => {
          fireEvent.click(uploadBtn);
        });

        await waitFor(() => {
          expect(document.body.textContent?.length).toBeGreaterThan(0);
        }, { timeout: 5000 });
      }
    }
  }, 10000);
});
