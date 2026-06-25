/**
 * T071 — Web-Chat-Widget (chat.prozesspilot.net/{token}).
 *
 * Token aus dem URL-Pfad → Session laden → Vollbild-Chat (mobil-first). Kein Login,
 * kein Router. Marke durchgängig „ProzessPilot".
 */
import type { ReactNode } from 'react';
import { ChatWindow } from './components/ChatWindow';
import { useChatSession } from './hooks/useChatSession';

/**
 * Token = erstes Pfad-Segment (chat.prozesspilot.net/<token>). Unterstützt auch
 * die Pfad-Variante prozesspilot.net/c/<token>.
 */
export function getTokenFromPath(pathname: string): string | null {
  const segs = pathname.replace(/^\/+/, '').split('/');
  if (segs[0] === 'c') {
    return segs[1] ? decodeURIComponent(segs[1]) : null;
  }
  return segs[0] ? decodeURIComponent(segs[0]) : null;
}

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-page)',
      }}
    >
      <header
        style={{
          flex: 'none',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-card)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.05rem',
            color: 'var(--text-brand)',
          }}
        >
          ProzessPilot Chat
        </div>
      </header>
      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
      <footer
        style={{
          flex: 'none',
          textAlign: 'center',
          padding: '4px',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
        }}
      >
        Powered by ProzessPilot
      </footer>
    </div>
  );
}

function Centered({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-6)',
      }}
    >
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>{title}</h2>
      <p style={{ color: 'var(--text-muted)' }}>{body}</p>
    </div>
  );
}

export default function App({ initialToken }: { initialToken?: string | null } = {}) {
  const token =
    initialToken !== undefined
      ? initialToken
      : getTokenFromPath(typeof window !== 'undefined' ? window.location.pathname : '');
  const { state } = useChatSession(token);

  let content: ReactNode;
  if (state.status === 'loading') {
    content = <Centered title="Einen Moment…" body="Wir laden deinen Chat." />;
  } else if (state.status === 'error') {
    content =
      state.httpStatus === 410 ? (
        <Centered
          title="Chat nicht mehr aktiv"
          body="Dieser Chat-Link ist nicht mehr aktiv. Bitte fordere bei uns einen neuen an."
        />
      ) : state.httpStatus === 404 ? (
        <Centered
          title="Link ungültig"
          body="Dieser Chat-Link ist nicht (mehr) gültig. Bitte prüfe den Link aus deiner Nachricht."
        />
      ) : (
        <Centered title="Etwas ist schiefgelaufen" body={state.message} />
      );
  } else if (state.session.status !== 'active') {
    content = (
      <Centered
        title="Chat nicht mehr aktiv"
        body="Dieser Chat-Link ist nicht mehr aktiv. Bitte fordere bei uns einen neuen an."
      />
    );
  } else {
    // active → token ist hier garantiert non-null (state===ready ⇒ token war gesetzt).
    content = <ChatWindow token={token as string} />;
  }

  return <FullScreen>{content}</FullScreen>;
}
