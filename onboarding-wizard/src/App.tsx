/**
 * T016 — Onboarding-Wizard (setup.prozesspilot.net/{token}).
 *
 * Single-Page-Flow: Token aus dem URL-Pfad → Session laden → aktuellen Schritt
 * rendern. In diesem PR ist nur Schritt 1 (Stammdaten) als Formular gebaut; die
 * Schritte 2–7 zeigen einen Platzhalter (Folge-PRs). Kein Login, kein Router.
 */
import { type ReactNode } from 'react';
import { WizardFlow } from './components/WizardFlow';
import { useWizardSession } from './hooks/useWizardSession';

/** Token = erstes Pfad-Segment (setup.prozesspilot.net/<token>). */
export function getTokenFromPath(pathname: string): string | null {
  const seg = pathname.replace(/^\/+/, '').split('/')[0];
  return seg ? decodeURIComponent(seg) : null;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--surface-page)',
        display: 'flex',
        justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
    >
      <main
        style={{
          width: '100%',
          maxWidth: 560,
          marginTop: 'var(--space-8)',
        }}
      >
        <header style={{ marginBottom: 'var(--space-6)', textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '1.25rem',
              color: 'var(--text-brand)',
            }}
          >
            ProzessPilot
          </div>
        </header>
        <div
          style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            padding: 'var(--space-6)',
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

function Centered({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
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
  const { state, setSession } = useWizardSession(token);

  let content: ReactNode;

  if (state.status === 'loading') {
    content = <Centered title="Einen Moment…" body="Wir laden dein Setup." />;
  } else if (state.status === 'error') {
    content =
      state.httpStatus === 410 ? (
        <Centered title="Link abgelaufen" body="Dieser Setup-Link ist abgelaufen. Bitte fordere bei uns einen neuen an." />
      ) : state.httpStatus === 404 ? (
        <Centered title="Link ungültig" body="Dieser Setup-Link ist nicht (mehr) gültig. Bitte prüfe den Link aus deiner E-Mail." />
      ) : (
        <Centered title="Etwas ist schiefgelaufen" body={state.message} />
      );
  } else {
    const session = state.session;
    if (session.status === 'completed') {
      content = (
        <Centered
          title="Setup abgeschlossen! ✅"
          body="Wir prüfen dein Setup und melden uns innerhalb von 24 Stunden. Danach kannst du loslegen."
        />
      );
    } else if (session.status === 'premium_handoff') {
      content = (
        <Centered
          title="Wir übernehmen das für dich"
          body="Ein Mitarbeiter aus dem ProzessPilot-Team meldet sich und schließt dein Setup ab."
        />
      );
    } else {
      // status === 'started' → navigierbarer 7-Schritt-Flow (T067).
      // token ist hier garantiert non-null: state===ready ⇒ token war gesetzt.
      content = <WizardFlow token={token as string} session={session} onSaved={setSession} />;
    }
  }

  return <Shell>{content}</Shell>;
}
