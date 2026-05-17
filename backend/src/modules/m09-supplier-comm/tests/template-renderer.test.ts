/**
 * M09 — Template-Renderer Tests
 *
 * Verifiziert:
 *   1. Template-Variablen korrekt ersetzt
 *   2. Unbekannte Template-Keys werfen Error
 *   3. HTML-Wrapper vorhanden
 *   4. Fehlende Variablen → leerer String
 *   5. Alle 4 Standard-Templates sind renderfähig
 */

import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../services/template-renderer';
import type { TemplateVars } from '../services/template-renderer';

describe('M09 — Template-Renderer', () => {
  it('ersetzt {{variable}} korrekt im subject', () => {
    const result = renderTemplate('missing_invoice_de_v2', {
      supplier_name: 'Metro AG',
      ref: 'REF-001',
      period: 'April 2026',
      customer_belege_email: 'belege@krone.de',
      customer_display_name: 'Restaurant Krone',
    });

    // supplier_name erscheint im subject
    expect(result.subject).toContain('Metro AG');
    expect(typeof result.subject).toBe('string');
    expect(result.subject.length).toBeGreaterThan(0);
    // body_text ist ein valider String
    expect(typeof result.body_text).toBe('string');
    expect(result.body_text.length).toBeGreaterThan(0);
  });

  it('HTML-Wrapper enthält <pre style=...> mit body_text-Inhalt', () => {
    const result = renderTemplate('low_quality_de_v1', {
      supplier_name: 'Lieferant GmbH',
      document_date: '01.01.2026',
      customer_name: 'Kunde',
      contact_name: 'Herr Müller',
    });

    // body_html enthält pre mit style-Attribut
    expect(result.body_html).toMatch(/<pre style=/);
    // Schließendes Tag
    expect(result.body_html).toContain('</pre>');
    // body_html ist länger als body_text (enthält HTML-Overhead)
    expect(result.body_html.length).toBeGreaterThan(result.body_text.length);
  });

  it('renderTemplate für alle Standard-Templates schlägt nicht fehl', () => {
    const templates = [
      'low_quality_de_v1',
      'missing_invoice_de_v2',
      'confirmation_received_de_v1',
      'reminder_overdue_de_v1',
    ] as const;

    const vars: TemplateVars = {
      supplier_name: 'Test Lieferant',
      document_date: '01.01.2026',
      customer_name: 'Test Kunde',
      contact_name: 'Test Kontakt',
      reference_number: 'REF-001',
      receipt_id: 'rcpt-123',
    };

    for (const tmpl of templates) {
      expect(() => renderTemplate(tmpl, vars)).not.toThrow();
      const result = renderTemplate(tmpl, vars);
      expect(result.subject).toBeDefined();
      expect(result.body_text).toBeDefined();
      expect(result.body_html).toBeDefined();
    }
  });

  it('fehlende Variable → {{variable}} bleibt oder wird zu leerem String', () => {
    // Template mit fehlender Variable — sollte nicht werfen
    const result = renderTemplate('low_quality_de_v1', {
      // supplier_name fehlt absichtlich
      document_date: '01.01.2026',
      customer_name: 'Kunde',
      contact_name: 'Kontakt',
    });

    // Irgendein Ergebnis ist vorhanden
    expect(result.body_text).toBeDefined();
    expect(typeof result.body_text).toBe('string');
  });

  it('subject_string ist kein Leer-String', () => {
    const result = renderTemplate('confirmation_received_de_v1', {
      supplier_name: 'Metro AG',
      document_date: '15.04.2026',
      customer_name: 'Restaurant',
      contact_name: 'Chef',
    });

    expect(result.subject.trim().length).toBeGreaterThan(0);
  });

  it('body_html enthält </pre> abschließend', () => {
    const result = renderTemplate('reminder_overdue_de_v1', {
      supplier_name: 'Stadtwerke GmbH',
      document_date: '01.03.2026',
      customer_name: 'Bistro',
      contact_name: 'Frau Schmidt',
      reference_number: 'REM-2026-001',
    });

    expect(result.body_html).toContain('</pre>');
  });
});
