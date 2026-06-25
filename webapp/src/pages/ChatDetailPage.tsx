/**
 * T073 — Staff-Chat-Thread (admin.prozesspilot.net/chats/:id).
 *
 * Verlauf einer Web-Chat-Session (T069: GET /chat/sessions/:id/messages markiert
 * Customer-Nachrichten gelesen) + Antworten (POST /chat/sessions/:id/reply).
 * Beleg-Nachrichten verlinken in die Belege-Detailseite. Live via Polling (10 s).
 */
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getActiveTenantId } from '../api';
import { ApiError } from '../api/_client';
import { type ChatMessage, getChatMessages, sendStaffReply } from '../api/chats';
import NoTenantHint from '../components/NoTenantHint';
import { useToast } from '../components/ToastProvider';

const SENDER_LABEL: Record<string, string> = {
  customer: 'Wirt',
  staff: 'ProzessPilot',
  system: 'System',
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

const sendBtn: CSSProperties = {
  flex: 'none',
  padding: '0 18px',
  height: 44,
  borderRadius: 8,
  border: 'none',
  background: 'var(--text-brand, #0A95E0)',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

export default function ChatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const hasTenant = getActiveTenantId() !== null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const merge = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const added = incoming.filter((m) => !seen.has(m.id));
      if (added.length === 0) return prev;
      return [...prev, ...added].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    });
  }, []);

  useEffect(() => {
    if (!hasTenant || !id) return;
    let active = true;
    const load = () => {
      getChatMessages(id)
        .then((msgs) => {
          if (active) {
            merge(msgs);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    };
    load();
    const poll = setInterval(load, 10_000);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [hasTenant, id, merge]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: bei jeder Nachrichten-Änderung scrollen.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const t = text.trim();
    if (!t || busy || !id) return;
    setBusy(true);
    try {
      merge([await sendStaffReply(id, t)]);
      setText('');
    } catch (err: unknown) {
      // 409 = Session nicht mehr aktiv → freundlicher, handlungsleitender Hinweis
      // statt des technischen Backend-Strings.
      const msg =
        err instanceof ApiError && err.status === 409
          ? 'Diese Chat-Session ist nicht mehr aktiv — bitte einen neuen Chat-Link erzeugen.'
          : err instanceof Error
            ? err.message
            : 'Antwort konnte nicht gesendet werden.';
      toast('error', msg);
    } finally {
      setBusy(false);
    }
  }, [text, busy, id, merge, toast]);

  if (!hasTenant) return <NoTenantHint what="den Chat" />;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => navigate('/chats')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          ← Zurück
        </button>
        <h1 className="page-title">Chat {id?.slice(0, 8)}…</h1>
      </div>

      <div
        className="card"
        style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Lädt…</p>
        ) : messages.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Noch keine Nachrichten in diesem Chat.</p>
        ) : (
          messages.map((m) => <MessageRow key={m.id} m={m} />)
        )}
        <div ref={endRef} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          aria-label="Antwort"
          placeholder="Antwort an den Wirt… (Strg/Cmd+Enter sendet)"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSend();
            }
          }}
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 160,
            resize: 'vertical',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            fontFamily: 'inherit',
            fontSize: '1rem',
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={busy || text.trim() === ''}
          style={sendBtn}
        >
          Senden
        </button>
      </div>
    </div>
  );
}

function MessageRow({ m }: { m: ChatMessage }) {
  const isStaff = m.sender_type === 'staff';
  // Beleg-Link IMMER zeigen, sobald beleg_id gesetzt ist; ein optionaler Body
  // (z. B. spätere Bildunterschrift) wird zusätzlich darunter gerendert.
  const hasBeleg = m.beleg_id !== null;
  const hasBody = m.body !== null && m.body !== '';
  return (
    <div style={{ display: 'flex', justifyContent: isStaff ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '75%',
          padding: '8px 12px',
          borderRadius: 10,
          background: isStaff ? 'var(--text-brand, #0A95E0)' : 'var(--surface-sunken, #f3f4f6)',
          color: isStaff ? '#fff' : 'var(--text)',
          border: isStaff ? 'none' : '1px solid var(--border)',
          wordBreak: 'break-word',
        }}
      >
        <div style={{ fontSize: '0.7rem', opacity: 0.75, marginBottom: 2 }}>
          {SENDER_LABEL[m.sender_type] ?? m.sender_type} · {fmtTime(m.created_at)}
        </div>
        {hasBeleg && (
          <Link
            to={`/belege/${m.beleg_id}`}
            style={{ color: isStaff ? '#fff' : 'inherit', display: 'block' }}
          >
            📎 Beleg ansehen
          </Link>
        )}
        {hasBody && (
          <span style={{ whiteSpace: 'pre-wrap', display: 'block', marginTop: hasBeleg ? 4 : 0 }}>
            {m.body}
          </span>
        )}
      </div>
    </div>
  );
}
