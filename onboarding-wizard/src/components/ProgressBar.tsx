/**
 * T016 — Fortschritts-Anzeige „Schritt X von 7" (Spec §2.1, §7.3).
 */
const TOTAL_STEPS = 7;

export function ProgressBar({ current }: { current: number }) {
  const clamped = Math.min(Math.max(current, 1), TOTAL_STEPS);
  const pct = Math.round((clamped / TOTAL_STEPS) * 100);
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '.75rem',
          fontWeight: 600,
          color: 'var(--text-body)',
          marginBottom: 'var(--space-2)',
        }}
      >
        <span>
          Schritt {clamped} von {TOTAL_STEPS}
        </span>
        <span>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        style={{
          height: 8,
          background: 'var(--surface-sunken)',
          borderRadius: 'var(--radius-pill)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--grad-brand)',
            transition: 'var(--transition)',
          }}
        />
      </div>
    </div>
  );
}
