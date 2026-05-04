/**
 * Tests für useDebounce Hook
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  it('gibt initialen Wert sofort zurück', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));
    expect(result.current).toBe('initial');
  });

  it('debounced den Wert nach dem Delay', async () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'erste', delay: 300 } },
    );

    expect(result.current).toBe('erste');

    // Wert ändern
    rerender({ value: 'zweite', delay: 300 });
    expect(result.current).toBe('erste'); // Noch nicht debounced

    // Timer ablaufen lassen
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('zweite');

    vi.useRealTimers();
  });

  it('cancelled vorherigen Timeout bei neuem Wert', async () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'a' } },
    );

    // Schnell mehrere Werte setzen
    rerender({ value: 'ab' });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: 'abc' });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: 'abcd' });

    // Noch nicht debounced
    expect(result.current).toBe('a');

    // Vollständig ablaufen lassen
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe('abcd');

    vi.useRealTimers();
  });

  it('funktioniert mit Zahlen', () => {
    const { result } = renderHook(() => useDebounce(42, 100));
    expect(result.current).toBe(42);
  });

  it('funktioniert mit Objekten', () => {
    const obj = { key: 'value' };
    const { result } = renderHook(() => useDebounce(obj, 100));
    expect(result.current).toEqual(obj);
  });
});
