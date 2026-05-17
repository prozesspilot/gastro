/**
 * Tests für NotFoundPage
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from './NotFoundPage';

describe('NotFoundPage', () => {
  it('zeigt 404-Meldung im DOM', () => {
    const { container } = render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    // 404 ist mit aria-hidden, also via textContent des Containers prüfen
    expect(container.textContent).toContain('404');
  });

  it('hat Link zurück zur Startseite', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
  });

  it('rendert ohne Crash', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <NotFoundPage />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
