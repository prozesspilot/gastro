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
    // Light-Theme-Fallback: #4E5A6B (Slate)
    expect(span.style.color).toBe('rgb(78, 90, 107)');
  });

  it('nutzt spezifische Farbe für bekannte Kategorie', () => {
    render(<CategoryBadge category="miete" label="Miete" />);
    const span = screen.getByText('Miete');
    // Miete (Light-Theme): #0879C2
    expect(span.style.color).toBe('rgb(8, 121, 194)');
  });

  it('zeigt nur label wenn beide angegeben', () => {
    render(<CategoryBadge category="personal" label="Personalaufwand" />);
    expect(screen.getByText('Personalaufwand')).toBeInTheDocument();
    expect(screen.queryByText('personal')).not.toBeInTheDocument();
  });
});

describe('categoryColorVar', () => {
  it('gibt Fallback zurück für undefined', () => {
    expect(categoryColorVar(undefined)).toBe('#4E5A6B');
  });

  it('gibt Fallback zurück für null', () => {
    expect(categoryColorVar(null)).toBe('#4E5A6B');
  });

  it('gibt spezifische Farbe für bekannte Kategorie', () => {
    expect(categoryColorVar('miete')).toBe('#0879C2');
  });

  it('gibt Fallback für unbekannte Kategorie', () => {
    expect(categoryColorVar('x-unbekannt')).toBe('#4E5A6B');
  });
});
