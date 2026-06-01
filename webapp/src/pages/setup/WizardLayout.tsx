/**
 * T016 — Onboarding-Wizard Layout
 *
 * Spec: Onboarding_Wizard.md §7 (UI-Design-Prinzipien)
 *       - Mobile-First, große Buttons
 *       - Fortschritts-Balken oben (immer sichtbar)
 *       - Check-Häkchen für abgeschlossene Schritte
 */

import type { ReactNode } from 'react';

const STEPS = [
  { label: 'Account' },
  { label: 'Dein Betrieb' },
  { label: 'Kassensystem' },
];

interface WizardLayoutProps {
  currentStep: 1 | 2 | 3 | 'done';
  children: ReactNode;
}

export default function WizardLayout({ currentStep, children }: WizardLayoutProps) {
  const stepIndex = currentStep === 'done' ? 3 : currentStep - 1;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: '1.25rem 1.5rem',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface)',
      }}>
        <span style={{
          background: 'var(--grad-brand)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: 700,
          fontSize: '1.1rem',
        }}>
          ProzessPilot
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Setup-Assistent
        </span>
      </header>

      {/* Progress-Bar */}
      {currentStep !== 'done' && (
        <div
          role="navigation"
          aria-label="Wizard-Fortschritt"
          style={{
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            padding: '1rem 1.5rem',
          }}
        >
          {/* Text: Schritt X von Y */}
          <p style={{
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            marginBottom: '0.75rem',
            textAlign: 'center',
          }}>
            Schritt {currentStep} von {STEPS.length}
          </p>

          {/* Schritt-Punkte */}
          <ol style={{
            display: 'flex',
            alignItems: 'center',
            listStyle: 'none',
            gap: 0,
          }}>
            {STEPS.map((step, idx) => {
              const isCompleted = idx < stepIndex;
              const isActive = idx === stepIndex;
              return (
                <li
                  key={step.label}
                  aria-current={isActive ? 'step' : undefined}
                  style={{ display: 'flex', alignItems: 'center', flex: 1 }}
                >
                  {/* Connector line before (nicht beim ersten) */}
                  {idx > 0 && (
                    <div style={{
                      flex: 1,
                      height: '2px',
                      background: isCompleted || isActive
                        ? 'var(--blue)'
                        : 'var(--border-bright)',
                    }} />
                  )}

                  {/* Step circle */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                    <div style={{
                      width: '2rem',
                      height: '2rem',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      border: `2px solid ${isCompleted ? 'var(--teal)' : isActive ? 'var(--blue)' : 'var(--border-bright)'}`,
                      background: isCompleted ? 'rgba(45,212,191,0.15)' : isActive ? 'rgba(88,166,255,0.15)' : 'transparent',
                      color: isCompleted ? 'var(--teal)' : isActive ? 'var(--blue)' : 'var(--text-muted)',
                    }}>
                      {isCompleted ? '✓' : idx + 1}
                    </div>
                    <span style={{
                      fontSize: '0.7rem',
                      color: isActive ? 'var(--text)' : 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}>
                      {step.label}
                    </span>
                  </div>

                  {/* Connector line after (nicht beim letzten) */}
                  {idx < STEPS.length - 1 && (
                    <div style={{
                      flex: 1,
                      height: '2px',
                      background: idx < stepIndex
                        ? 'var(--blue)'
                        : 'var(--border-bright)',
                    }} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Content */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '2rem 1.5rem',
        maxWidth: '560px',
        margin: '0 auto',
        width: '100%',
      }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{
        textAlign: 'center',
        padding: '1rem',
        color: 'var(--text-subtle)',
        fontSize: '0.75rem',
        borderTop: '1px solid var(--border)',
      }}>
        Daten werden verschlüsselt in der EU gespeichert. &nbsp;
        <a href="/datenschutz" style={{ color: 'var(--text-muted)' }}>Datenschutz</a>
      </footer>
    </div>
  );
}
