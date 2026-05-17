import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCustomer, createTenant, fetchTenants, setActiveTenantId } from '../api';

const STORAGE_KEY = 'pp_onboarding_skipped';

export default function OnboardingModal() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Beim Mount: prüfen ob Tenants existieren
  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === '1') return;

    fetchTenants()
      .then((list) => {
        if (list.length === 0) {
          triggerRef.current = document.activeElement as HTMLElement | null;
          setVisible(true);
        }
      })
      .catch(() => { /* still — kein Modal anzeigen */ });
  }, []);

  // Focus-Management: Beim Öffnen Focus auf ersten Button
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => firstButtonRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    return;
  }, [visible, step]);

  // Beim Schließen: Focus zurück
  useEffect(() => {
    if (!visible && triggerRef.current) {
      triggerRef.current.focus?.();
    }
  }, [visible]);

  // ESC schließt nicht (Onboarding muss aktiv beendet werden)

  function nameToSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] ?? c))
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async function createInitialTenant() {
    setError(null);
    setBusy(true);
    try {
      const t = await createTenant({ name: tenantName.trim(), slug: tenantSlug.trim() });
      setCreatedTenantId(t.id);
      setActiveTenantId(t.id);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Anlegen');
    } finally {
      setBusy(false);
    }
  }

  async function createInitialCustomer() {
    if (!createdTenantId) return;
    setError(null);
    setBusy(true);
    try {
      await createCustomer(createdTenantId, {
        name: customerName.trim(),
        email: customerEmail.trim() || undefined,
      });
      finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Anlegen');
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    setVisible(false);
    navigate('/upload');
  }

  function skip() {
    window.localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="progress-dots">
          <span className={`progress-dot ${step === 0 ? 'active' : step > 0 ? 'done' : ''}`} />
          <span className={`progress-dot ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`} />
          <span className={`progress-dot ${step === 2 ? 'active' : ''}`} />
        </div>

        {step === 0 && (
          <Step0 firstButtonRef={firstButtonRef} onNext={() => setStep(1)} onSkip={skip} />
        )}

        {step === 1 && (
          <Step1
            firstButtonRef={firstButtonRef}
            name={tenantName}
            slug={tenantSlug}
            onNameChange={(v) => { setTenantName(v); setTenantSlug(nameToSlug(v)); }}
            onSlugChange={setTenantSlug}
            onBack={() => setStep(0)}
            onNext={createInitialTenant}
            onSkip={skip}
            busy={busy}
            error={error}
          />
        )}

        {step === 2 && (
          <Step2
            firstButtonRef={firstButtonRef}
            name={customerName}
            email={customerEmail}
            onNameChange={setCustomerName}
            onEmailChange={setCustomerEmail}
            onBack={() => setStep(1)}
            onFinish={createInitialCustomer}
            onSkip={finish}
            busy={busy}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

// ── Step 0 ─────────────────────────────────────────────────────────────────────

function Step0({
  firstButtonRef, onNext, onSkip,
}: {
  firstButtonRef: React.RefObject<HTMLButtonElement>;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div className="modal-header">
        <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
        <h2 id="onboarding-title" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>
          Willkommen bei <span className="gradient-text">ProzessPilot</span>
        </h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 14 }}>
          In zwei Schritten ist Ihr System einsatzbereit.
        </p>
      </div>
      <div className="modal-body">
        <FeatureRow icon="📤" color="#58a6ff" title="Belege per Drag & Drop"
          text="Laden Sie PDFs oder Bilder direkt im Browser hoch und behalten Sie alle Status-Updates im Blick." />
        <FeatureRow icon="🤖" color="#a78bfa" title="KI-Kategorisierung"
          text="Belege werden automatisch durch OCR und Claude in Kategorien sortiert — Datum, Lieferant, Betrag inklusive." />
        <FeatureRow icon="📊" color="#34d399" title="Live-Statistiken"
          text="Status-Verteilung, Quellen-Breakdown und Tages-Trend in Echtzeit — als pure CSS-Grafiken, ohne Tracking." />
      </div>
      <div className="modal-footer">
        <button className="ghost" onClick={onSkip}>Überspringen</button>
        <button ref={firstButtonRef} className="primary" onClick={onNext} style={{ marginLeft: 'auto' }}>
          Loslegen →
        </button>
      </div>
    </>
  );
}

function FeatureRow({ icon, color, title, text }: { icon: string; color: string; title: string; text: string }) {
  return (
    <div className="feature-row">
      <div className="feature-icon-circle" style={{ background: `${color}1a`, color }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{text}</div>
      </div>
    </div>
  );
}

// ── Step 1 ─────────────────────────────────────────────────────────────────────

function Step1({
  firstButtonRef, name, slug, onNameChange, onSlugChange, onBack, onNext, onSkip, busy, error,
}: {
  firstButtonRef: React.RefObject<HTMLButtonElement>;
  name: string;
  slug: string;
  onNameChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  busy: boolean;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const canSubmit = name.trim().length > 0 && slug.trim().length > 0;

  return (
    <>
      <div className="modal-header">
        <h2 id="onboarding-title" style={{ fontSize: 20, fontWeight: 800 }}>
          Ersten Mandanten anlegen
        </h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 13 }}>
          Mandanten gruppieren Kunden, Belege und Module. Sie können später beliebig viele anlegen.
        </p>
      </div>
      <div className="modal-body">
        {error && <div className="error-box">{error}</div>}
        <div className="field">
          <label htmlFor="ob-tenant-name">Name *</label>
          <input
            ref={inputRef}
            id="ob-tenant-name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="z. B. Muster Steuerberatung"
          />
        </div>
        <div className="field">
          <label htmlFor="ob-tenant-slug">URL-Slug *</label>
          <input
            id="ob-tenant-slug"
            type="text"
            value={slug}
            onChange={(e) => onSlugChange(e.target.value)}
            placeholder="muster-steuerberatung"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            title="Nur Kleinbuchstaben, Ziffern und Bindestriche"
          />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Wird automatisch aus dem Namen generiert.
          </p>
        </div>
      </div>
      <div className="modal-footer">
        <button className="ghost" onClick={onSkip}>Überspringen</button>
        <button className="secondary" onClick={onBack} style={{ marginLeft: 'auto' }}>← Zurück</button>
        <button ref={firstButtonRef} className="primary" onClick={onNext} disabled={!canSubmit || busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Wird angelegt…' : 'Weiter →'}
        </button>
      </div>
    </>
  );
}

// ── Step 2 ─────────────────────────────────────────────────────────────────────

function Step2({
  firstButtonRef, name, email, onNameChange, onEmailChange, onBack, onFinish, onSkip, busy, error,
}: {
  firstButtonRef: React.RefObject<HTMLButtonElement>;
  name: string;
  email: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onBack: () => void;
  onFinish: () => void;
  onSkip: () => void;
  busy: boolean;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const canSubmit = name.trim().length > 0;

  return (
    <>
      <div className="modal-header">
        <h2 id="onboarding-title" style={{ fontSize: 20, fontWeight: 800 }}>
          Ersten Kunden anlegen
        </h2>
        <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 13 }}>
          Belege werden immer einem Kunden zugeordnet. Legen Sie jetzt einen Test-Kunden an.
        </p>
      </div>
      <div className="modal-body">
        {error && <div className="error-box">{error}</div>}
        <div className="field">
          <label htmlFor="ob-customer-name">Name *</label>
          <input
            ref={inputRef}
            id="ob-customer-name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="z. B. Max Mustermann"
          />
        </div>
        <div className="field">
          <label htmlFor="ob-customer-email">E-Mail (optional)</label>
          <input
            id="ob-customer-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="max@example.com"
          />
        </div>
      </div>
      <div className="modal-footer">
        <button className="ghost" onClick={onSkip}>Überspringen</button>
        <button className="secondary" onClick={onBack} style={{ marginLeft: 'auto' }}>← Zurück</button>
        <button ref={firstButtonRef} className="primary" onClick={onFinish} disabled={!canSubmit || busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Wird angelegt…' : '✓ Fertig'}
        </button>
      </div>
    </>
  );
}
