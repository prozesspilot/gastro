/**
 * T016 — Onboarding-Wizard Step 2: Betriebsstammdaten
 *
 * Spec: Onboarding_Wizard.md §2.2 (Schritt 1 — Stammdaten)
 *
 * Abgefragt: Firmenname, Rechtsform, Inhaber, Adresse, USt-ID (optional),
 * Steuernummer, Telefon, E-Mail, Branche, Mitarbeiter-Anzahl.
 */

import { useState, type FormEvent } from 'react';
import type { Step2Data, Rechtsform, Branche } from './wizard.types';

// ── Validation ─────────────────────────────────────────────────────────────────

function validateStep2(data: Partial<Step2Data>): string | null {
  if (!data.firmenname || data.firmenname.trim().length < 3) {
    return 'Firmenname muss mindestens 3 Zeichen haben.';
  }
  if (!data.rechtsform) return 'Bitte Rechtsform wählen.';
  if (!data.inhaber || data.inhaber.trim().length < 2) {
    return 'Bitte Inhaber / Geschäftsführer angeben.';
  }
  if (!data.strasse) return 'Bitte Straße eingeben.';
  if (!data.plz || !/^\d{5}$/.test(data.plz)) {
    return 'Bitte gültige 5-stellige PLZ eingeben.';
  }
  if (!data.stadt) return 'Bitte Stadt eingeben.';
  if (!data.steuernummer || data.steuernummer.trim().length < 10) {
    return 'Bitte Steuernummer eingeben (steht auf jedem Finanzamt-Schreiben).';
  }
  if (!data.telefon || data.telefon.trim().length < 6) {
    return 'Bitte Telefonnummer eingeben.';
  }
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return 'Bitte gültige E-Mail-Adresse eingeben.';
  }
  if (!data.branche) return 'Bitte Branche wählen.';
  if (!data.mitarbeiterAnzahl || data.mitarbeiterAnzahl < 1) {
    return 'Bitte Mitarbeiteranzahl angeben.';
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Step2StammdatenProps {
  initialData: Partial<Step2Data>;
  onComplete: (data: Step2Data) => void;
  onBack: () => void;
}

export default function Step2Stammdaten({ initialData, onComplete, onBack }: Step2StammdatenProps) {
  const [firmenname, setFirmenname] = useState(initialData.firmenname ?? '');
  const [rechtsform, setRechtsform] = useState<Rechtsform | ''>(initialData.rechtsform ?? '');
  const [inhaber, setInhaber] = useState(initialData.inhaber ?? '');
  const [strasse, setStrasse] = useState(initialData.strasse ?? '');
  const [plz, setPlz] = useState(initialData.plz ?? '');
  const [stadt, setStadt] = useState(initialData.stadt ?? '');
  const [ustId, setUstId] = useState(initialData.ustId ?? '');
  const [steuernummer, setSteuernummer] = useState(initialData.steuernummer ?? '');
  const [telefon, setTelefon] = useState(initialData.telefon ?? '');
  const [email, setEmail] = useState(initialData.email ?? '');
  const [branche, setBranche] = useState<Branche | ''>(initialData.branche ?? '');
  const [mitarbeiterAnzahl, setMitarbeiterAnzahl] = useState(initialData.mitarbeiterAnzahl ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const data: Partial<Step2Data> = {
      firmenname,
      rechtsform: rechtsform as Rechtsform,
      inhaber,
      strasse,
      plz,
      stadt,
      ustId,
      steuernummer,
      telefon,
      email,
      branche: branche as Branche,
      mitarbeiterAnzahl,
    };

    const validationError = validateStep2(data);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      // DECISION: Skeleton — kein echter Backend-Call.
      // Phase 1.2: POST /api/wizard/{token}/step/2
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      onComplete(data as Step2Data);
    } catch {
      setError('Fehler beim Speichern. Bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%' }} aria-label="Schritt 2: Betriebsstammdaten">
      <h1 style={headingStyle}>Dein Betrieb</h1>
      <p style={subheadingStyle}>
        Diese Daten braucht dein Steuerberater. Du kannst alles später in den Einstellungen anpassen.
      </p>

      {/* Firmenname */}
      <FormField label="Firmenname / Geschäftsbezeichnung *" htmlFor="w-firmenname">
        <input
          id="w-firmenname"
          type="text"
          value={firmenname}
          onChange={(e) => setFirmenname(e.target.value)}
          required
          placeholder="z.B. Bistro Müller"
          style={inputStyle}
        />
      </FormField>

      {/* Rechtsform */}
      <FormField label="Rechtsform *" htmlFor="w-rechtsform">
        <select
          id="w-rechtsform"
          value={rechtsform}
          onChange={(e) => setRechtsform(e.target.value as Rechtsform)}
          required
          style={inputStyle}
        >
          <option value="">Bitte wählen…</option>
          <option value="einzelunternehmen">Einzelunternehmen / Einzelkaufmann</option>
          <option value="gbr">GbR</option>
          <option value="ug">UG (haftungsbeschränkt)</option>
          <option value="gmbh">GmbH</option>
          <option value="gmbh_co_kg">GmbH &amp; Co. KG</option>
          <option value="sonstige">Sonstige</option>
        </select>
      </FormField>

      {/* Inhaber */}
      <FormField label="Inhaber / Geschäftsführer *" htmlFor="w-inhaber">
        <input
          id="w-inhaber"
          type="text"
          value={inhaber}
          onChange={(e) => setInhaber(e.target.value)}
          required
          placeholder="Vor- und Nachname"
          style={inputStyle}
        />
      </FormField>

      {/* Adresse */}
      <FormField label="Straße und Hausnummer *" htmlFor="w-strasse">
        <input
          id="w-strasse"
          type="text"
          value={strasse}
          onChange={(e) => setStrasse(e.target.value)}
          required
          placeholder="Musterstraße 42"
          style={inputStyle}
        />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <FormField label="PLZ *" htmlFor="w-plz" noMargin>
          <input
            id="w-plz"
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={plz}
            onChange={(e) => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))}
            required
            placeholder="12345"
            style={inputStyle}
          />
        </FormField>
        <FormField label="Stadt *" htmlFor="w-stadt" noMargin>
          <input
            id="w-stadt"
            type="text"
            value={stadt}
            onChange={(e) => setStadt(e.target.value)}
            required
            placeholder="Berlin"
            style={inputStyle}
          />
        </FormField>
      </div>

      {/* Steuernummer */}
      <FormField
        label="Steuernummer *"
        htmlFor="w-steuernummer"
        hint="Steht auf jedem Schreiben vom Finanzamt — z.B. 11/123/45678"
      >
        <input
          id="w-steuernummer"
          type="text"
          value={steuernummer}
          onChange={(e) => setSteuernummer(e.target.value)}
          required
          placeholder="11/123/45678"
          style={inputStyle}
        />
      </FormField>

      {/* USt-ID (optional) */}
      <FormField
        label="USt-ID (optional)"
        htmlFor="w-ust-id"
        hint="Falls du noch keine hast — dein Steuerberater kümmert sich darum."
      >
        <input
          id="w-ust-id"
          type="text"
          value={ustId}
          onChange={(e) => setUstId(e.target.value)}
          placeholder="DE123456789"
          style={inputStyle}
        />
      </FormField>

      {/* Telefon */}
      <FormField label="Mobilnummer *" htmlFor="w-telefon">
        <input
          id="w-telefon"
          type="tel"
          autoComplete="tel"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          required
          placeholder="+49 151 12345678"
          style={inputStyle}
        />
      </FormField>

      {/* E-Mail Kontakt */}
      <FormField label="Kontakt-E-Mail *" htmlFor="w-email">
        <input
          id="w-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="chef@bistro-mueller.de"
          style={inputStyle}
        />
      </FormField>

      {/* Branche */}
      <FormField label="Branche *" htmlFor="w-branche">
        <select
          id="w-branche"
          value={branche}
          onChange={(e) => setBranche(e.target.value as Branche)}
          required
          style={inputStyle}
        >
          <option value="">Bitte wählen…</option>
          <option value="restaurant">Restaurant</option>
          <option value="cafe">Café / Bäckerei</option>
          <option value="bar">Bar / Kneipe</option>
          <option value="imbiss">Imbiss / Schnellrestaurant</option>
          <option value="foodtruck">Foodtruck</option>
          <option value="catering">Catering</option>
          <option value="sonstige_gastro">Sonstige Gastronomie</option>
        </select>
      </FormField>

      {/* Mitarbeiteranzahl */}
      <FormField
        label={`Mitarbeiter-Anzahl: ${mitarbeiterAnzahl}`}
        htmlFor="w-mitarbeiter"
      >
        <input
          id="w-mitarbeiter"
          type="range"
          min={1}
          max={50}
          value={mitarbeiterAnzahl}
          onChange={(e) => setMitarbeiterAnzahl(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--blue)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span>1</span><span>25</span><span>50+</span>
        </div>
      </FormField>

      {/* Error */}
      {error && (
        <div role="alert" style={errorStyle}>{error}</div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
        <button type="button" onClick={onBack} style={{ ...secondaryButtonStyle, flex: '0 0 auto', minWidth: '80px' }}>
          ← Zurück
        </button>
        <button type="submit" disabled={submitting} style={{ ...primaryButtonStyle, flex: 1 }}>
          {submitting ? 'Wird gespeichert…' : 'Weiter →'}
        </button>
      </div>
    </form>
  );
}

// ── Sub-Component: FormField ───────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  noMargin?: boolean;
  children: React.ReactNode;
}

function FormField({ label, htmlFor, hint, noMargin, children }: FormFieldProps) {
  return (
    <fieldset style={{ border: 'none', marginBottom: noMargin ? 0 : '1.25rem' }}>
      <label htmlFor={htmlFor} style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
      {hint && (
        <p style={{ marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
          {hint}
        </p>
      )}
    </fieldset>
  );
}

// ── Shared Styles ─────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  marginBottom: '0.5rem',
  background: 'var(--grad-brand)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

const subheadingStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  marginBottom: '2rem',
  fontSize: '0.9rem',
  lineHeight: 1.6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  background: 'var(--surface)',
  border: '1px solid var(--border-bright)',
  borderRadius: '0.5rem',
  color: 'var(--text)',
  fontSize: '1rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '1rem',
  background: 'var(--grad-blue)',
  border: 'none',
  borderRadius: '0.625rem',
  color: '#fff',
  fontWeight: 700,
  fontSize: '1rem',
  cursor: 'pointer',
  minHeight: '56px',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  background: 'transparent',
  border: '1px solid var(--border-bright)',
  borderRadius: '0.625rem',
  color: 'var(--text-muted)',
  fontSize: '0.9rem',
  cursor: 'pointer',
  minHeight: '56px',
};

const errorStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  background: 'rgba(248,113,113,0.1)',
  border: '1px solid rgba(248,113,113,0.3)',
  borderRadius: '0.5rem',
  color: '#f87171',
  fontSize: '0.875rem',
  marginBottom: '1rem',
};
