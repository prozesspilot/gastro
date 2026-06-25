/**
 * T071 — Eine Chat-Nachricht als Bubble.
 *   customer (Wirt) → rechts, Marken-Hintergrund
 *   staff (ProzessPilot) → links, helle Karte
 *   system → mittig, dezent
 * Beleg-Nachrichten (beleg_id gesetzt, kein Text) zeigen einen Datei-Hinweis.
 */
import type { PublicChatMessage } from '../lib/api';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message }: { message: PublicChatMessage }) {
  const isCustomer = message.sender_type === 'customer';
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <div style={{ textAlign: 'center', margin: 'var(--space-2) 0' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            background: 'var(--surface-muted, rgba(0,0,0,0.04))',
            padding: '4px 10px',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {message.body ?? ''}
        </span>
      </div>
    );
  }

  const isBeleg = message.beleg_id !== null && (message.body === null || message.body === '');

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isCustomer ? 'flex-end' : 'flex-start',
        margin: 'var(--space-1) 0',
      }}
    >
      <div
        style={{
          maxWidth: '78%',
          padding: '9px 13px',
          borderRadius: 'var(--radius-lg)',
          borderBottomRightRadius: isCustomer ? '4px' : 'var(--radius-lg)',
          borderBottomLeftRadius: isCustomer ? 'var(--radius-lg)' : '4px',
          background: isCustomer ? 'var(--text-brand)' : 'var(--surface-card)',
          color: isCustomer ? '#fff' : 'var(--text-body)',
          border: isCustomer ? 'none' : '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.06))',
          wordBreak: 'break-word',
        }}
      >
        {isBeleg ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden>📎</span> Beleg gesendet
          </span>
        ) : (
          <span style={{ whiteSpace: 'pre-wrap' }}>{message.body}</span>
        )}
        <span
          style={{
            display: 'block',
            marginTop: 4,
            fontSize: '0.68rem',
            textAlign: 'right',
            opacity: 0.7,
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  );
}
