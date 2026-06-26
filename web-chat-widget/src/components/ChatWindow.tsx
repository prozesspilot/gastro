/**
 * T071 — Haupt-Chat-Oberfläche des Web-Chat-Widgets.
 *
 * - Lädt den Verlauf (GET /messages) und pollt ihn alle 10 s (Fallback).
 * - Live-Updates via SSE (`chat.message`), sofern EventSource verfügbar ist
 *   (jsdom/Tests haben keins → dann reicht Polling).
 * - Senden von Text + Hochladen eines Belegs (Foto/PDF) — beide erscheinen als Bubble.
 * - Mobil-first: Vollhöhe, Tap-Targets ≥ 44 px.
 */
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import {
  chatEventsUrl,
  closeChat,
  listMessages,
  type PublicChatMessage,
  type PublicChatSession,
  sendMessage,
  uploadBeleg,
} from '../lib/api';
import { MessageBubble } from './MessageBubble';

const POLL_INTERVAL_MS = 10_000;

const iconBtnStyle: CSSProperties = {
  flex: 'none',
  width: 44,
  height: 44,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-card)',
  fontSize: '1.2rem',
  cursor: 'pointer',
};

const sendBtnStyle: CSSProperties = {
  flex: 'none',
  width: 44,
  height: 44,
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--text-brand)',
  color: '#fff',
  fontSize: '1.1rem',
  cursor: 'pointer',
};

const textareaStyle: CSSProperties = {
  flex: 1,
  minHeight: 44,
  maxHeight: 120,
  resize: 'none',
  padding: '11px 13px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-subtle)',
  fontFamily: 'var(--font-ui, inherit)',
  fontSize: '1rem',
};

export function ChatWindow({
  token,
  onClosed,
}: {
  token: string;
  onClosed: (session: PublicChatSession) => void;
}) {
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Zwei-Schritt-Beenden (kein window.confirm): erst „Chat beenden", dann bestätigen.
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(async () => {
    if (closing) return;
    setClosing(true);
    setNotice(null);
    try {
      onClosed(await closeChat(token));
    } catch {
      setNotice('Chat konnte nicht beendet werden. Bitte nochmal versuchen.');
      setClosing(false);
      setConfirmClose(false);
    }
  }, [closing, token, onClosed]);

  /**
   * Fügt neue Nachrichten hinzu (dedupe nach id, chronologisch sortiert).
   * Hinweis: Der SSE-Kanal ist im Pilot tenant-scoped (genau 1 aktive Session pro
   * Tenant, Migration 124) → keine session_id-Filterung nötig. Vor Multi-Session-
   * pro-Tenant hier `m.session_id === ownSessionId` ergänzen (vgl. Backend-TODO in
   * chat-events.handler.ts).
   */
  const mergeMessages = useCallback((incoming: PublicChatMessage[]) => {
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const added = incoming.filter((m) => !seen.has(m.id));
      if (added.length === 0) return prev;
      return [...prev, ...added].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    });
  }, []);

  // Initial-Verlauf + Polling-Fallback.
  useEffect(() => {
    let active = true;
    const load = () => {
      listMessages(token)
        .then((msgs) => {
          if (active) mergeMessages(msgs);
        })
        .catch(() => {
          /* still — der nächste Poll/SSE versucht es erneut */
        });
    };
    load();
    const poll = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [token, mergeMessages]);

  // Live-Updates via SSE (sofern verfügbar).
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource(chatEventsUrl(token));
    const onMsg = (ev: MessageEvent) => {
      try {
        mergeMessages([JSON.parse(ev.data) as PublicChatMessage]);
      } catch {
        /* fehlerhaftes Event ignorieren */
      }
    };
    es.addEventListener('chat.message', onMsg as EventListener);
    return () => {
      es.removeEventListener('chat.message', onMsg as EventListener);
      es.close();
    };
  }, [token, mergeMessages]);

  // Auto-Scroll ans Ende bei neuen Nachrichten.
  // biome-ignore lint/correctness/useExhaustiveDependencies: bewusst bei jeder Nachrichten-Änderung.
  useEffect(() => {
    // scrollIntoView fehlt in jsdom (Tests) → optionaler Aufruf.
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      mergeMessages([await sendMessage(token, t)]);
      setText('');
    } catch {
      setNotice('Nachricht konnte nicht gesendet werden. Bitte nochmal versuchen.');
    } finally {
      setBusy(false);
    }
  }, [text, busy, token, mergeMessages]);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setNotice('Beleg wird hochgeladen…');
      try {
        const res = await uploadBeleg(token, file);
        mergeMessages([res.message]);
        setNotice('Beleg erhalten — wir kümmern uns darum. ✅');
      } catch {
        setNotice('Beleg konnte nicht hochgeladen werden. Erlaubt: Foto oder PDF.');
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [token, mergeMessages],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          flex: 'none',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
          padding: '4px var(--space-2)',
          borderBottom: '1px solid var(--border-subtle)',
          minHeight: 36,
        }}
      >
        {confirmClose ? (
          <>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: 'auto' }}>
              Chat wirklich beenden?
            </span>
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              style={{
                minHeight: 32,
                padding: '0 12px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--danger, #c0392b)',
                color: '#fff',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {closing ? 'Beende…' : 'Ja, beenden'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
              disabled={closing}
              style={{
                minHeight: 32,
                padding: '0 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-card)',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Abbrechen
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClose(true)}
            style={{
              minHeight: 32,
              padding: '0 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-card)',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Chat beenden
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        {messages.length === 0 ? (
          <p
            style={{
              color: 'var(--text-muted)',
              textAlign: 'center',
              marginTop: 'var(--space-6)',
              padding: '0 var(--space-4)',
            }}
          >
            Schick uns hier deine Belege (einfach abfotografieren) oder stell uns eine Frage. Wir
            antworten meist innerhalb weniger Stunden.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={endRef} />
      </div>

      {notice && (
        <div
          style={{
            padding: '6px var(--space-3)',
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          {notice}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
          padding: 'var(--space-2)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        {/* Verstecktes Input — bedient wird der Button daneben (gleiches Label dort).
            Bewusst KEIN `capture` — der Wirt soll auch ein bereits gespeichertes Foto/PDF
            aus der Galerie wählen können (capture würde auf manchen Mobile-Browsern direkt
            in die Kamera zwingen). `accept` schlägt die Kamera ohnehin als Option vor. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          tabIndex={-1}
          aria-hidden="true"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <button
          type="button"
          aria-label="Beleg hochladen"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          style={iconBtnStyle}
        >
          📎
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="Nachricht schreiben…"
          aria-label="Nachricht"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          style={textareaStyle}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={busy || text.trim() === ''}
          aria-label="Senden"
          style={sendBtnStyle}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
