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

// ---------------------------------------------------------------------------
// Schritte 2/4/5/6 — Auswahl-/Config-Formulare (Spec §2.3–2.7). Strikt validiert,
// weil der complete-Handler die markierten Keys OHNE Enum-Prüfung in tenants
// promotet (asString()/Array-Filter) — die Strenge muss hier liegen, sonst landet
// Freitext in tenants.advisor_system / archive_provider / pos_system.
// ---------------------------------------------------------------------------

/** Steuerberater-System (Spec §2.3). SSoT für tenants.advisor_system. */
export const ADVISOR_SYSTEMS = [
  'lexware_office',
  'datev_online',
  'datev_csv',
  'sevdesk',
  'lexware_desktop',
  'stotax',
  'addison',
  'unbekannt',
] as const;

/** Eingangskanal (Spec §2.5). SSoT für tenants.input_channels. */
export const INPUT_CHANNELS = ['whatsapp', 'email'] as const;

/** Archiv-Provider (Spec §2.6). SSoT für tenants.archive_provider. */
export const ARCHIVE_PROVIDERS = ['google_drive', 'dropbox', 'pp_internal'] as const;

/** Kassensystem-Auswahl (Spec §2.7). */
export const POS_CHOICES = ['sumup', 'other_cloud', 'classic', 'skip'] as const;

/** SumUp-Variante. Nur die von pos.repository.ts unterstützten Werte. SSoT für tenants.pos_system. */
export const POS_SYSTEMS = ['sumup_lite', 'sumup_pos_pro'] as const;

// Schritt 2 — Steuerberater-Setup. Nur advisor_system wird promotet; die
// Kontaktfelder bleiben in step_data (Default T067: kein neues Spalten-Mapping).
export const step2SteuerberaterSchema = z
  .object({
    steuerberater_kanzlei: z.string().trim().min(2, 'Kanzlei-Name angeben.').max(200),
    ansprechpartner: z.string().trim().min(2, 'Ansprechpartner angeben.').max(200),
    steuerberater_email: z.string().trim().email('Gültige E-Mail angeben.').max(200),
    steuerberater_telefon: z.string().trim().max(40).optional().or(z.literal('')),
    advisor_system: z.enum(ADVISOR_SYSTEMS),
  })
  .strict();
export type Step2Steuerberater = z.infer<typeof step2SteuerberaterSchema>;

// Schritt 4 — Eingangskanal. input_channels (Array, min 1) → tenants.input_channels.
export const step4InputChannelSchema = z
  .object({
    input_channels: z
      .array(z.enum(INPUT_CHANNELS))
      .min(1, 'Mindestens einen Kanal wählen.')
      .max(INPUT_CHANNELS.length),
  })
  .strict();
export type Step4InputChannel = z.infer<typeof step4InputChannelSchema>;

// Schritt 5 — Archiv-Verbindung. archive_provider → tenants.archive_provider.
export const step5ArchiveSchema = z
  .object({
    archive_provider: z.enum(ARCHIVE_PROVIDERS),
  })
  .strict();
export type Step5Archive = z.infer<typeof step5ArchiveSchema>;

// Schritt 6 — Kassensystem. Nur pos_system (gesetzt wenn pos_choice='sumup')
// wird promotet. pos_connected spiegelt den OAuth-Rückkehr-Status (best-effort).
export const step6PosSchema = z
  .object({
    pos_choice: z.enum(POS_CHOICES),
    pos_system: z.enum(POS_SYSTEMS).optional(),
    pos_connected: z.boolean().optional(),
  })
  .strict();
export type Step6Pos = z.infer<typeof step6PosSchema>;
