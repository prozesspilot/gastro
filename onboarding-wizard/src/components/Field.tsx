/**
 * T067 — Geteilte Feld-Komponente für alle Wizard-Schritte (extrahiert aus
 * Step1Stammdaten). Label + Child-Input + optionaler Hint/Fehler. Design-System-Tokens.
 */
import { type ReactNode } from 'react';

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field" style={{ marginBottom: 'var(--space-4)' }}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && (
        <span style={{ fontSize: '.75rem', color: 'var(--text-subtle)' }}>{hint}</span>
      )}
      {error && (
        <span role="alert" style={{ fontSize: '.75rem', color: 'var(--status-error-fg)' }}>
          {error}
        </span>
      )}
    </div>
  );
}
