/**
 * Tests für GlobalSearch-Komponente
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GlobalSearch from './GlobalSearch';
import { ToastProvider } from './ToastProvider';

function renderGlobalSearch(open = true) {
  const onClose = () => undefined;
  return render(
    <ToastProvider>
      <MemoryRouter>
        <GlobalSearch open={open} onClose={onClose} />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('GlobalSearch', () => {
  it('rendert nicht wenn open=false', () => {
    const { container } = renderGlobalSearch(false);
    // Wenn closed, kein Suchfeld sichtbar
    expect(container.querySelector('input')).toBeNull();
  });

  it('rendert wenn open=true', () => {
    renderGlobalSearch(true);
    // Suchfeld sollte vorhanden sein
    const input = screen.queryByRole('textbox') ?? screen.queryByPlaceholderText(/suche/i);
    expect(input).toBeTruthy();
  });

  it('zeigt Overlay wenn geöffnet', () => {
    const { container } = renderGlobalSearch(true);
    expect(container.firstChild).toBeTruthy();
  });
});
