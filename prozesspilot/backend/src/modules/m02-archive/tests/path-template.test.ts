/**
 * M02 — Tests für renderPathTemplate / renderFilename (M02 §9).
 */

import { describe, it, expect } from 'vitest';
import {
  renderPathTemplate,
  renderFilename,
  sanitizeFilename,
  transliterate,
} from '../../../core/templates/path-template';
import type { Receipt } from '../../_shared/receipts/receipt.repository';

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    receipt_id: '01HVZ8X4M3R9K7N2P6T1Q5Y8B4',
    customer_id: 'cust_a3f4b2',
    status: 'extracted',
    file: {
      object_key: 'cust_a3f4b2/originals/2026/04/foo.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 1024,
      sha256: 'f3b8a91c2d7e44bb9a1c3f5a92e5f3d7c8b1a2e9f4b5d6c7a8e9f0b1c2d3e4f5',
    },
    extraction: {
      fields: {
        supplier_name: 'Pizzeria Bella Italia',
        document_number: 'RE-2026-1042',
        document_date: '2026-04-28',
        total_gross: 142.85,
      },
    },
    categorization: {
      category: 'wareneinkauf_food',
      category_label: 'Wareneinkauf',
    },
    ...overrides,
  };
}

describe('M02 path-template — renderPathTemplate', () => {
  it('rendert Spec-Beispiel exakt: 2026/April/Wareneinkauf/', () => {
    const out = renderPathTemplate('{year}/{month_de}/{category_label}/', makeReceipt());
    expect(out).toBe('2026/April/Wareneinkauf/');
  });

  it('respektiert führenden Slash (/{year}/{month_de}/)', () => {
    const out = renderPathTemplate('/{year}/{month_de}/', makeReceipt());
    expect(out).toBe('/2026/April/');
  });

  it('entfernt ../ aus Variablen-Werten (Path-Traversal-Schutz)', () => {
    const r = makeReceipt({
      categorization: {
        category_label: '..' as unknown as string,
        category: 'x' as unknown as string,
      },
    });
    const out = renderPathTemplate('{year}/{category_label}/', r);
    // Nach Sanitizing fällt das '..'-Segment weg.
    expect(out).toBe('2026/');
  });
});

describe('M02 path-template — renderFilename', () => {
  it('rendert ISO-Datum + Supplier + Doc-Number + Betrag', () => {
    const out = renderFilename(
      '{document_date}_{supplier_name}_{document_number}_{total_gross}EUR.pdf',
      makeReceipt(),
    );
    // Spaces im Supplier-Namen werden zu '_' (cleanSupplierLoose)
    expect(out).toBe('2026-04-28_Pizzeria_Bella_Italia_RE-2026-1042_142.85EUR.pdf');
  });

  it('transliteriert Sonderzeichen: ä→ae, ü→ue, ö→oe, ß→ss', () => {
    const r = makeReceipt({
      extraction: {
        fields: {
          supplier_name: 'Bäckerei Müßiggang & Söhne',
          document_date: '2026-04-28',
          document_number: 'X',
          total_gross: 10.0,
        },
      },
    });
    const out = renderFilename('{supplier_name}.pdf', r);
    expect(out).toContain('Baeckerei');
    expect(out).toContain('Muessiggang');
    expect(out).toContain('Soehne');
    expect(out).not.toMatch(/[äöüÄÖÜß]/);
  });

  it('entfernt Slashes aus dem gerenderten Filename', () => {
    const r = makeReceipt({
      extraction: {
        fields: {
          supplier_name: 'Foo/Bar\\Baz',
          document_date: '2026-04-28',
          document_number: 'A',
          total_gross: 1,
        },
      },
    });
    const out = renderFilename('{supplier_name}.pdf', r);
    expect(out).not.toMatch(/[\\/]/);
  });

  it('Leere Variable → "unbekannt"', () => {
    const r = makeReceipt({
      extraction: { fields: { document_date: '2026-04-28' } },
      categorization: {},
    });
    const out = renderPathTemplate('{year}/{category_label}/', r);
    expect(out).toBe('2026/unbekannt/');
  });

  it('Limit auf 200 Zeichen', () => {
    const longName = 'X'.repeat(500);
    const r = makeReceipt({
      extraction: {
        fields: {
          supplier_name: longName,
          document_date: '2026-04-28',
          document_number: 'A',
          total_gross: 1,
        },
      },
    });
    const out = renderFilename('{supplier_name}.pdf', r);
    expect(out.length).toBeLessThanOrEqual(200);
  });
});

describe('M02 path-template — Helper exports', () => {
  it('transliterate(): ä→ae, ö→oe, ü→ue, ß→ss', () => {
    expect(transliterate('äöüÄÖÜß')).toBe('aeoeueAeOeUess');
  });

  it('sanitizeFilename entfernt nur Pfadtrennzeichen + ..', () => {
    expect(sanitizeFilename('hello world.pdf')).toBe('hello world.pdf');
    expect(sanitizeFilename('../secret.pdf')).toBe('secret.pdf');
    expect(sanitizeFilename('a/b/c.pdf')).toBe('abc.pdf');
  });
});
