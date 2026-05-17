/**
 * Tests für EmptyState-Komponente
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('zeigt Titel', () => {
    render(<EmptyState title="Keine Einträge" />);
    expect(screen.getByText('Keine Einträge')).toBeInTheDocument();
  });

  it('zeigt optionale Beschreibung', () => {
    render(<EmptyState title="Leer" description="Noch keine Daten vorhanden." />);
    expect(screen.getByText('Noch keine Daten vorhanden.')).toBeInTheDocument();
  });

  it('zeigt keine Beschreibung wenn nicht angegeben', () => {
    render(<EmptyState title="Leer" />);
    expect(screen.queryByText(/Daten/)).not.toBeInTheDocument();
  });

  it('hat role=status und aria-label=title', () => {
    render(<EmptyState title="Kein Ergebnis" />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('aria-label', 'Kein Ergebnis');
  });

  it('zeigt Action-Button wenn action-Prop angegeben', () => {
    const onClick = vi.fn();
    render(<EmptyState title="Leer" action={{ label: 'Jetzt erstellen', onClick }} />);
    const btn = screen.getByText('Jetzt erstellen');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('zeigt kein Action-Button wenn keine action angegeben', () => {
    render(<EmptyState title="Leer" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('zeigt Standard-Icon wenn keines angegeben', () => {
    render(<EmptyState title="Leer" />);
    // Standard-Icon ist 'inbox'
    expect(screen.getByText('inbox')).toBeInTheDocument();
  });

  it('zeigt Custom-Icon', () => {
    render(<EmptyState title="Leer" icon="📭" />);
    expect(screen.getByText('📭')).toBeInTheDocument();
  });
});
