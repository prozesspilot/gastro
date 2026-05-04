/**
 * Tests für ErrorBoundary-Komponente
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

// Hilfsfunktion: Komponente die einen Fehler wirft
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test-Fehler!');
  return <div>Normaler Inhalt</div>;
}

describe('ErrorBoundary', () => {
  it('rendert Kinder wenn kein Fehler', () => {
    render(
      <ErrorBoundary>
        <div>Kein Fehler</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Kein Fehler')).toBeInTheDocument();
  });

  it('zeigt Fehler-UI bei einem Fehler in einem Kind', () => {
    // Fehler-Logs unterdrücken (ErrorBoundary schreibt in console.error)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Etwas ist schiefgegangen')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('zeigt Reload- und Home-Buttons in der Fehler-UI', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('↻ Seite neu laden')).toBeInTheDocument();
    expect(screen.getByText('← Zum Dashboard')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('Reload-Button ruft window.location.reload auf', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reloadSpy  = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('↻ Seite neu laden'));
    expect(reloadSpy).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
  });
});
