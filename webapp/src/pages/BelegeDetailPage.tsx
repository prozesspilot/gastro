/**
 * BelegeDetailPage — T015 Beleg-Detail mit Edit-Form + Konfidenz-Indikatoren.
 *
 * Layout:
 *   * Header: Lieferant + Status-Badge
 *   * 2-Spalter: links Bild/PDF (klickbar → Lightbox-Zoom), rechts Form
 *   * Form-Felder: Lieferant, Datum, Betrag, MwSt, Kategorie, Bewirtungs-
 *     Felder (conditional bei category enthält 'bewirtung')
 *   * Konfidenz-Punkt pro OCR-Feld (Grün ≥0.7, Gelb 0.4-0.7, Rot <0.4)
 *   * Buttons: Speichern (PATCH), Re-OCR (POST /reprocess), Löschen (DELETE
 *     mit Confirm-Dialog)
 *   * Mobile: Grid collapse zu 1-Spalter (CSS-Media-Query via inline styles +
 *     window-listener — simpler als Tailwind in dieser Komponente)
 *
 * Optimistisches Update: bei Save aktualisieren wir den Local-State sofort;
 * bei API-Fehler rollen wir zurück auf den letzten erfolgreichen Snapshot.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getActiveTenantId } from '../api';
import {
  type Beleg,
  type BelegUpdatePatch,
  categorizeBeleg,
  deleteBeleg,
  exportBelegLexware,
  getBeleg,
  reprocessBeleg,
  updateBeleg,
} from '../api/belege';
import { useAuth } from '../auth/AuthContext';
import NoTenantHint from '../components/NoTenantHint';
import { useToast } from '../components/ToastProvider';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function formatAmount(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(amount);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

type StatusLevel = 'idle' | 'progress' | 'done' | 'review' | 'error';

function statusLevel(status: Beleg['status']): StatusLevel {
  switch (status) {
    case 'received':
      return 'idle';
    case 'extracting':
    case 'categorizing':
    case 'archiving':
    case 'exporting':
      return 'progress';
    case 'extracted':
    case 'categorized':
    case 'archived':
    case 'exported':
    case 'completed':
      return 'done';
    case 'requires_review':
      return 'review';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

const LEVEL_COLOR: Record<StatusLevel, string> = {
  idle: 'var(--text-subtle)',
  progress: 'var(--orange)',
  done: 'var(--green)',
  review: 'var(--status-attention-fg)',
  error: 'var(--status-error-fg)',
};

const STATUS_LABELS: Record<Beleg['status'], string> = {
  received: 'Empfangen',
  extracting: 'Extrahierung läuft',
  extracted: 'Extrahiert',
  categorizing: 'Kategorisierung läuft',
  categorized: 'Kategorisiert',
  archiving: 'Archivierung läuft',
  archived: 'Archiviert',
  exporting: 'Export läuft',
  exported: 'Exportiert',
  completed: 'Abgeschlossen',
  requires_review: 'Prüfung nötig',
  error: 'Fehler',
};

function isPdfMime(mime: string): boolean {
  return mime.includes('pdf');
}

/** Konfidenz-Punkt: Grün ≥0.7, Gelb 0.4-0.7, Rot <0.4, Grau wenn undefined. */
function ConfidenceDot({ value, label }: { value: number | undefined; label: string }) {
  let color = 'var(--text-subtle)';
  let title = `${label}: keine OCR-Konfidenz`;
  if (value !== undefined) {
    if (value >= 0.7) {
      color = 'var(--green)';
    } else if (value >= 0.4) {
      color = 'var(--orange)';
    } else {
      color = 'var(--status-error-fg)';
    }
    title = `${label}: Konfidenz ${(value * 100).toFixed(0)}%`;
  }
  return (
    <span
      title={title}
      aria-label={title}
      data-testid={`confidence-${label}`}
      data-confidence={value !== undefined ? value.toFixed(2) : 'unknown'}
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
        marginRight: 8,
        verticalAlign: 'middle',
      }}
    />
  );
}

// ── Form-State ───────────────────────────────────────────────────────────────

interface FormState {
  supplier_name: string;
  document_date: string;
  total_gross: string;
  currency: string;
  category: string;
  tax_rate: string;
  bewirtung_anlass: string;
  bewirtung_teilnehmer: string;
}

function belegToForm(beleg: Beleg): FormState {
  const fields = beleg.payload?.extraction?.fields ?? {};
  return {
    supplier_name: beleg.supplier_name ?? '',
    document_date: beleg.document_date ?? '',
    total_gross: beleg.total_gross !== null ? String(beleg.total_gross) : '',
    currency: beleg.currency ?? 'EUR',
    category: beleg.category ?? '',
    tax_rate: fields.tax_rate !== undefined ? String(fields.tax_rate) : '',
    bewirtung_anlass: fields.bewirtung_anlass ?? '',
    bewirtung_teilnehmer: fields.bewirtung_teilnehmer ?? '',
  };
}

function formToPatch(form: FormState, baseline: FormState): BelegUpdatePatch {
  const patch: BelegUpdatePatch = {};
  if (form.supplier_name !== baseline.supplier_name) {
    patch.supplier_name = form.supplier_name.trim() || null;
  }
  if (form.document_date !== baseline.document_date) {
    patch.document_date = form.document_date.trim() || null;
  }
  if (form.total_gross !== baseline.total_gross) {
    const n = Number.parseFloat(form.total_gross.replace(',', '.'));
    patch.total_gross = Number.isFinite(n) ? n : null;
  }
  if (form.currency !== baseline.currency) {
    patch.currency = form.currency.trim() || null;
  }
  if (form.category !== baseline.category) {
    patch.category = form.category.trim() || null;
  }
  if (form.tax_rate !== baseline.tax_rate) {
    const n = Number.parseFloat(form.tax_rate.replace(',', '.'));
    patch.tax_rate = Number.isFinite(n) ? n : null;
  }
  if (form.bewirtung_anlass !== baseline.bewirtung_anlass) {
    patch.bewirtung_anlass = form.bewirtung_anlass.trim() || null;
  }
  if (form.bewirtung_teilnehmer !== baseline.bewirtung_teilnehmer) {
    patch.bewirtung_teilnehmer = form.bewirtung_teilnehmer.trim() || null;
  }
  return patch;
}

// ── Komponente ────────────────────────────────────────────────────────────────

export default function BelegeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  // categorize/export sind dem support verboten (Backend 403) → Buttons ausblenden.
  const canWrite = user?.role !== 'support';

  const [beleg, setBeleg] = useState<Beleg | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [noTenant, setNoTenant] = useState(false);

  useEffect(() => {
    if (!id) return;
    // Ohne aktiven Mandanten kein /belege/:id-Call (sonst 400) — sauberer Hinweis.
    if (!getActiveTenantId()) {
      setNoTenant(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    getBeleg(id)
      .then((res) => {
        setBeleg(res.beleg);
        setDownloadUrl(res.download_url);
        const f = belegToForm(res.beleg);
        setForm(f);
        setBaseline(f);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setError(msg);
        toast('error', `Beleg konnte nicht geladen werden: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [id, toast]);

  const isBewirtung = useMemo(
    () => form?.category.toLowerCase().includes('bewirtung') ?? false,
    [form?.category],
  );

  const isDirty = useMemo(() => {
    if (!form || !baseline) return false;
    return JSON.stringify(form) !== JSON.stringify(baseline);
  }, [form, baseline]);

  const confidence = beleg?.payload?.extraction?.fields?.fields_confidence ?? {};

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!id || !beleg || !form || !baseline) return;
    const patch = formToPatch(form, baseline);
    if (Object.keys(patch).length === 0) {
      toast('info', 'Keine Änderungen.');
      return;
    }
    setSaving(true);
    // T015 Review-Fix M2: `!== undefined`-Check statt `??` — sonst geht Reset
    // auf null verloren (User löscht Lieferant-Name → optimistische UI zeigt
    // weiter den alten Wert, weil null ?? alterWert = alterWert).
    // `in` verengt den TypeScript-Type nicht (bleibt `string | null | undefined`),
    // `!== undefined` schon. `currency` ist non-nullable im Beleg-Type, daher
    // Fallback auf altes currency wenn Patch null/undefined liefert.
    const optimisticBeleg: Beleg = {
      ...beleg,
      supplier_name:
        patch.supplier_name !== undefined ? patch.supplier_name : beleg.supplier_name,
      document_date:
        patch.document_date !== undefined ? patch.document_date : beleg.document_date,
      total_gross: patch.total_gross !== undefined ? patch.total_gross : beleg.total_gross,
      currency: patch.currency ?? beleg.currency,
      category: patch.category !== undefined ? patch.category : beleg.category,
    };
    const previousBeleg = beleg;
    const previousBaseline = baseline;
    setBeleg(optimisticBeleg);
    setBaseline(form);
    try {
      const res = await updateBeleg(id, patch);
      setBeleg(res.beleg);
      const newForm = belegToForm(res.beleg);
      setForm(newForm);
      setBaseline(newForm);
      toast('success', 'Korrekturen gespeichert.');
    } catch (err) {
      // Rollback
      setBeleg(previousBeleg);
      setBaseline(previousBaseline);
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast('error', `Speichern fehlgeschlagen: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReprocess = async () => {
    if (!id) return;
    setReprocessing(true);
    try {
      await reprocessBeleg(id);
      toast('success', 'OCR neu gestartet. Seite in ein paar Sekunden neu laden.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast('error', `Re-OCR fehlgeschlagen: ${msg}`);
    } finally {
      setReprocessing(false);
    }
  };

  /** Lädt den Beleg neu (nach Kategorisieren/Export) → Status + Felder aktualisieren. */
  const refreshBeleg = async () => {
    if (!id) return;
    const res = await getBeleg(id);
    setBeleg(res.beleg);
    setDownloadUrl(res.download_url);
    const f = belegToForm(res.beleg);
    setForm(f);
    setBaseline(f);
  };

  const handleCategorize = async () => {
    if (!id || categorizing) return;
    setCategorizing(true);
    try {
      const res = await categorizeBeleg(id);
      await refreshBeleg();
      const c = res.categorization;
      if (c.requires_review) {
        toast(
          'info',
          `Kategorisiert als „${c.category_label}" — bitte prüfen (Konfidenz ${Math.round(
            c.confidence * 100,
          )} %).`,
        );
      } else {
        toast(
          'success',
          `Kategorisiert als „${c.category_label}"${c.skr_account ? ` (SKR ${c.skr_account})` : ''}.`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast('error', `Kategorisieren fehlgeschlagen: ${msg}`);
    } finally {
      setCategorizing(false);
    }
  };

  const handleExport = async () => {
    if (!id || exporting) return;
    setExporting(true);
    try {
      const res = await exportBelegLexware(id);
      await refreshBeleg();
      if (res.status === 'skipped') {
        toast('info', 'Beleg war bereits an Lexware exportiert.');
      } else {
        toast('success', 'An Lexware Office exportiert.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast('error', `Export fehlgeschlagen: ${msg}`);
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteBeleg(id);
      toast('success', 'Beleg gelöscht.');
      navigate('/belege');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast('error', `Löschen fehlgeschlagen: ${msg}`);
      setShowDeleteConfirm(false);
    }
  };

  // ── Kein Mandant gewählt ────────────────────────────────────────────────────

  if (noTenant) {
    return (
      <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
        <button
          type="button"
          className="ghost"
          onClick={() => navigate('/belege')}
          style={{ marginBottom: 24, fontSize: 13 }}
        >
          &larr; Zurück
        </button>
        <NoTenantHint />
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div
          style={{
            height: 24,
            background: 'var(--card-2)',
            borderRadius: 6,
            marginBottom: 32,
            width: 120,
            animation: 'skeletonPulse 1.5s ease-in-out infinite',
          }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div
            style={{
              height: 400,
              background: 'var(--card-2)',
              borderRadius: 'var(--radius-lg)',
              animation: 'skeletonPulse 1.5s ease-in-out infinite',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 20,
                  background: 'var(--card-2)',
                  borderRadius: 4,
                  animation: 'skeletonPulse 1.5s ease-in-out infinite',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !beleg || !form) {
    return (
      <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
        <button
          type="button"
          className="ghost"
          onClick={() => navigate('/belege')}
          style={{ marginBottom: 24, fontSize: 13 }}
        >
          &larr; Zurück
        </button>
        <div className="error-box" role="alert">
          {error ?? 'Beleg nicht gefunden.'}
        </div>
      </div>
    );
  }

  const level = statusLevel(beleg.status);

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Back */}
      <button
        type="button"
        className="ghost"
        onClick={() => navigate('/belege')}
        style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}
        aria-label="Zurück zur Belegliste"
      >
        &larr; Zurück zur Liste
      </button>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {beleg.supplier_name ?? 'Beleg'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            ID: <code style={{ fontFamily: 'monospace', fontSize: 12 }}>{beleg.id}</code>
          </p>
        </div>
        <span
          style={{
            display: 'inline-block',
            padding: '5px 14px',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 700,
            background: `${LEVEL_COLOR[level]}22`,
            color: LEVEL_COLOR[level],
            border: `1px solid ${LEVEL_COLOR[level]}55`,
          }}
          data-testid="status-badge"
          aria-label={`Status: ${STATUS_LABELS[beleg.status]}`}
        >
          {STATUS_LABELS[beleg.status]}
        </span>
      </div>

      {/* Grid: Vorschau links, Form rechts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
          gap: 24,
          alignItems: 'start',
        }}
        data-testid="detail-grid"
      >
        {/* Vorschau */}
        <div
          style={{
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            minHeight: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: downloadUrl && !isPdfMime(beleg.file_mime_type) ? 'zoom-in' : 'default',
          }}
          data-testid="preview-container"
          onClick={() => {
            if (downloadUrl && !isPdfMime(beleg.file_mime_type)) setShowZoomModal(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && downloadUrl && !isPdfMime(beleg.file_mime_type)) {
              setShowZoomModal(true);
            }
          }}
        >
          {downloadUrl ? (
            isPdfMime(beleg.file_mime_type) ? (
              <iframe
                src={downloadUrl}
                sandbox=""
                referrerPolicy="no-referrer"
                title={`PDF-Preview von ${beleg.supplier_name ?? 'Beleg'}`}
                style={{ width: '100%', height: 480, border: '1px solid var(--border)', borderRadius: 8 }}
                aria-label="PDF-Vorschau"
                data-testid="pdf-preview"
              />
            ) : (
              <img
                src={downloadUrl}
                alt={`Beleg ${beleg.supplier_name ?? 'ohne Name'}`}
                referrerPolicy="no-referrer"
                style={{
                  maxWidth: '100%',
                  maxHeight: 480,
                  objectFit: 'contain',
                  display: 'block',
                }}
                data-testid="image-preview"
              />
            )
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-subtle)', padding: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
              <p style={{ fontSize: 13 }}>Keine Vorschau verfügbar</p>
            </div>
          )}
        </div>

        {/* Form */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 20px',
          }}
        >
          <h2
            style={{
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--text-muted)',
            }}
          >
            Beleginformationen
          </h2>

          <FormField label="Lieferant" htmlFor="f-supplier" confidence={confidence.supplier_name}>
            <input
              id="f-supplier"
              type="text"
              value={form.supplier_name}
              onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
              data-testid="field-supplier_name"
            />
          </FormField>

          <FormField label="Belegdatum" htmlFor="f-date" confidence={confidence.document_date}>
            <input
              id="f-date"
              type="date"
              value={form.document_date}
              onChange={(e) => setForm({ ...form, document_date: e.target.value })}
              data-testid="field-document_date"
            />
          </FormField>

          <FormField label="Betrag (Brutto)" htmlFor="f-total" confidence={confidence.total_gross}>
            <input
              id="f-total"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={form.total_gross}
              onChange={(e) => setForm({ ...form, total_gross: e.target.value })}
              data-testid="field-total_gross"
            />
          </FormField>

          <FormField label="Währung" htmlFor="f-currency">
            <input
              id="f-currency"
              type="text"
              maxLength={3}
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              data-testid="field-currency"
              style={{ width: 80 }}
            />
          </FormField>

          <FormField label="MwSt-Satz (%)" htmlFor="f-tax">
            <select
              id="f-tax"
              value={form.tax_rate}
              onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
              data-testid="field-tax_rate"
            >
              <option value="">—</option>
              <option value="0">0 %</option>
              <option value="7">7 %</option>
              <option value="19">19 %</option>
            </select>
          </FormField>

          <FormField label="Kategorie" htmlFor="f-cat">
            <input
              id="f-cat"
              type="text"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              data-testid="field-category"
              placeholder="z. B. wareneinkauf_food, bewirtung_kunden"
            />
          </FormField>

          {isBewirtung && (
            <>
              <FormField label="Anlass *" htmlFor="f-anlass">
                <input
                  id="f-anlass"
                  type="text"
                  required
                  value={form.bewirtung_anlass}
                  onChange={(e) => setForm({ ...form, bewirtung_anlass: e.target.value })}
                  data-testid="field-bewirtung_anlass"
                  placeholder="z. B. Geschäftsessen mit Kunde XY"
                />
              </FormField>

              <FormField label="Teilnehmer *" htmlFor="f-teilnehmer">
                <input
                  id="f-teilnehmer"
                  type="text"
                  required
                  value={form.bewirtung_teilnehmer}
                  onChange={(e) => setForm({ ...form, bewirtung_teilnehmer: e.target.value })}
                  data-testid="field-bewirtung_teilnehmer"
                  placeholder="Komma-getrennt: Max Müller, Anna Schmidt"
                />
              </FormField>
            </>
          )}

          {/* Aktions-Buttons */}
          <div
            style={{
              marginTop: 20,
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || saving}
                data-testid="btn-save"
              >
                {saving ? 'Speichere…' : 'Speichern'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={handleReprocess}
                disabled={reprocessing || beleg.status === 'extracting'}
                data-testid="btn-reprocess"
              >
                {reprocessing ? 'Startet…' : 'Re-OCR'}
              </button>
              {canWrite && beleg.status === 'extracted' && (
                <button
                  type="button"
                  onClick={handleCategorize}
                  // Bei ungespeicherten Edits sperren: refreshBeleg nach der Aktion
                  // würde die Formular-Eingaben sonst stillschweigend verwerfen.
                  disabled={categorizing || isDirty}
                  title={isDirty ? 'Bitte zuerst die Änderungen speichern.' : undefined}
                  data-testid="btn-categorize"
                >
                  {categorizing ? 'Kategorisiere…' : 'Kategorisieren'}
                </button>
              )}
              {canWrite && beleg.status === 'categorized' && (
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting || isDirty}
                  title={isDirty ? 'Bitte zuerst die Änderungen speichern.' : undefined}
                  data-testid="btn-export"
                >
                  {exporting ? 'Exportiere…' : 'Nach Lexware exportieren'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              data-testid="btn-delete"
              style={{ color: 'var(--status-error-fg)', borderColor: 'var(--status-error-fg)' }}
              className="ghost"
            >
              Löschen
            </button>
          </div>

          {/* Konfidenz-Gesamtwert + Validation-Issues */}
          {beleg.payload?.extraction?.confidence !== undefined && (
            <div
              style={{
                marginTop: 16,
                padding: '10px 12px',
                background: 'var(--card-2)',
                borderRadius: 'var(--radius)',
                fontSize: 12,
                color: 'var(--text-subtle)',
              }}
            >
              OCR-Gesamt-Konfidenz: {(beleg.payload.extraction.confidence * 100).toFixed(0)}%
              {beleg.payload.validation?.issues && beleg.payload.validation.issues.length > 0 && (
                <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
                  {beleg.payload.validation.issues.map((iss) => (
                    <li key={`${iss.code}-${iss.field ?? 'none'}`}>{iss.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Read-only Meta */}
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            Empfangen am {formatDate(beleg.received_at)} via {beleg.source_channel} ·{' '}
            {beleg.file_mime_type}
            {' · '}
            Aktueller Brutto: {formatAmount(beleg.total_gross, beleg.currency)}
          </div>
        </div>
      </div>

      {/* Delete-Confirm-Dialog */}
      {showDeleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          data-testid="delete-confirm"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 24,
              maxWidth: 420,
              width: '90%',
            }}
          >
            <h3 id="delete-confirm-title" style={{ fontSize: 16, fontWeight: 700, marginTop: 0 }}>
              Beleg löschen?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Der Beleg wird als gelöscht markiert. Die zugrundeliegende Datei bleibt aufgrund der
              gesetzlichen Aufbewahrungspflicht (§ 147 AO, 10 Jahre) im System.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowDeleteConfirm(false)}
                data-testid="btn-delete-cancel"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleDelete}
                data-testid="btn-delete-confirm"
                style={{ background: 'var(--status-error-dot)', borderColor: 'var(--status-error-dot)', color: '#fff' }}
              >
                Löschen bestätigen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoom-Modal für Bild */}
      {showZoomModal && downloadUrl && !isPdfMime(beleg.file_mime_type) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bild-Vollansicht"
          data-testid="zoom-modal"
          onClick={() => setShowZoomModal(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowZoomModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            cursor: 'zoom-out',
          }}
        >
          <img
            src={downloadUrl}
            alt="Beleg-Vollansicht"
            referrerPolicy="no-referrer"
            style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain' }}
            data-testid="zoom-image"
          />
        </div>
      )}
    </div>
  );
}

// ── FormField ─────────────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  htmlFor: string;
  confidence?: number;
  children: React.ReactNode;
}

function FormField({ label, htmlFor, confidence, children }: FormFieldProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        htmlFor={htmlFor}
        style={{
          display: 'block',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-muted)',
          marginBottom: 4,
        }}
      >
        {confidence !== undefined && <ConfidenceDot value={confidence} label={label} />}
        {label}
      </label>
      {children}
    </div>
  );
}
