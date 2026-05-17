/**
 * Tests für StatusBadge-Komponente
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it('zeigt "Empfangen" für received', () => {
    render(<StatusBadge status="received" />);
    expect(screen.getByText('Empfangen')).toBeInTheDocument();
  });

  it('zeigt "Fehler" für error', () => {
    render(<StatusBadge status="error" />);
    expect(screen.getByText('Fehler')).toBeInTheDocument();
  });

  it('zeigt "Fertig" für done (Legacy)', () => {
    render(<StatusBadge status="done" />);
    expect(screen.getByText('Fertig')).toBeInTheDocument();
  });

  it('zeigt "Wartend" für pending (Legacy)', () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText('Wartend')).toBeInTheDocument();
  });

  it('zeigt "In Bearbeitung" für processing (Legacy)', () => {
    render(<StatusBadge status="processing" />);
    expect(screen.getByText('In Bearbeitung…')).toBeInTheDocument();
  });

  it('zeigt rohen Status für unbekannte Werte', () => {
    render(<StatusBadge status="my-custom-status" />);
    expect(screen.getByText('my-custom-status')).toBeInTheDocument();
  });

  it('animiert Status "extracting"', () => {
    render(<StatusBadge status="extracting" />);
    expect(screen.getByText('OCR läuft…')).toBeInTheDocument();
  });

  it('zeigt "Prüfung nötig" für requires_review', () => {
    render(<StatusBadge status="requires_review" />);
    expect(screen.getByText('Prüfung nötig')).toBeInTheDocument();
  });

  it('enthält badge-Klasse', () => {
    const { container } = render(<StatusBadge status="done" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('badge');
  });

  it('enthält korrekte Klasse für error (inactive)', () => {
    const { container } = render(<StatusBadge status="error" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('inactive');
  });

  it('enthält korrekte Klasse für completed (active)', () => {
    const { container } = render(<StatusBadge status="completed" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('active');
  });
});
