import { useEffect, useState } from 'react';
import { fetchTenants, fetchCustomers, fetchReceipts, updateReceiptStatus, uploadReceipt } from '../api';
import type { Tenant, Customer, Receipt } from '../types';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function UploadPage() {
  // ── Tenants & Customers ──
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(false);

  // ── File Upload ──
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // ── Upload Status ──
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [progress, setProgress] = useState(0);
  const [flashSuccess, setFlashSuccess] = useState(false);

  // ── Receipts List ──
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(true);
  const [autoRefreshActive, setAutoRefreshActive] = useState(false);

  // Load tenants on mount
  useEffect(() => {
    const loadTenants = async () => {
      try {
        const list = await fetchTenants();
        setTenants(list);
        if (list.length > 0) {
          setSelectedTenant(list[0].id);
        }
      } finally {
        setTenantsLoading(false);
      }
    };
    loadTenants();
  }, []);

  // Load customers when tenant changes
  useEffect(() => {
    if (!selectedTenant) {
      setCustomers([]);
      return;
    }

    setCustomersLoading(true);
    setSelectedCustomer('');
    fetchCustomers(selectedTenant)
      .then((list) => {
        setCustomers(list);
        if (list.length > 0) {
          setSelectedCustomer(list[0].id);
        }
        setCustomersLoading(false);
      })
      .catch(() => {
        setCustomersLoading(false);
      });
  }, [selectedTenant]);

  // Load receipts when tenant changes
  useEffect(() => {
    if (!selectedTenant) {
      setReceipts([]);
      return;
    }

    setReceiptsLoading(true);
    loadReceipts();
  }, [selectedTenant]);

  // Auto-refresh if pending/processing exist
  useEffect(() => {
    const inProgressStates = new Set([
      'received', 'extracting', 'extracted', 'categorizing', 'categorized',
      'archiving', 'archived', 'exporting', 'pending', 'processing',
    ]);
    const hasPending = receipts.some((r) => inProgressStates.has(r.status));
    setAutoRefreshActive(hasPending);

    if (!hasPending) return;

    const interval = setInterval(() => {
      if (selectedTenant) {
        loadReceipts();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [receipts, selectedTenant]);

  // Load receipts helper
  function loadReceipts() {
    if (!selectedTenant) return;
    fetchReceipts(selectedCustomer || undefined, {})
      .then((data) => {
        setReceipts(data);
        setReceiptsLoading(false);
      })
      .catch(() => {
        setReceiptsLoading(false);
      });
  }

  // ── Drag & Drop Handlers ──
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      acceptFile(files[0]);
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      acceptFile(files[0]);
    }
  }

  function acceptFile(file: File) {
    if (!isValidFileType(file)) {
      setUploadError('Nur PDF, JPG, PNG und TIFF Dateien werden akzeptiert.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`Datei ist zu groß (${formatFileSize(file.size)}). Maximal 10 MB erlaubt.`);
      return;
    }
    setSelectedFile(file);
    setUploadError('');
  }

  function isValidFileType(file: File): boolean {
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
    return validTypes.includes(file.type);
  }

  function removeFile() {
    setSelectedFile(null);
  }

  // ── Upload Handler ──
  async function handleUpload() {
    if (!selectedTenant || !selectedCustomer || !selectedFile) return;

    setUploading(true);
    setUploadError('');
    setUploadSuccess(false);
    setProgress(0);

    try {
      // Step 1 — creating receipt
      setProgress(30);
      const receipt = await uploadReceipt(selectedCustomer, selectedFile);

      // Step 2 — uploading (simuliertes Upload-Window)
      setProgress(70);
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Step 3 — done
      await updateReceiptStatus(receipt.id, 'completed');
      setProgress(100);

      // Erfolg
      setUploadSuccess(true);
      setSelectedFile(null);
      setFlashSuccess(true);
      setTimeout(() => setFlashSuccess(false), 1200);

      loadReceipts();
      setTimeout(() => {
        setUploadSuccess(false);
        setProgress(0);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload fehlgeschlagen';
      setUploadError(message);
      setProgress(0);
    } finally {
      setUploading(false);
    }
  }

  function handleRetry() {
    setUploadError('');
    if (selectedFile) {
      handleUpload();
    }
  }

  // ── Format file size ──
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ── Format date ──
  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ── Status Badge ──
  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'pending':
        return 'pending';
      case 'processing':
        return 'info';
      case 'done':
        return 'active';
      case 'error':
        return 'inactive';
      default:
        return 'info';
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'In der Warteschlange';
      case 'processing':
        return 'Wird verarbeitet';
      case 'done':
        return 'Fertig';
      case 'error':
        return 'Fehler';
      default:
        return status;
    }
  }

  const dropZoneClass =
    'drop-zone' +
    (isDragOver ? ' drag-over' : '') +
    (flashSuccess ? ' flash-success' : '');

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-subtle)', marginBottom: 6 }}>
            VERWALTUNG
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.8px' }}>
            <span className="gradient-text">Belege hochladen</span> 📤
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            PDF- oder Bilddateien direkt in die Verwaltung hochladen (max. 10 MB)
          </p>
        </div>
      </div>

      {/* ── Tenant & Customer Selection ── */}
      <div className="card" style={{ padding: 24, marginBottom: 28 }}>
        <div className="section-header" style={{ marginBottom: 20 }}>
          <span className="section-title">Tenant & Kunde wählen</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="field">
            <label>Tenant</label>
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              disabled={tenantsLoading}
            >
              <option value="">— Bitte wählen —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Kunde</label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              disabled={!selectedTenant || customersLoading || customers.length === 0}
            >
              <option value="">— Bitte wählen —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Upload Section ── */}
      <div className="card" style={{ padding: 28, marginBottom: 28 }}>
        <div className="section-header" style={{ marginBottom: 20 }}>
          <span className="section-title">Beleg hochladen</span>
        </div>

        {/* ── Error Message ── */}
        {uploadError && (
          <div className="error-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span>{uploadError}</span>
            {selectedFile && (
              <button className="secondary" onClick={handleRetry} disabled={uploading} style={{ flexShrink: 0 }}>
                ↻ Erneut versuchen
              </button>
            )}
          </div>
        )}

        {/* ── Success Message ── */}
        {uploadSuccess && <div className="success-box">Beleg erfolgreich hochgeladen!</div>}

        {/* ── Drag & Drop Zone ── */}
        <div
          className={dropZoneClass}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.tiff"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />

          {selectedFile ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 32 }}>✓</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  {selectedFile.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {formatFileSize(selectedFile.size)}
                </div>
              </div>
              <button
                className="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile();
                }}
                style={{ marginTop: 8 }}
                disabled={uploading}
              >
                × Entfernen
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                PDF, JPG oder PNG hierher ziehen
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                oder klicken zum Auswählen · max. 10 MB
              </div>
            </div>
          )}
        </div>

        {/* ── Progress Bar ── */}
        {(uploading || progress > 0) && (
          <div style={{ marginTop: 20 }}>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{progressLabel(progress)}</span>
              <span>{progress}%</span>
            </div>
          </div>
        )}

        {/* ── Upload Button ── */}
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            className="primary"
            onClick={handleUpload}
            disabled={!selectedTenant || !selectedCustomer || !selectedFile || uploading}
            style={{
              minWidth: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {uploading && <span className="spinner" />}
            {uploading ? 'Wird hochgeladen…' : 'Beleg hochladen'}
          </button>
        </div>
      </div>

      {/* ── Recent Uploads ── */}
      <div className="card" style={{ padding: 24 }}>
        <div className="section-header" style={{ marginBottom: 20 }}>
          <span className="section-title">Letzte Uploads</span>
          {autoRefreshActive && (
            <span style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="spinner" style={{ width: 12, height: 12 }} />
              Wird aktualisiert…
            </span>
          )}
        </div>

        {receiptsLoading ? (
          <div className="loading-center">
            <span className="spinner" />
            Wird geladen…
          </div>
        ) : receipts.length === 0 ? (
          <div className="empty">
            📭 Noch keine Belege hochgeladen
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Dateiname</th>
                <th>Kunde</th>
                <th>Status</th>
                <th>Datum</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td style={{ fontWeight: 500 }}>
                    {receipt.file_name || '—'}
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {receipt.customer_id.substring(0, 8)}…
                  </td>
                  <td>
                    <span className={`badge ${getStatusBadgeClass(receipt.status)}`}>
                      {getStatusLabel(receipt.status)}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {formatDate(receipt.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function progressLabel(p: number): string {
  if (p === 0) return 'Bereit';
  if (p < 50) return 'Beleg wird angelegt…';
  if (p < 100) return 'Datei wird hochgeladen…';
  return 'Fertig!';
}
