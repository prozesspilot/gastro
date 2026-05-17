interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen, title, message,
  confirmLabel = 'Bestätigen',
  cancelLabel  = 'Abbrechen',
  danger = false,
  onConfirm, onCancel,
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2 id="confirm-title" style={{ fontSize: 18, fontWeight: 700 }}>{title}</h2>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="ghost" onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            style={{ marginLeft: 'auto' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
