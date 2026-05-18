/**
 * Tests für BelegeUploadPage
 * Spec: T014 — Drag&Drop-Upload, Multi-File, Validierung, Duplikat-Toast
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import BelegeUploadPage from './BelegeUploadPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

// ── Test-Helpers ──────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/belege/upload']}>
        <Routes>
          <Route path="/belege/upload" element={<BelegeUploadPage />} />
          <Route path="/belege" element={<div data-testid="belege-list">Liste</div>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function makeFile(name: string, type = 'image/jpeg', size = 1024): File {
  // JSDOM File-Mock: content als Array of Blob-Parts
  return new File(['x'.repeat(size)], name, { type });
}

/**
 * JSDOM erlaubt kein direktes Setzen von input.files via fireEvent.change.
 * Wir überschreiben die Eigenschaft mit Object.defineProperty vor dem Event.
 */
function simulateFileChange(input: HTMLInputElement, files: File[]) {
  const fileList = {
    length: files.length,
    item: (i: number) => files[i],
    [Symbol.iterator]: function* () { yield* files; },
    ...files.reduce<Record<number, File>>((acc, f, i) => { acc[i] = f; return acc; }, {}),
  } as unknown as FileList;

  Object.defineProperty(input, 'files', { configurable: true, value: fileList });
  fireEvent.change(input, { target: { files: fileList } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BelegeUploadPage', () => {
  it('rendert die Drag&Drop-Zone', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /dateien hier ablegen/i })).toBeInTheDocument();
  });

  it('rendert den versteckten File-Input', () => {
    renderPage();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('file');
    expect(input.multiple).toBe(true);
  });

  it('File-Picker akzeptiert gültige MIME-Types im accept-Attribut', () => {
    renderPage();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const accept = input.accept;
    expect(accept).toContain('image/jpeg');
    expect(accept).toContain('image/png');
    expect(accept).toContain('application/pdf');
  });

  it('zeigt Vorschau-Liste wenn Dateien hinzugefügt werden', async () => {
    renderPage();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = makeFile('test-beleg.jpg', 'image/jpeg');

    await act(async () => {
      simulateFileChange(input, [file]);
    });

    await waitFor(() => {
      expect(screen.getByText('test-beleg.jpg')).toBeInTheDocument();
    });
    // Größe formatiert anzeigen
    expect(screen.getByText(/1\.0 KB/i)).toBeInTheDocument();
  });

  it('zeigt PDF-Icon für PDF-Dateien', async () => {
    renderPage();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const pdfFile = makeFile('rechnung.pdf', 'application/pdf');

    await act(async () => {
      simulateFileChange(input, [pdfFile]);
    });

    await waitFor(() => {
      expect(screen.getByText('rechnung.pdf')).toBeInTheDocument();
    });
    // PDF-Emoji sollte sichtbar sein (kein previewUrl)
    expect(screen.getAllByText('📄').length).toBeGreaterThan(0);
  });

  it('Entfernen-Button entfernt Datei aus Liste', async () => {
    renderPage();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = makeFile('beleg-zu-entfernen.jpg', 'image/jpeg');

    await act(async () => {
      simulateFileChange(input, [file]);
    });

    await waitFor(() => {
      expect(screen.getByText('beleg-zu-entfernen.jpg')).toBeInTheDocument();
    });

    const removeBtn = screen.getByTestId('remove-button');
    await act(async () => {
      fireEvent.click(removeBtn);
    });

    expect(screen.queryByText('beleg-zu-entfernen.jpg')).not.toBeInTheDocument();
  });

  it('Mehrfach-Upload: alle Dateien werden hochgeladen', async () => {
    let uploadCalls = 0;
    server.use(
      http.post(`${BASE}/belege/upload`, () => {
        uploadCalls++;
        return HttpResponse.json(
          { beleg_id: `b-00${uploadCalls}`, storage_key: 'k', status: 'received' },
          { status: 201 },
        );
      }),
    );

    renderPage();
    const input = screen.getByTestId('file-input') as HTMLInputElement;

    const files = [
      makeFile('beleg1.jpg', 'image/jpeg'),
      makeFile('beleg2.jpg', 'image/jpeg'),
    ];

    await act(async () => {
      simulateFileChange(input, files);
    });

    await waitFor(() => {
      expect(screen.getByText('beleg1.jpg')).toBeInTheDocument();
      expect(screen.getByText('beleg2.jpg')).toBeInTheDocument();
    });

    const uploadBtn = screen.getByRole('button', { name: /2 belege hochladen/i });
    await act(async () => {
      fireEvent.click(uploadBtn);
    });

    await waitFor(() => {
      expect(uploadCalls).toBe(2);
    }, { timeout: 5000 });
  });

  it('Duplikat (isDuplicate=true) zeigt spezifische Toast-Message', async () => {
    server.use(
      http.post(`${BASE}/belege/upload`, () =>
        HttpResponse.json(
          { beleg_id: 'b-dup', storage_key: 'k', status: 'received', isDuplicate: true },
          { status: 201 },
        ),
      ),
    );

    renderPage();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = makeFile('duplikat.jpg', 'image/jpeg');

    await act(async () => {
      simulateFileChange(input, [file]);
    });

    await waitFor(() => {
      expect(screen.getByText('duplikat.jpg')).toBeInTheDocument();
    });

    const uploadBtn = screen.getByRole('button', { name: /1 beleg hochladen/i });
    await act(async () => {
      fireEvent.click(uploadBtn);
    });

    await waitFor(() => {
      // Toast mit Duplikat-Hinweis
      expect(screen.getByText(/duplikat/i)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('Validierung: zu große Datei → Warning, kein Upload', async () => {
    let uploadCalled = false;
    server.use(
      http.post(`${BASE}/belege/upload`, () => {
        uploadCalled = true;
        return HttpResponse.json({ beleg_id: 'b', storage_key: 'k', status: 'received' }, { status: 201 });
      }),
    );

    renderPage();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    // 21 MB — über dem 20 MB Limit
    const bigFile = makeFile('riesig.jpg', 'image/jpeg', 21 * 1024 * 1024);

    await act(async () => {
      simulateFileChange(input, [bigFile]);
    });

    await waitFor(() => {
      // Toast mit Größen-Warnung
      expect(screen.getByText(/zu groß/i)).toBeInTheDocument();
    });

    // Datei nicht in Liste (Validierung hat abgelehnt)
    expect(screen.queryByText('riesig.jpg')).not.toBeInTheDocument();
    expect(uploadCalled).toBe(false);
  });

  it('Validierung: falscher MIME-Type → Warning, kein Upload', async () => {
    renderPage();
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const badFile = makeFile('skript.exe', 'application/x-msdownload');

    await act(async () => {
      simulateFileChange(input, [badFile]);
    });

    await waitFor(() => {
      expect(screen.getByText(/ungültiger dateityp/i)).toBeInTheDocument();
    });

    expect(screen.queryByText('skript.exe')).not.toBeInTheDocument();
  });
});
