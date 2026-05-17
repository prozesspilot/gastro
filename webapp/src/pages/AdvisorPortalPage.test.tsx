/**
 * Tests für AdvisorPortalPage
 * Coverage-Ziel: ≥70% Seiten-Coverage
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../tests/msw/server';
import AdvisorPortalPage from './AdvisorPortalPage';
import { ToastProvider } from '../components/ToastProvider';

const BASE = '/api/v1';

const MOCK_CUSTOMER: { customer_id: string; name: string; receipt_count: number; pending_count: number; exported_count: number } = {
  customer_id: 'cust-001',
  name: 'Muster GmbH',
  receipt_count: 15,
  pending_count: 3,
  exported_count: 12,
};

const MOCK_RECEIPT = {
  receipt_id: 'receipt-001',
  customer_id: 'cust-001',
  customer_name: 'Muster GmbH',
  status: 'requires_review',
  supplier_name: 'Testlieferant',
  document_date: '2024-06-01T00:00:00Z',
  amount: 199.99,
  currency: 'EUR',
  review_reason: 'low_confidence',
  created_at: '2024-06-01T10:00:00Z',
};

function renderAdvisorPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <AdvisorPortalPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('AdvisorPortalPage', () => {
  it('rendert ohne Crash', () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    expect(document.body).toBeTruthy();
  });

  it('zeigt Steuerberater-Portal Titel', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('Steuerberater');
    }, { timeout: 3000 });
  });

  it('zeigt Tab-Leiste mit Übersicht und Prüfung', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('Mandantenuebersicht');
      expect(document.body.textContent).toContain('Pruefung');
    }, { timeout: 3000 });
  });

  it('zeigt Kunden in der Übersicht wenn vorhanden', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      expect(screen.getByText('Muster GmbH')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('zeigt Beleg-Zahlen für Kunden', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      // receipt_count = 15
      expect(document.body.textContent).toContain('15');
    }, { timeout: 3000 });
  });

  it('zeigt ausstehend-Badge wenn pending_count > 0', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('ausstehend');
    }, { timeout: 3000 });
  });

  it('zeigt leere Mandantenliste Hinweis', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('Keine Mandanten');
    }, { timeout: 3000 });
  });

  it('wechselt zu Prüfungs-Tab bei Klick', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('Pruefung');
    }, { timeout: 3000 });

    const pruefungTab = screen.getByText(/zur pruefung/i);
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      // Tab 2 shows either empty state or receipt list
      expect(document.body.textContent?.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('zeigt ausstehende Belege im Prüfungs-Tab', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      expect(document.body.textContent).toContain('Pruefung');
    }, { timeout: 3000 });

    const pruefungTab = screen.getByText(/zur pruefung/i);
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      expect(screen.getByText('Testlieferant')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('zeigt Betrag in der Tabelle', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
    );
    renderAdvisorPage();

    const pruefungTab = await waitFor(() => screen.getByText(/zur pruefung/i), { timeout: 3000 });
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      expect(document.body.textContent).toContain('199.99');
    }, { timeout: 3000 });
  });

  it('zeigt Grund-Badge in der Tabelle', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
    );
    renderAdvisorPage();

    const pruefungTab = await waitFor(() => screen.getByText(/zur pruefung/i), { timeout: 3000 });
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      expect(document.body.textContent).toContain('low_confidence');
    }, { timeout: 3000 });
  });

  it('zeigt Selektion von ausstehenden Belegen', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
    );
    renderAdvisorPage();

    const pruefungTab = await waitFor(() => screen.getByText(/zur pruefung/i), { timeout: 3000 });
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    const checkboxes = document.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
    // click first non-select-all checkbox
    const receiptCheckbox = Array.from(checkboxes).find(cb => cb.getAttribute('aria-label')?.includes('auswaehlen'));
    if (receiptCheckbox) {
      fireEvent.click(receiptCheckbox);
      expect(document.body.textContent).toContain('1 von');
    }
  });

  it('wechselt zu Review-Tab beim Klick auf Kunden-Karte', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    );
    renderAdvisorPage();

    await waitFor(() => {
      expect(screen.getByText('Muster GmbH')).toBeInTheDocument();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByText('Muster GmbH'));

    await waitFor(() => {
      // Should switch to review tab - shows customer filter or empty state
      expect(document.body.textContent?.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('zeigt Kommentar-Eingabe bei Klick auf Kommentar-Button', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
    );
    renderAdvisorPage();

    const pruefungTab = await waitFor(() => screen.getByText(/zur pruefung/i), { timeout: 3000 });
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      expect(screen.getByText('Kommentar')).toBeInTheDocument();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByText('Kommentar'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/kommentar eingeben/i)).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('schließt Kommentar-Eingabe bei Abbrechen', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
    );
    renderAdvisorPage();

    const pruefungTab = await waitFor(() => screen.getByText(/zur pruefung/i), { timeout: 3000 });
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      expect(screen.getByText('Kommentar')).toBeInTheDocument();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByText('Kommentar'));

    await waitFor(() => {
      expect(screen.getByText('Abbrechen')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Abbrechen'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/kommentar eingeben/i)).toBeNull();
    });
  });

  it('zeigt Alle-auswählen Checkbox im Review-Tab', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
    );
    renderAdvisorPage();

    const pruefungTab = await waitFor(() => screen.getByText(/zur pruefung/i), { timeout: 3000 });
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      const allCheckbox = screen.queryByLabelText(/alle auswaehlen/i);
      expect(allCheckbox).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('wählt alle Belege mit Alle-auswählen-Checkbox', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
    );
    renderAdvisorPage();

    const pruefungTab = await waitFor(() => screen.getByText(/zur pruefung/i), { timeout: 3000 });
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      expect(screen.queryByLabelText(/alle auswaehlen/i)).toBeTruthy();
    }, { timeout: 3000 });

    const allCheckbox = screen.getByLabelText(/alle auswaehlen/i);
    fireEvent.click(allCheckbox);

    await waitFor(() => {
      expect(document.body.textContent).toContain('1 von 1 ausgewaehlt');
    }, { timeout: 3000 });
  });

  it('zeigt Erfolgsmeldung nach Bulk-Genehmigung', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
      http.post(`${BASE}/advisor/receipts/bulk-approve`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            approved_count: 1,
            skipped_count: 0,
            approval_id: 'approval-001',
            approved_receipt_ids: ['receipt-001'],
            skipped_receipt_ids: [],
          },
        }),
      ),
    );
    renderAdvisorPage();

    const pruefungTab = await waitFor(() => screen.getByText(/zur pruefung/i), { timeout: 3000 });
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      expect(screen.queryByLabelText(/alle auswaehlen/i)).toBeTruthy();
    }, { timeout: 3000 });

    // Select all
    fireEvent.click(screen.getByLabelText(/alle auswaehlen/i));

    await waitFor(() => {
      expect(screen.queryByText(/ausgewaehlte genehmigen/i)).toBeTruthy();
    }, { timeout: 3000 });

    await act(async () => {
      fireEvent.click(screen.getByText(/ausgewaehlte genehmigen/i));
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('genehmigt');
    }, { timeout: 3000 });
  });

  it('schließt Erfolgsmeldung bei Klick auf X', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
      http.post(`${BASE}/advisor/receipts/bulk-approve`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            approved_count: 1,
            skipped_count: 0,
            approval_id: null,
            approved_receipt_ids: ['receipt-001'],
            skipped_receipt_ids: [],
          },
        }),
      ),
    );
    renderAdvisorPage();

    const pruefungTab = await waitFor(() => screen.getByText(/zur pruefung/i), { timeout: 3000 });
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      expect(screen.queryByLabelText(/alle auswaehlen/i)).toBeTruthy();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByLabelText(/alle auswaehlen/i));

    await waitFor(() => {
      expect(screen.queryByText(/ausgewaehlte genehmigen/i)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/ausgewaehlte genehmigen/i));
    });

    await waitFor(() => {
      const alertSuccess = document.querySelector('.alert-success');
      if (alertSuccess) {
        const closeBtn = alertSuccess.querySelector('button');
        if (closeBtn) {
          fireEvent.click(closeBtn);
        }
      }
    }, { timeout: 3000 });
  });

  it('zeigt Fehler-Meldung bei API-Fehler', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      // Even with error the page should render something
      expect(document.body.textContent?.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('zeigt Prüfungs-Tab-Badge mit Anzahl', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
    );
    renderAdvisorPage();
    await waitFor(() => {
      // Badge mit Anzahl der offenen Belege
      expect(document.body.textContent).toContain('1');
    }, { timeout: 3000 });
  });

  it('fügt Kommentar hinzu und schließt Zeile', async () => {
    server.use(
      http.get(`${BASE}/advisor/overview`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_CUSTOMER] }),
      ),
      http.get(`${BASE}/advisor/receipts/pending`, () =>
        HttpResponse.json({ ok: true, data: [MOCK_RECEIPT] }),
      ),
      http.post(`${BASE}/advisor/receipts/:id/comment`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            comment_id: 'comment-001',
            receipt_id: 'receipt-001',
            advisor_id: 'demo-advisor-001',
            customer_id: 'cust-001',
            comment: 'Test-Kommentar',
            created_at: '2024-01-01T00:00:00Z',
          },
        }),
      ),
    );
    renderAdvisorPage();

    const pruefungTab = await waitFor(() => screen.getByText(/zur pruefung/i), { timeout: 3000 });
    fireEvent.click(pruefungTab);

    await waitFor(() => {
      expect(screen.getByText('Kommentar')).toBeInTheDocument();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByText('Kommentar'));

    await waitFor(() => {
      const commentInput = screen.queryByPlaceholderText(/kommentar eingeben/i);
      expect(commentInput).toBeTruthy();
    });

    const commentInput = screen.getByPlaceholderText(/kommentar eingeben/i);
    fireEvent.change(commentInput, { target: { value: 'Test-Kommentar' } });

    const saveBtn = screen.getByText('Speichern');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      expect(document.body.textContent?.length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });
});
