/**
 * T016 — Onboarding-Wizard Haupt-Page
 *
 * Spec: Onboarding_Wizard.md §2 (Wizard-Schritte), §7 (UI-Design)
 *       T016-Task: Steps 1-3 Skeleton, Route-Sequenz
 *
 * DECISION: Sub-Route innerhalb der bestehenden Webapp statt separates Vite-Projekt.
 * Begründung: bestehende Build-Pipeline, TypeScript-Config und CSS-Variablen
 * werden wiederverwendet. Kein extra Build-Setup nötig. Der Wizard ist eine
 * öffentlich zugängliche Route (/setup/*), kein Login erforderlich.
 *
 * Route-Sequenz:
 *   /setup/          → Step 1 (Account)
 *   /setup/step-2    → Step 2 (Stammdaten)
 *   /setup/step-3    → Step 3 (Kassensystem)
 *   /setup/done      → Abschluss
 *
 * State-Persistenz: localStorage via WizardStore (TOTP-Secret wird nicht gespeichert).
 */

import { useNavigate, useLocation } from 'react-router-dom';
import WizardLayout from './WizardLayout';
import Step1Account from './Step1Account';
import Step2Stammdaten from './Step2Stammdaten';
import Step3Kasse from './Step3Kasse';
import DonePage from './DonePage';
import { useWizardState } from './useWizardState';
import { wizardStore } from './WizardStore';
import type { Step1Data, Step2Data, Step3Data } from './wizard.types';

// ── Route → Schritt-Mapping ────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 'done';

function routeToStep(pathname: string): WizardStep {
  if (pathname.endsWith('/done')) return 'done';
  if (pathname.endsWith('/step-3')) return 3;
  if (pathname.endsWith('/step-2')) return 2;
  return 1;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingWizardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state] = useWizardState();

  const currentStep = routeToStep(location.pathname);

  // ── Handler: Step 1 abgeschlossen ─────────────────────────────────────────

  function handleStep1Complete(data: Step1Data) {
    wizardStore.update({ step1: data, currentStep: 2 });
    navigate('/setup/step-2');
  }

  // ── Handler: Step 2 abgeschlossen ─────────────────────────────────────────

  function handleStep2Complete(data: Step2Data) {
    wizardStore.update({ step2: data, currentStep: 3 });
    navigate('/setup/step-3');
  }

  // ── Handler: Step 3 abgeschlossen / übersprungen ───────────────────────────

  function handleStep3Complete(data: Step3Data) {
    wizardStore.update({ step3: data, currentStep: 'done' });
    navigate('/setup/done');
  }

  function handleStep3Skip() {
    wizardStore.update({ step3: { sumupStatus: 'skipped' }, currentStep: 'done' });
    navigate('/setup/done');
  }

  // ── Handler: Zurück-Navigation ─────────────────────────────────────────────

  function handleBackToStep1() {
    wizardStore.update({ currentStep: 1 });
    navigate('/setup');
  }

  function handleBackToStep2() {
    wizardStore.update({ currentStep: 2 });
    navigate('/setup/step-2');
  }

  // ── Handler: Neu starten (Dev-Helfer) ─────────────────────────────────────

  function handleRestart() {
    wizardStore.reset();
    navigate('/setup');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <WizardLayout currentStep={currentStep}>
      {currentStep === 1 && (
        <Step1Account
          initialData={state.step1}
          onComplete={handleStep1Complete}
        />
      )}
      {currentStep === 2 && (
        <Step2Stammdaten
          initialData={state.step2}
          onComplete={handleStep2Complete}
          onBack={handleBackToStep1}
        />
      )}
      {currentStep === 3 && (
        <Step3Kasse
          initialData={state.step3}
          onComplete={handleStep3Complete}
          onSkip={handleStep3Skip}
          onBack={handleBackToStep2}
        />
      )}
      {currentStep === 'done' && (
        <DonePage
          wizardState={state}
          // Dev-Helper nur im Dev-Mode anzeigen
          onRestart={import.meta.env.DEV ? handleRestart : undefined}
        />
      )}
    </WizardLayout>
  );
}
