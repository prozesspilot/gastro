/**
 * Tests für Skeleton-Komponenten
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkeletonLine, SkeletonBlock } from './Skeleton';

describe('SkeletonLine', () => {
  it('rendert mit Default-Werten', () => {
    const { container } = render(<SkeletonLine />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.className).toContain('skeleton');
    expect(el.style.width).toBe('100%');
    expect(el.style.height).toBe('14px');
  });

  it('akzeptiert numerische Breite', () => {
    const { container } = render(<SkeletonLine width={200} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('200px');
  });

  it('akzeptiert String-Breite', () => {
    const { container } = render(<SkeletonLine width="50%" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('50%');
  });

  it('hat aria-hidden=true', () => {
    const { container } = render(<SkeletonLine />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('SkeletonBlock', () => {
  it('rendert mit Default-Werten', () => {
    const { container } = render(<SkeletonBlock />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.className).toContain('skeleton');
    expect(el.style.height).toBe('80px');
  });

  it('akzeptiert Height-Prop', () => {
    const { container } = render(<SkeletonBlock height={200} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe('200px');
  });

  it('hat border-radius', () => {
    const { container } = render(<SkeletonBlock />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.borderRadius).toBe('12px');
  });

  it('hat aria-hidden=true', () => {
    const { container } = render(<SkeletonBlock />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
