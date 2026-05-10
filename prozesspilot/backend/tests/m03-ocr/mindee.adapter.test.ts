/**
 * Tests für den Mindee-Adapter (Phase 3, Pro).
 *
 * Wir mocken `mindee` SDK über `vi.mock` und stellen einen Fake-Client bereit,
 * der eine InvoiceV4-Prediction zurückgibt. Der Adapter wird dann auf die
 * gemeinsame OcrResult-Struktur gemappt.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Fake Mindee SDK -------------------------------------------------------

class FakeBufferInput {
  buffer: Buffer;
  filename: string;
  constructor({ buffer, filename }: { buffer: Buffer; filename: string }) {
    this.buffer = buffer;
    this.filename = filename;
  }
}

const parseMock = vi.fn();

class FakeClient {
  apiKey: string;
  constructor({ apiKey }: { apiKey: string }) {
    this.apiKey = apiKey;
  }
  parse(productClass: unknown, source: unknown, params?: unknown): Promise<unknown> {
    return parseMock(productClass, source, params);
  }
}

const FakeInvoiceV4 = class FakeInvoiceV4 {};

vi.mock('mindee', () => {
  return {
    Client: FakeClient,
    BufferInput: FakeBufferInput,
    v1: {
      Client: FakeClient,
      product: { InvoiceV4: FakeInvoiceV4 },
    },
    product: { InvoiceV4: FakeInvoiceV4 },
  };
});

// Erst nach vi.mock importieren — sonst greift der Mock nicht.
import {
  MindeeAdapter,
  __setMindeeClientForTests,
  __setMindeeSdkForTests,
  mapMindeeToOcrFields,
} from '../../src/core/adapters/ocr/mindee.adapter';

// ── Helpers --------------------------------------------------------------

function field<T extends string | number>(value: T | null | undefined, confidence = 0.95) {
  return { value: value ?? undefined, confidence };
}

function makeFullPrediction() {
  return {
    document: {
      inference: {
        prediction: {
          supplierName: field('Metro AG'),
          supplierAddress: field('Hauptstr. 1, 80331 München'),
          supplierCompanyRegistrations: [field('DE123456789', 0.9)],
          supplierPaymentDetails: [field('IBAN DE12...', 0.8)],
          invoiceNumber: field('RE-2026-1042'),
          date: field('2026-04-28'),
          dueDate: field('2026-05-28'),
          totalNet: field(120.04, 0.97),
          totalAmount: field(142.85, 0.96),
          totalTax: field(22.81, 0.92),
          taxes: [{ rate: 19, value: 22.81, confidence: 0.93 }],
          locale: { currency: 'EUR', confidence: 0.99 },
        },
        pages: [{ prediction: {} }],
      },
      ocr: {
        mvisionV1: {
          pages: [{ allWords: { content: 'Metro AG\nRE-2026-1042' } }],
        },
      },
    },
  };
}

beforeEach(() => {
  parseMock.mockReset();
  // Reset internal cache zwischen Tests
  __setMindeeClientForTests(null);
  __setMindeeSdkForTests(null);
  process.env.MINDEE_API_KEY = 'test_mindee_key';
});

afterEach(() => {
  Reflect.deleteProperty(process.env, 'MINDEE_API_KEY');
});

describe('MindeeAdapter', () => {
  it('mapt eine vollständige InvoiceV4-Prediction auf OcrResult.fields', async () => {
    parseMock.mockResolvedValueOnce(makeFullPrediction());

    const adapter = new MindeeAdapter();
    const res = await adapter.extract(Buffer.from('PDF-bytes'), { filename: 'invoice.pdf' });

    expect(res.fields?.supplier_name).toBe('Metro AG');
    expect(res.fields?.supplier_vat_id).toBe('DE123456789');
    expect(res.fields?.supplier_address).toBe('Hauptstr. 1, 80331 München');
    expect(res.fields?.document_number).toBe('RE-2026-1042');
    expect(res.fields?.document_date).toBe('2026-04-28');
    expect(res.fields?.due_date).toBe('2026-05-28');
    expect(res.fields?.total_net).toBe(120.04);
    expect(res.fields?.total_gross).toBe(142.85);
    expect(res.fields?.total_tax).toBe(22.81);
    expect(res.fields?.tax_lines).toEqual([{ rate: 19, amount: 22.81 }]);
    expect(res.fields?.currency).toBe('EUR');
    expect(res.fields?.payment_method).toBe('IBAN DE12...');
    expect(res.confidence).toBeGreaterThan(0.8);
    expect(res.raw_text).toContain('Metro AG');
    expect(res.page_count).toBe(1);
  });

  it('liefert für null/undefined Mindee-Werte undefined Felder (kein Crash)', async () => {
    parseMock.mockResolvedValueOnce({
      document: {
        inference: {
          prediction: {
            // Alle Felder fehlen
            supplierName: { value: null, confidence: 0 },
            invoiceNumber: undefined,
            // taxes fehlt komplett
            // locale fehlt komplett
          },
          pages: [],
        },
      },
    });

    const adapter = new MindeeAdapter();
    const res = await adapter.extract(Buffer.from('x'));

    expect(res.fields?.supplier_name).toBeUndefined();
    expect(res.fields?.document_number).toBeUndefined();
    expect(res.fields?.total_gross).toBeUndefined();
    expect(res.fields?.tax_lines).toBeUndefined();
    expect(res.fields?.currency).toBeUndefined();
    // Nichts wirft, OcrResult ist gültig
    expect(res.confidence).toBe(0);
  });

  it('wirft mit klarer Message, wenn MINDEE_API_KEY fehlt', async () => {
    Reflect.deleteProperty(process.env, 'MINDEE_API_KEY');
    const adapter = new MindeeAdapter();
    await expect(adapter.extract(Buffer.from('x'))).rejects.toThrow(/MINDEE_API_KEY/);
  });
});

describe('mapMindeeToOcrFields (unit)', () => {
  it('filtert null-Werte und liefert undefined statt null', () => {
    const out = mapMindeeToOcrFields({
      supplierName: { value: 'Foo', confidence: 0.9 },
      invoiceNumber: { value: null, confidence: 0 },
      totalAmount: { value: 100, confidence: 0.9 },
      taxes: [],
    });
    expect(out.supplier_name).toBe('Foo');
    expect(out.document_number).toBeUndefined();
    expect(out.total_gross).toBe(100);
    expect(out.tax_lines).toBeUndefined();
  });
});
