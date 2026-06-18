/**
 * T016/Phase B — Onboarding-Wizard: Typen + Validierungs-Schemas.
 *
 * Spec: Modulkonzept/Konzeptentwicklung/Onboarding_Wizard.md §2, §5.
 *
 * Konvention: DB-Spalten + Wire-JSON = snake_case; interne TS-Funktionsparameter
 * = camelCase (siehe beleg.repository.ts).
 */
import { z } from 'zod';

/** Status-FSM der onboarding_sessions (Migration 122). */
export type OnboardingSessionStatus = 'started' | 'completed' | 'abandoned' | 'premium_handoff';

/** Eine Wizard-Session, wie sie aus der DB kommt (snake_case). */
export interface DbOnboardingSession {
  id: string;
  tenant_id: string;
  token: string;
  status: OnboardingSessionStatus;
  current_step: number;
  step_data: Record<string, unknown>;
  premium_setup_requested: boolean;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  last_activity_at: string;
}

/**
 * Öffentliches Session-DTO für den Wizard (Wirt). Der `token` wird NICHT
 * zurückgespiegelt — der Client hat ihn bereits aus der URL; nicht erneut
 * über Response-Bodies streuen.
 */
export interface PublicOnboardingSession {
  status: OnboardingSessionStatus;
  current_step: number;
  step_data: Record<string, unknown>;
  premium_setup_requested: boolean;
  expires_at: string;
}

export function toPublicSession(s: DbOnboardingSession): PublicOnboardingSession {
  return {
    status: s.status,
    current_step: s.current_step,
    step_data: s.step_data ?? {},
    premium_setup_requested: s.premium_setup_requested,
    expires_at: s.expires_at,
  };
}

// ---------------------------------------------------------------------------
// Schritt 1 — Stammdaten (Spec §2.2). Der voll spezifizierte, von ungebauten
// Modulen unabhängige Schritt → wird server- UND clientseitig strikt validiert.
// ---------------------------------------------------------------------------
export const RECHTSFORMEN = [
  'einzelunternehmen',
  'gbr',
  'ug',
  'gmbh',
  'gmbh_co_kg',
  'sonstige',
] as const;

export const BRANCHEN = [
  'restaurant',
  'cafe',
  'bar',
  'imbiss',
  'foodtruck',
  'catering',
  'sonstige_gastro',
] as const;

export const step1StammdatenSchema = z
  .object({
    firmenname: z.string().trim().min(3, 'Firmenname braucht mindestens 3 Zeichen.').max(200),
    rechtsform: z.enum(RECHTSFORMEN),
    inhaber: z.string().trim().min(2, 'Inhaber/Geschäftsführer angeben.').max(200),
    strasse: z.string().trim().min(2).max(200),
    plz: z
      .string()
      .trim()
      .regex(/^\d{5}$/, 'PLZ muss 5 Ziffern sein.'),
    stadt: z.string().trim().min(2).max(120),
    // USt-ID ist nicht bei jedem vorhanden → optional, aber wenn gesetzt Format DE + 9 Ziffern.
    ust_id: z
      .string()
      .trim()
      .regex(/^DE\d{9}$/, 'USt-ID-Format: DE + 9 Ziffern (z.B. DE123456789).')
      .optional()
      .or(z.literal('')),
    // Deutsche Steuernummer: bewusst lockere Prüfung (Format variiert je Bundesland).
    steuernummer: z
      .string()
      .trim()
      .regex(/^[0-9/ ]{8,20}$/, 'Steuernummer-Format prüfen (z.B. 11/123/45678).'),
    telefon: z.string().trim().min(5, 'Telefonnummer angeben.').max(40),
    email: z.string().trim().email('Gültige E-Mail-Adresse angeben.').max(200),
    branche: z.enum(BRANCHEN),
    mitarbeiter_anzahl: z.number().int().min(1).max(50),
    belegvolumen_monat: z.number().int().min(0).max(800),
    steuerberater_kosten_monat: z.number().nonnegative().max(100000).optional(),
  })
  .strict();

export type Step1Stammdaten = z.infer<typeof step1StammdatenSchema>;
