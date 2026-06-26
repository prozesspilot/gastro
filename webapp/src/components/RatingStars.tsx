/**
 * T075 — Read-only-Sterne-Anzeige (1–5) für die Staff-Chat-Views.
 * Reine Anzeige der kundenseitigen Bewertung; keine Interaktion.
 */
export default function RatingStars({
  value,
  size = '1rem',
}: {
  value: number;
  size?: string;
}) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span
      aria-label={`Bewertung: ${v} von 5 Sternen`}
      title={`${v}/5`}
      style={{ color: '#f5a623', fontSize: size, letterSpacing: 1, whiteSpace: 'nowrap' }}
    >
      {'★'.repeat(v)}
      <span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - v)}</span>
    </span>
  );
}
