/**
 * T016 — Wizard-Schritt 1: Stammdaten (Spec §2.2).
 *
 * Native Inputs + Client-Validierung (gespiegelt vom Backend-Zod-Schema; der
 * Server bleibt die maßgebliche Instanz und liefert 422 bei Fehlern). Mobile-First.
 */
import { type FormEvent, type ReactNode, useState } from 'react';
import { type PublicSession, saveStep, WizardApiError } from '../lib/api';

const RECHTSFORMEN: ReadonlyArray<[string, string]> = [
  ['einzelunternehmen', 'Einzelunternehmen'],
  ['gbr', 'GbR'],
  ['ug', 'UG'],
  ['gmbh', 'GmbH'],
  ['gmbh_co_kg', 'GmbH & Co. KG'],
  ['sonstige', 'Sonstige'],
];
const BRANCHEN: ReadonlyArray<[string, string]> = [
  ['restaurant', 'Restaurant'],
  ['cafe', 'Café'],
  ['bar', 'Bar'],
  ['imbiss', 'Imbiss'],
  ['foodtruck', 'Foodtruck'],
  ['catering', 'Catering'],
  ['sonstige_gastro', 'Sonstige Gastro'],
];

interface Props {
  token: string;
  initialData?: Record<string, unknown>;
  onSaved: (session: PublicSession) => void;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

export function Step1Stammdaten({ token, initialData, onSaved }: Props) {
  const init = initialData ?? {};
  const [firmenname, setFirmenname] = useState(str(init.firmenname));
  const [rechtsform, setRechtsform] = useState(str(init.rechtsform) || 'einzelunternehmen');
  const [inhaber, setInhaber] = useState(str(init.inhaber));
  const [strasse, setStrasse] = useState(str(init.strasse));
  const [plz, setPlz] = useState(str(init.plz));
  const [stadt, setStadt] = useState(str(init.stadt));
  const [ustId, setUstId] = useState(str(init.ust_id));
  const [steuernummer, setSteuernummer] = useState(str(init.steuernummer));
  const [telefon, setTelefon] = useState(str(init.telefon));
  const [email, setEmail] = useState(str(init.email));
  const [branche, setBranche] = useState(str(init.branche) || 'restaurant');
  const [mitarbeiter, setMitarbeiter] = useState(str(init.mitarbeiter_anzahl) || '1');
  const [belegvolumen, setBelegvolumen] = useState(str(init.belegvolumen_monat) || '0');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (firmenname.trim().length < 3) e.firmenname = 'Mindestens 3 Zeichen.';
    if (inhaber.trim().length < 2) e.inhaber = 'Bitte ausfüllen.';
    if (strasse.trim().length < 2) e.strasse = 'Bitte ausfüllen.';
    if (!/^\d{5}$/.test(plz.trim())) e.plz = 'PLZ muss 5 Ziffern sein.';
    if (stadt.trim().length < 2) e.stadt = 'Bitte ausfüllen.';
    if (ustId.trim() && !/^DE\d{9}$/.test(ustId.trim())) e.ustId = 'Format: DE + 9 Ziffern.';
    if (!/^[0-9/ ]{8,20}$/.test(steuernummer.trim())) e.steuernummer = 'z.B. 11/123/45678';
    if (telefon.trim().length < 5) e.telefon = 'Bitte ausfüllen.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = 'Gültige E-Mail angeben.';
    return e;
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const payload: Record<string, unknown> = {
      firmenname: firmenname.trim(),
      rechtsform,
      inhaber: inhaber.trim(),
      strasse: strasse.trim(),
      plz: plz.trim(),
      stadt: stadt.trim(),
      steuernummer: steuernummer.trim(),
      telefon: telefon.trim(),
      email: email.trim(),
      branche,
      mitarbeiter_anzahl: Number(mitarbeiter),
      belegvolumen_monat: Number(belegvolumen),
    };
    if (ustId.trim()) payload.ust_id = ustId.trim();

    setSubmitting(true);
    try {
      const session = await saveStep(token, 1, payload);
      onSaved(session);
    } catch (err) {
      setServerError(
        err instanceof WizardApiError ? err.message : 'Speichern fehlgeschlagen. Bitte erneut versuchen.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Stammdaten">
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 'var(--space-2)' }}>
        Erzähl uns von deinem Betrieb
      </h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-5)', fontSize: '.875rem' }}>
        Diese Angaben brauchen wir für deine Buchhaltung. Du kannst sie später ändern.
      </p>

      <Field id="firmenname" label="Firmenname" error={errors.firmenname}>
        <input id="firmenname" value={firmenname} onChange={(e) => setFirmenname(e.target.value)} />
      </Field>

      <Field id="rechtsform" label="Rechtsform">
        <select id="rechtsform" value={rechtsform} onChange={(e) => setRechtsform(e.target.value)}>
          {RECHTSFORMEN.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>

      <Field id="inhaber" label="Inhaber/Geschäftsführer" error={errors.inhaber}>
        <input id="inhaber" value={inhaber} onChange={(e) => setInhaber(e.target.value)} />
      </Field>

      <Field id="strasse" label="Straße & Hausnummer" error={errors.strasse}>
        <input id="strasse" value={strasse} onChange={(e) => setStrasse(e.target.value)} />
      </Field>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <div style={{ flex: '0 0 40%' }}>
          <Field id="plz" label="PLZ" error={errors.plz}>
            <input id="plz" inputMode="numeric" value={plz} onChange={(e) => setPlz(e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field id="stadt" label="Stadt" error={errors.stadt}>
            <input id="stadt" value={stadt} onChange={(e) => setStadt(e.target.value)} />
          </Field>
        </div>
      </div>

      <Field id="ustId" label="USt-ID (optional)" error={errors.ustId} hint="Falls vorhanden, z.B. DE123456789.">
        <input id="ustId" value={ustId} onChange={(e) => setUstId(e.target.value)} placeholder="DE…" />
      </Field>

      <Field id="steuernummer" label="Steuernummer" error={errors.steuernummer} hint="Steht auf Briefen vom Finanzamt.">
        <input id="steuernummer" value={steuernummer} onChange={(e) => setSteuernummer(e.target.value)} />
      </Field>

      <Field id="telefon" label="Telefon" error={errors.telefon}>
        <input id="telefon" type="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
      </Field>

      <Field id="email" label="E-Mail" error={errors.email}>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>

      <Field id="branche" label="Branche">
        <select id="branche" value={branche} onChange={(e) => setBranche(e.target.value)}>
          {BRANCHEN.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1 }}>
          <Field id="mitarbeiter" label="Mitarbeiter (1–50)">
            <input
              id="mitarbeiter"
              type="number"
              min={1}
              max={50}
              value={mitarbeiter}
              onChange={(e) => setMitarbeiter(e.target.value)}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field id="belegvolumen" label="Belege/Monat (Schätzung)">
            <input
              id="belegvolumen"
              type="number"
              min={0}
              max={800}
              value={belegvolumen}
              onChange={(e) => setBelegvolumen(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {serverError && (
        <div className="error-box" role="alert" style={{ margin: 'var(--space-4) 0' }}>
          {serverError}
        </div>
      )}

      <button type="submit" className="primary" disabled={submitting} style={{ width: '100%', height: 48, marginTop: 'var(--space-4)' }}>
        {submitting ? 'Wird gespeichert…' : 'Weiter'}
      </button>
    </form>
  );
}

function Field({
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
