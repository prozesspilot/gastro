/**
 * Tests für ToastProvider + useToast
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastProvider';

// Test-Komponente die den Toast-Hook nutzt
function ToastTrigger({ type, message }: { type: string; message: string }) {
  const { toast } = useToast();
  return (
    <button onClick={() => toast(type as 'success' | 'error' | 'info' | 'warning', message)}>
      Toast auslösen
    </button>
  );
}

function DismissTrigger({ id }: { id: number }) {
  const { dismiss } = useToast();
  return (
    <button onClick={() => dismiss(id)}>Dismiss</button>
  );
}

describe('ToastProvider', () => {
  it('rendert Kinder', () => {
    render(
      <ToastProvider>
        <div>Inhalt</div>
      </ToastProvider>,
    );
    expect(screen.getByText('Inhalt')).toBeInTheDocument();
  });

  it('zeigt Toast nach toast()-Aufruf', async () => {
    render(
      <ToastProvider>
        <ToastTrigger type="success" message="Aktion erfolgreich!" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Toast auslösen'));
    expect(screen.getByText('Aktion erfolgreich!')).toBeInTheDocument();
  });

  it('zeigt Error-Toast', async () => {
    render(
      <ToastProvider>
        <ToastTrigger type="error" message="Fehler aufgetreten" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Toast auslösen'));
    expect(screen.getByText('Fehler aufgetreten')).toBeInTheDocument();
  });

  it('erlaubt Close über ×-Button', async () => {
    render(
      <ToastProvider>
        <ToastTrigger type="info" message="Info-Nachricht" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Toast auslösen'));
    expect(screen.getByText('Info-Nachricht')).toBeInTheDocument();

    // Close-Button klicken (aria-label="Schließen")
    const closeBtn = screen.getByRole('button', { name: /schließen/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Info-Nachricht')).not.toBeInTheDocument();
  });
});

describe('useToast', () => {
  it('wirft wenn außerhalb von ToastProvider verwendet', () => {
    function Bad() {
      useToast();
      return null;
    }
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Bad />)).toThrow('useToast must be inside ToastProvider');
    consoleSpy.mockRestore();
  });
});
