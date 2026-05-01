import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        gap: 24,
        padding: '40px 20px',
      }}
    >
      <div style={{ fontSize: 80, lineHeight: 1 }} aria-hidden="true">
        404
      </div>
      <div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '-0.8px',
            marginBottom: 8,
          }}
        >
          Seite nicht gefunden
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, maxWidth: 400 }}>
          Die angeforderte Seite existiert nicht oder wurde verschoben.
          Kehre zum Dashboard zuruck, um weiterzuarbeiten.
        </p>
      </div>

      <Link to="/">
        <button
          type="button"
          className="primary"
          style={{ fontSize: 15, padding: '12px 28px', fontWeight: 600 }}
        >
          Zum Dashboard
        </button>
      </Link>

      <p style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
        Falls du einen fehlerhaften Link gefunden hast, melde ihn bitte dem Support.
      </p>
    </div>
  );
}
