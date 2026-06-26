/**
 * T075 — Bewertungs-Ansicht des Web-Chat-Widgets.
 *
 * Erscheint, sobald die Session beendet ist (status='closed'):
 *  - noch nicht bewertet (rating===null) → Sterne-Auswahl (1–5) + optionaler
 *    Kommentar + „Bewertung senden".
 *  - bereits bewertet → „Danke"-Ansicht mit gefüllten Sternen (read-only).
 *
 * Mobil-first: Tap-Targets ≥ 44 px.
 */
import { type CSSProperties, useState } from 'react';
import { type PublicChatSession, rateChat } from '../lib/api';

const MAX_STARS = 5;

const wrapStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  textAlign: 'center',
  padding: 'var(--space-6)',
  gap: 'var(--space-3)',
};

const starRowStyle: CSSProperties = {
  display: 'flex',
  gap: 4,
  justifyContent: 'center',
};

function starBtnStyle(active: boolean, interactive: boolean): CSSProperties {
  return {
    width: 48,
    height: 48,
    minWidth: 44,
    fontSize: '2rem',
    lineHeight: 1,
    border: 'none',
    background: 'transparent',
    cursor: interactive ? 'pointer' : 'default',
    color: active ? '#f5a623' : 'var(--border-subtle)',
    padding: 0,
  };
}

/** Sterne-Reihe. interactive=false → reine Anzeige. */
function Stars({
  value,
  onPick,
}: {
  value: number;
  onPick?: (n: number) => void;
}) {
  const interactive = typeof onPick === 'function';
  return (
    <div style={starRowStyle} role={interactive ? 'radiogroup' : undefined} aria-label="Bewertung">
      {Array.from({ length: MAX_STARS }, (_, i) => i + 1).map((n) => {
        const active = n <= value;
        const star = (
          <button
            key={n}
            type="button"
            aria-label={`${n} ${n === 1 ? 'Stern' : 'Sterne'}`}
            aria-checked={interactive ? n === value : undefined}
            role={interactive ? 'radio' : undefined}
            disabled={!interactive}
            onClick={interactive ? () => onPick?.(n) : undefined}
            style={starBtnStyle(active, interactive)}
          >
            {active ? '★' : '☆'}
          </button>
        );
        return star;
      })}
    </div>
  );
}

export function RatingView({
  token,
  session,
  onRated,
}: {
  token: string;
  session: PublicChatSession;
  onRated: (session: PublicChatSession) => void;
}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bereits bewertet → Danke-Ansicht (read-only).
  if (session.rating !== null) {
    return (
      <div style={wrapStyle}>
        <h2 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Danke für deine Bewertung!</h2>
        <Stars value={session.rating} />
        {session.rating_comment ? (
          <p
            style={{
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              maxWidth: 320,
              wordBreak: 'break-word',
            }}
          >
            „{session.rating_comment}"
          </p>
        ) : null}
        <p style={{ color: 'var(--text-muted)' }}>
          Dein Chat ist beendet. Bei Bedarf meldest du dich jederzeit wieder bei uns.
        </p>
      </div>
    );
  }

  const submit = async () => {
    if (stars < 1 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await rateChat(token, stars, comment);
      onRated(updated);
    } catch {
      setError('Bewertung konnte nicht gesendet werden. Bitte nochmal versuchen.');
      setBusy(false);
    }
  };

  return (
    <div style={wrapStyle}>
      <h2 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Chat beendet</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 320 }}>
        Wie zufrieden warst du mit unserem Service? Deine Bewertung hilft uns weiter.
      </p>

      <Stars value={stars} onPick={setStars} />

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        aria-label="Kommentar (optional)"
        placeholder="Magst du uns noch etwas mitteilen? (optional)"
        style={{
          width: '100%',
          maxWidth: 360,
          resize: 'none',
          padding: '11px 13px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          fontFamily: 'var(--font-ui, inherit)',
          fontSize: '1rem',
        }}
      />

      {error && <p style={{ color: 'var(--danger, #c0392b)' }}>{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || stars < 1}
        style={{
          minHeight: 44,
          padding: '0 22px',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: stars < 1 ? 'var(--border-subtle)' : 'var(--text-brand)',
          color: '#fff',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: busy || stars < 1 ? 'default' : 'pointer',
        }}
      >
        {busy ? 'Wird gesendet…' : 'Bewertung senden'}
      </button>
    </div>
  );
}
