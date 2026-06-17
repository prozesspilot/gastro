interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

/**
 * Wiederverwendbare Empty-State-Komponente fuer leere Listen.
 * Nutze in ReceiptsPage, CommunicationsPage, PluginsPage bei leerer Liste.
 */
export default function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        gap: 16,
      }}
      role="status"
      aria-label={title}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
        }}
        aria-hidden="true"
      >
        {icon}
      </div>

      <div style={{ maxWidth: 360 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text)',
            marginBottom: description ? 6 : 0,
          }}
        >
          {title}
        </div>
        {description && (
          <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {description}
          </div>
        )}
      </div>

      {action && (
        <button
          type="button"
          className="primary"
          onClick={action.onClick}
          style={{ fontSize: 14, padding: '8px 20px' }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
