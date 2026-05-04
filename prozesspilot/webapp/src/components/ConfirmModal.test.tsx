/**
 * Tests für ConfirmModal-Komponente
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmModal from './ConfirmModal';

const defaultProps = {
  isOpen: true,
  title: 'Wirklich löschen?',
  message: 'Diese Aktion kann nicht rückgängig gemacht werden.',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ConfirmModal', () => {
  it('rendert nicht wenn isOpen=false', () => {
    render(<ConfirmModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('rendert wenn isOpen=true', () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('zeigt Title und Message', () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByText('Wirklich löschen?')).toBeInTheDocument();
    expect(screen.getByText('Diese Aktion kann nicht rückgängig gemacht werden.')).toBeInTheDocument();
  });

  it('ruft onConfirm auf bei Klick auf Bestätigen', () => {
    const onConfirm = vi.fn();
    render(<ConfirmModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Bestätigen'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('ruft onCancel auf bei Klick auf Abbrechen', () => {
    const onCancel = vi.fn();
    render(<ConfirmModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Abbrechen'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('nutzt custom Labels', () => {
    render(
      <ConfirmModal
        {...defaultProps}
        confirmLabel="Ja, löschen"
        cancelLabel="Nein, behalten"
      />,
    );
    expect(screen.getByText('Ja, löschen')).toBeInTheDocument();
    expect(screen.getByText('Nein, behalten')).toBeInTheDocument();
  });

  it('Confirm-Button hat danger-Klasse wenn danger=true', () => {
    render(<ConfirmModal {...defaultProps} danger={true} />);
    const confirmBtn = screen.getByText('Bestätigen');
    expect(confirmBtn.className).toContain('danger');
  });

  it('Confirm-Button hat primary-Klasse wenn danger=false (default)', () => {
    render(<ConfirmModal {...defaultProps} danger={false} />);
    const confirmBtn = screen.getByText('Bestätigen');
    expect(confirmBtn.className).toContain('primary');
  });

  it('hat aria-modal und aria-labelledby', () => {
    render(<ConfirmModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-title');
  });
});
