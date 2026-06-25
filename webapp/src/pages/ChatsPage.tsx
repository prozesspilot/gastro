/**
 * T073 — Staff-Chat-Übersicht (admin.prozesspilot.net/chats).
 *
 * Liste der Web-Chat-Sessions des aktiven Mandanten (T069-Endpoint
 * GET /api/v1/chat/sessions). Zeigt ungelesene Customer-Nachrichten als Badge.
 * Kein Mandant gewählt → NoTenantHint (wie die Belege-Seiten, A3-Reboot).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActiveTenantId } from '../api';
import { listChats, type StaffChatListItem } from '../api/chats';
import EmptyState from '../components/EmptyState';
import NoTenantHint from '../components/NoTenantHint';

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktiv',
  revoked: 'Widerrufen',
  closed: 'Geschlossen',
};

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; chats: StaffChatListItem[] }
  | { status: 'error'; message: string };

export default function ChatsPage() {
  const navigate = useNavigate();
  const hasTenant = getActiveTenantId() !== null;
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!hasTenant) return;
    let active = true;
    const load = () => {
      listChats()
        .then((chats) => {
          if (active) setState({ status: 'ready', chats });
        })
        .catch((err: unknown) => {
          if (active) {
            setState({
              status: 'error',
              message: err instanceof Error ? err.message : 'Unbekannter Fehler',
            });
          }
        });
    };
    load();
    const poll = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [hasTenant]);

  if (!hasTenant) return <NoTenantHint what="die Chats" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Chats</h1>
      </div>

      {state.status === 'loading' && <p style={{ color: 'var(--text-muted)' }}>Lädt…</p>}

      {state.status === 'error' && (
        <p style={{ color: 'var(--danger, #c0392b)' }}>
          Chats konnten nicht geladen werden: {state.message}
        </p>
      )}

      {state.status === 'ready' &&
        (state.chats.length === 0 ? (
          <EmptyState
            icon="💬"
            title="Noch keine Chats"
            description="Sobald ein Wirt über das Web-Chat-Widget schreibt oder einen Beleg schickt, erscheint der Chat hier."
          />
        ) : (
          <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {state.chats.map((chat) => (
              <li key={chat.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => navigate(`/chats/${chat.id}`)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <span aria-hidden style={{ fontSize: '1.2rem' }}>
                    💬
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>Chat {chat.id.slice(0, 8)}…</span>
                    <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {STATUS_LABEL[chat.status] ?? chat.status} · letzte Nachricht{' '}
                      {fmtTime(chat.last_message_at)}
                    </span>
                  </span>
                  {chat.unread_count > 0 && (
                    <span
                      className="badge pending"
                      aria-label={`${chat.unread_count} ungelesen`}
                      style={{ flex: 'none' }}
                    >
                      {chat.unread_count} neu
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
