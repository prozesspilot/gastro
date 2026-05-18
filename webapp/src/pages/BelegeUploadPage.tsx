/**
 * BelegeUploadPage — Drag&Drop + Multi-File-Upload für /belege/upload
 *
 * Spec: T014 Mitarbeiter-Webapp Beleg-Upload + Listen-View
 * Backend: POST /api/v1/belege/upload (multipart, field: "file")
 *
 * Unterscheidet sich von UploadPage.tsx (alte receipts-API) — NICHT löschen.
 */

import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';
import { uploadBeleg, type UploadResponse } from '../api/belege';

// ── Konstanten ────────────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
];

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_FILES = 20;

// ── Typen ─────────────────────────────────────────────────────────────────────

type FileStatus = 'queued' | 'uploading' | 'done' | 'error';

interface UploadFile {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  /** Gesetzt wenn Backend isDuplicate=true zurückgibt */
  isDuplicate?: boolean;
  previewUrl?: string;
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type) && file.type !== '') {
    return `Ungültiger Dateityp: ${file.type || 'unbekannt'}`;
  }
  // Fallback-Check über Dateiendung wenn MIME leer (z. B. HEIC in manchen Browsern)
  if (file.type === '') {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'].includes(ext ?? '')) {
      return `Nicht erlaubter Dateityp (.${ext ?? '?'})`;
    }
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `Datei zu groß: ${formatFileSize(file.size)} (max. 20 MB)`;
  }
  return null;
}

// ── Komponente ────────────────────────────────────────────────────────────────

export default function BelegeUploadPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // ── Datei-Hinzufügen ──────────────────────────────────────────────────────

  const addFiles = useCallback((rawFiles: FileList | File[]) => {
    const incoming = Array.from(rawFiles);
    const accepted: UploadFile[] = [];
    const rejected: string[] = [];

    for (const file of incoming) {
      if (files.length + accepted.length >= MAX_FILES) {
        rejected.push(`Limit ${MAX_FILES} Dateien erreicht — "${file.name}" übersprungen`);
        continue;
      }
      const err = validateFile(file);
      if (err) {
        rejected.push(`"${file.name}": ${err}`);
        continue;
      }
      const previewUrl = isImageMime(file.type) ? URL.createObjectURL(file) : undefined;
      accepted.push({
        id: generateId(),
        file,
        status: 'queued',
        progress: 0,
        previewUrl,
      });
    }

    if (rejected.length > 0) {
      toast('warning', rejected.join(' | '));
    }
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted]);
    }
  }, [files.length, toast]);

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Nur wenn Maus Zone wirklich verlässt (nicht auf Child)
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  // ── Datei-Picker ──────────────────────────────────────────────────────────

  function handlePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      // Input zurücksetzen damit gleiche Datei erneut gewählt werden kann
      e.target.value = '';
    }
  }

  // ── Datei entfernen ───────────────────────────────────────────────────────

  function removeFile(id: string) {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleUpload() {
    const queued = files.filter((f) => f.status === 'queued');
    if (queued.length === 0) return;

    setIsUploading(true);

    const results = await Promise.allSettled(
      queued.map(async (uf) => {
        // Status → uploading
        setFiles((prev) =>
          prev.map((f) => (f.id === uf.id ? { ...f, status: 'uploading' as FileStatus } : f)),
        );

        const result: UploadResponse = await uploadBeleg(uf.file, (pct) => {
          setFiles((prev) =>
            prev.map((f) => (f.id === uf.id ? { ...f, progress: pct } : f)),
          );
        });

        // Status → done
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uf.id
              ? { ...f, status: 'done' as FileStatus, progress: 100, isDuplicate: result.isDuplicate }
              : f,
          ),
        );

        if (result.isDuplicate) {
          toast('info', `"${uf.file.name}" wurde bereits hochgeladen (Duplikat).`);
        }

        return result;
      }),
    );

    // Fehler markieren
    results.forEach((res, idx) => {
      if (res.status === 'rejected') {
        const uf = queued[idx];
        const errMsg = res.reason instanceof Error ? res.reason.message : 'Unbekannter Fehler';
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uf.id ? { ...f, status: 'error' as FileStatus, error: errMsg } : f,
          ),
        );
      }
    });

    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const failCount = results.filter((r) => r.status === 'rejected').length;

    setIsUploading(false);

    if (failCount === 0 && successCount > 0) {
      toast('success', `${successCount} Beleg${successCount !== 1 ? 'e' : ''} erfolgreich hochgeladen.`);
      // Kurz warten damit Toast sichtbar ist, dann navigieren
      setTimeout(() => navigate('/belege'), 1000);
    } else if (failCount > 0) {
      toast('error', `${failCount} Beleg${failCount !== 1 ? 'e' : ''} fehlgeschlagen. Bitte erneut versuchen.`);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const queuedCount = files.filter((f) => f.status === 'queued').length;
  const hasErrors = files.some((f) => f.status === 'error');

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button
          type="button"
          className="ghost"
          onClick={() => navigate('/belege')}
          style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}
        >
          &larr; Zurück zur Liste
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Belege hochladen</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 14 }}>
          JPEG, PNG, HEIC oder PDF — bis zu 20 Dateien, max. 20 MB pro Datei.
        </p>
      </div>

      {/* Drop-Zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Dateien hier ablegen oder klicken zum Auswählen"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? 'var(--blue)' : 'var(--border-bright)'}`,
          borderRadius: 'var(--radius-lg)',
          background: isDragging ? 'rgba(88,166,255,0.05)' : 'var(--surface)',
          padding: '48px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background 0.2s',
          outline: 'none',
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12, lineHeight: 1 }}>
          {isDragging ? '📂' : '📎'}
        </div>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>
          {isDragging ? 'Loslassen zum Hinzufügen' : 'Dateien hier ablegen'}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          oder klicken zum Auswählen
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/heic,image/heif,application/pdf"
          onChange={handlePickerChange}
          style={{ display: 'none' }}
          aria-label="Dateiauswahl"
          data-testid="file-input"
        />
      </div>

      {/* Datei-Liste */}
      {files.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {files.length} Datei{files.length !== 1 ? 'en' : ''} ausgewählt
            </span>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                files.forEach((f) => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
                setFiles([]);
              }}
              style={{ fontSize: 12, color: 'var(--text-subtle)' }}
              disabled={isUploading}
            >
              Alle entfernen
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {files.map((uf) => (
              <FileRow
                key={uf.id}
                uf={uf}
                onRemove={() => removeFile(uf.id)}
                disabled={isUploading}
              />
            ))}
          </div>
        </div>
      )}

      {/* Aktions-Buttons */}
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading || queuedCount === 0}
            style={{
              padding: '10px 24px',
              background: 'var(--grad-green)',
              border: 'none',
              borderRadius: 'var(--radius)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: isUploading || queuedCount === 0 ? 'not-allowed' : 'pointer',
              opacity: queuedCount === 0 ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            aria-label={`${queuedCount} Beleg${queuedCount !== 1 ? 'e' : ''} hochladen`}
          >
            {isUploading && <span className="spinner" />}
            {isUploading
              ? 'Wird hochgeladen…'
              : `${queuedCount} Beleg${queuedCount !== 1 ? 'e' : ''} hochladen`}
          </button>

          {hasErrors && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                // Fehler-Dateien auf "queued" zurücksetzen
                setFiles((prev) =>
                  prev.map((f) => (f.status === 'error' ? { ...f, status: 'queued', error: undefined, progress: 0 } : f)),
                );
              }}
              disabled={isUploading}
              style={{ fontSize: 13 }}
            >
              Fehler erneut versuchen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── FileRow-Unterkomponente ───────────────────────────────────────────────────

function FileRow({
  uf,
  onRemove,
  disabled,
}: {
  uf: UploadFile;
  onRemove: () => void;
  disabled: boolean;
}) {
  const statusColor: Record<FileStatus, string> = {
    queued:    'var(--text-subtle)',
    uploading: 'var(--orange)',
    done:      'var(--green)',
    error:     'var(--pink)',
  };

  const statusLabel: Record<FileStatus, string> = {
    queued:    'Wartend',
    uploading: `${uf.progress}%`,
    done:      uf.isDuplicate ? 'Duplikat' : 'Fertig',
    error:     'Fehler',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '10px 12px',
      }}
      data-testid="file-row"
    >
      {/* Thumbnail oder PDF-Icon */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          overflow: 'hidden',
          flexShrink: 0,
          background: 'var(--card-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
        }}
      >
        {uf.previewUrl ? (
          <img
            src={uf.previewUrl}
            alt={uf.file.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span aria-hidden="true">📄</span>
        )}
      </div>

      {/* Name + Größe */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            fontSize: 13,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={uf.file.name}
        >
          {uf.file.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {formatFileSize(uf.file.size)}
          {uf.error && (
            <span style={{ color: 'var(--pink)', marginLeft: 8 }}>— {uf.error}</span>
          )}
        </div>
      </div>

      {/* Progress-Bar (nur beim Uploaden) */}
      {uf.status === 'uploading' && (
        <div
          style={{
            width: 80,
            height: 4,
            background: 'var(--border)',
            borderRadius: 2,
            overflow: 'hidden',
            flexShrink: 0,
          }}
          role="progressbar"
          aria-valuenow={uf.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              height: '100%',
              width: `${uf.progress}%`,
              background: 'var(--orange)',
              transition: 'width 0.15s',
            }}
          />
        </div>
      )}

      {/* Status-Label */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: statusColor[uf.status],
          flexShrink: 0,
          minWidth: 52,
          textAlign: 'right',
        }}
      >
        {statusLabel[uf.status]}
      </span>

      {/* Entfernen-Button */}
      <button
        type="button"
        className="ghost"
        onClick={onRemove}
        disabled={disabled && uf.status === 'uploading'}
        aria-label={`"${uf.file.name}" entfernen`}
        style={{ padding: '4px 6px', fontSize: 14, color: 'var(--text-subtle)', flexShrink: 0 }}
        data-testid="remove-button"
      >
        &times;
      </button>
    </div>
  );
}
