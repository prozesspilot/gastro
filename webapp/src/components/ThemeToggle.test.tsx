/**
 * T085 — Tests für den Theme-Umschalter: Default, Umschalten (data-theme +
 * localStorage), und Wiederherstellung aus gespeicherter Wahl.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_KEY } from '../lib/theme';
import ThemeToggle from './ThemeToggle';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('startet im Light-Modus (kein matchMedia in jsdom) und bietet „Dunkles Design" an', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /zu dunklem design wechseln/i })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('Klick wechselt zu Dark: data-theme="dark" + persistiert + Label „Helles Design"', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: /zu dunklem design wechseln/i }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: /zu hellem design wechseln/i })).toBeInTheDocument();
  });

  it('erneuter Klick wechselt zurück zu Light', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = () => screen.getByRole('button');
    await user.click(btn()); // → dark
    await user.click(btn()); // → light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('stellt eine gespeicherte Dark-Wahl beim Mount wieder her', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: /zu hellem design wechseln/i })).toBeInTheDocument();
  });
});
