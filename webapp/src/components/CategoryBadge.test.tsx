/**
 * Tests für CategoryBadge-Komponente
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CategoryBadge, { categoryColorVar } from './CategoryBadge';

describe('CategoryBadge', () => {
  it('gibt null zurück wenn weder category noch label', () => {
    const { container } = render(<CategoryBadge />);
    expect(container.firstChild).toBeNull();
  });

  it('zeigt Label-Text', () => {
    render(<CategoryBadge category="miete" label="Miete & Pacht" />);
    expect(screen.getByText('Miete & Pacht')).toBeInTheDocument();
  });

  it('zeigt category wenn kein label', () => {
    render(<CategoryBadge category="buerokosten" />);
    expect(screen.getByText('buerokosten')).toBeInTheDocument();
  });

  it('nutzt Fallback-Farbe für unbekannte Kategorie', () => {
    render(<CategoryBadge category="unbekannt" label="Unbekannt" />);
    const span = screen.getByText('Unbekannt');
    // Fallback-Farbe: #a78bfa
    expect(span.style.color).toBe('rgb(167, 139, 250)');
  });

  it('nutzt spezifische Farbe für bekannte Kategorie', () => {
    render(<CategoryBadge category="miete" label="Miete" />);
    const span = screen.getByText('Miete');
    // Miete: color: '#58a6ff'
    expect(span.style.color).toBe('rgb(88, 166, 255)');
  });

  it('zeigt nur label wenn beide angegeben', () => {
    render(<CategoryBadge category="personal" label="Personalaufwand" />);
    expect(screen.getByText('Personalaufwand')).toBeInTheDocument();
    expect(screen.queryByText('personal')).not.toBeInTheDocument();
  });
});

describe('categoryColorVar', () => {
  it('gibt Fallback zurück für undefined', () => {
    expect(categoryColorVar(undefined)).toBe('#a78bfa');
  });

  it('gibt Fallback zurück für null', () => {
    expect(categoryColorVar(null)).toBe('#a78bfa');
  });

  it('gibt spezifische Farbe für bekannte Kategorie', () => {
    expect(categoryColorVar('miete')).toBe('#58a6ff');
  });

  it('gibt Fallback für unbekannte Kategorie', () => {
    expect(categoryColorVar('x-unbekannt')).toBe('#a78bfa');
  });
});
