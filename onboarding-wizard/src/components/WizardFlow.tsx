/**
 * T067 — Navigierbarer 7-Schritt-Flow. Besitzt den lokalen `viewStep` (welcher
 * Schritt angezeigt wird), rendert ProgressBar + die Schritt-Komponente + die
 * gemeinsame Navigation (Zurück / „Überspringen → Premium"). Jeder Schritt speichert
 * selbst (saveStep) und ruft onSaved → der Flow rückt vor.
 *
 * Vorrücken passiert über das lokale viewStep (nicht über session.current_step), damit
 * der Wirt nach „Zurück" frei zwischen bereits ausgefüllten Schritten navigieren kann.
 */
import { type ReactNode, useState } from 'react';
import { type PublicSession, requestPremium } from '../lib/api';
import { Step1Stammdaten } from '../steps/Step1Stammdaten';
import { Step2Steuerberater } from '../steps/Step2Steuerberater';
import { Step3OAuthAccountant } from '../steps/Step3OAuthAccountant';
import { Step4InputChannel } from '../steps/Step4InputChannel';
import { Step5Archive } from '../steps/Step5Archive';
import { Step6POSConnector } from '../steps/Step6POSConnector';
import { Step7Summary } from '../steps/Step7Summary';
import { ProgressBar } from './ProgressBar';

function clampStep(n: number): number {
  return Math.min(Math.max(n, 1), 7);
}

/** Beim Laden: Rückkehr vom SumUp-OAuth (?pos_connected=sumup) → direkt auf Schritt 6. */
function initialView(session: PublicSession): number {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pos_connected') === 'sumup') return 6;
  }
  return clampStep(session.current_step);
}

export function WizardFlow({
  token,
  session,
  onSaved,
}: {
  token: string;
  session: PublicSession;
  onSaved: (session: PublicSession) => void;
}) {
  const [viewStep, setViewStep] = useState(() => initialView(session));

  function handleSaved(updated: PublicSession) {
    onSaved(updated);
    setViewStep((s) => clampStep(s + 1));
  }
  function back() {
    setViewStep((s) => clampStep(s - 1));
  }
  async function skip() {
    // „Überspringen — wir machen es für dich" → Premium-Handoff. App zeigt danach
    // den Premium-Screen (session.status === 'premium_handoff').
    const updated = await requestPremium(token).catch(() => null);
    if (updated) onSaved(updated);
  }

  const data = (n: number) => session.step_data?.[String(n)] as Record<string, unknown> | undefined;
  const advisorSystem = typeof data(2)?.advisor_system === 'string' ? (data(2)?.advisor_system as string) : '';

  let stepEl: ReactNode;
  switch (viewStep) {
    case 1:
      stepEl = <Step1Stammdaten token={token} initialData={data(1)} onSaved={handleSaved} />;
      break;
    case 2:
      stepEl = <Step2Steuerberater token={token} initialData={data(2)} onSaved={handleSaved} />;
      break;
    case 3:
      stepEl = (
        <Step3OAuthAccountant
          token={token}
          initialData={data(3)}
          onSaved={handleSaved}
          advisorSystem={advisorSystem}
        />
      );
      break;
    case 4:
      stepEl = <Step4InputChannel token={token} initialData={data(4)} onSaved={handleSaved} />;
      break;
    case 5:
      stepEl = <Step5Archive token={token} initialData={data(5)} onSaved={handleSaved} />;
      break;
    case 6:
      stepEl = <Step6POSConnector token={token} initialData={data(6)} onSaved={handleSaved} />;
      break;
    default:
      stepEl = (
        <Step7Summary
          token={token}
          initialData={data(7)}
          onSaved={handleSaved}
          stepData={session.step_data ?? {}}
        />
      );
  }

  return (
    <>
      <ProgressBar current={viewStep} />
      {stepEl}
      {viewStep > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-5)',
          }}
        >
          <button type="button" className="ghost" onClick={back} style={{ fontSize: '.8125rem' }}>
            ← Zurück
          </button>
          <button
            type="button"
            className="ghost"
            onClick={skip}
            style={{ fontSize: '.8125rem', color: 'var(--text-muted)' }}
          >
            Überspringen — wir machen es für dich
          </button>
        </div>
      )}
    </>
  );
}
