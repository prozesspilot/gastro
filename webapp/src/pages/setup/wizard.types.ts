/**
 * T016 — Onboarding-Wizard Typen
 *
 * Spec: Onboarding_Wizard.md §2 (Wizard-Schritte)
 */

// ── Step 1: Account ────────────────────────────────────────────────────────────

export interface Step1Data {
  email: string;
  password: string;
  passwordConfirm: string;
  /** TOTP-Secret (base32) — erzeugt vom Backend, QR-Code wird daraus generiert */
  totpSecret: string;
  /** Vom Nutzer eingegebener TOTP-Code zur Bestätigung */
  totpConfirm: string;
}

// ── Step 2: Stammdaten ─────────────────────────────────────────────────────────

export type Rechtsform =
  | 'einzelunternehmen'
  | 'gbr'
  | 'ug'
  | 'gmbh'
  | 'gmbh_co_kg'
  | 'sonstige';

export type Branche =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'imbiss'
  | 'foodtruck'
  | 'catering'
  | 'sonstige_gastro';

export interface Step2Data {
  firmenname: string;
  rechtsform: Rechtsform;
  inhaber: string;
  strasse: string;
  plz: string;
  stadt: string;
  ustId: string;          // optional
  steuernummer: string;
  telefon: string;
  email: string;          // Kontakt-Mail (kann von Account-Mail abweichen)
  branche: Branche;
  mitarbeiterAnzahl: number;
}

// ── Step 3: Kassensystem ───────────────────────────────────────────────────────

export interface Step3Data {
  /** 'connected' = OAuth abgeschlossen, 'skipped' = übersprungen */
  sumupStatus: 'pending' | 'connected' | 'skipped';
}

// ── Gesamter Wizard-State ──────────────────────────────────────────────────────

export interface WizardState {
  currentStep: 1 | 2 | 3 | 'done';
  step1: Partial<Step1Data>;
  step2: Partial<Step2Data>;
  step3: Partial<Step3Data>;
}

export const INITIAL_WIZARD_STATE: WizardState = {
  currentStep: 1,
  step1: {},
  step2: {},
  step3: { sumupStatus: 'pending' },
};
