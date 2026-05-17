/**
 * Tests für ConfidenceBadge-Komponente
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConfidenceBadge from './ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it('gibt null zurück bei undefined', () => {
    const { container } = render(<ConfidenceBadge confidence={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('gibt null zurück bei null', () => {
    const { container } = render(<ConfidenceBadge confidence={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('zeigt 95% für confidence=0.95', () => {
    render(<ConfidenceBadge confidence={0.95} />);
    expect(screen.getByText(/95%/)).toBeInTheDocument();
  });

  it('zeigt 0% für confidence=0', () => {
    render(<ConfidenceBadge confidence={0} />);
    expect(screen.getByText(/0%/)).toBeInTheDocument();
  });

  it('nutzt active-Klasse für Konfidenz >= 75%', () => {
    const { container } = render(<ConfidenceBadge confidence={0.9} />);
    expect(container.firstChild).toHaveClass('active');
  });

  it('nutzt pending-Klasse für Konfidenz 60-74%', () => {
    const { container } = render(<ConfidenceBadge confidence={0.7} />);
    expect(container.firstChild).toHaveClass('pending');
  });

  it('nutzt inactive-Klasse für Konfidenz < 60%', () => {
    const { container } = render(<ConfidenceBadge confidence={0.4} />);
    expect(container.firstChild).toHaveClass('inactive');
  });

  it('zeigt Icon im Normal-Modus', () => {
    render(<ConfidenceBadge confidence={0.9} />);
    // Icon ✓ für high confidence
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('zeigt kein Icon im compact-Modus', () => {
    render(<ConfidenceBadge confidence={0.9} compact />);
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
  });

  it('hat title-Attribut', () => {
    const { container } = render(<ConfidenceBadge confidence={0.8} />);
    expect(container.firstChild).toHaveAttribute('title', 'OCR-Konfidenz');
  });

  it('rundet auf ganze Zahlen', () => {
    render(<ConfidenceBadge confidence={0.876} />);
    expect(screen.getByText(/88%/)).toBeInTheDocument();
  });
});
