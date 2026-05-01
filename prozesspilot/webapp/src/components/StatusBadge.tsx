import type { ReceiptStatus } from '../types';

interface Spec {
  label: string;
  klass: 'active' | 'info' | 'pending' | 'inactive' | 'purple';
  animated?: boolean;
}

const SPEC: Record<ReceiptStatus, Spec> = {
  received:        { label: 'Empfangen',     klass: 'info' },
  extracting:      { label: 'OCR läuft',     klass: 'info',     animated: true },
  extracted:       { label: 'Extrahiert',    klass: 'purple' },
  categorizing:    { label: 'Kategorisiert', klass: 'purple',   animated: true },
  categorized:     { label: 'Kategorisiert', klass: 'active' },
  archiving:       { label: 'Archiviert',    klass: 'active',   animated: true },
  archived:        { label: 'Archiviert',    klass: 'active' },
  exporting:       { label: 'Exportiert',    klass: 'active',   animated: true },
  exported:        { label: 'Exportiert',    klass: 'active' },
  completed:       { label: 'Fertig',        klass: 'active' },
  requires_review: { label: 'Prüfung nötig', klass: 'pending' },
  error:           { label: 'Fehler',        klass: 'inactive' },
};

// Backwards-Kompat für ältere Backend-Statuses (pending/processing/done):
function resolve(status: string): Spec {
  if (status in SPEC) return SPEC[status as ReceiptStatus];
  switch (status) {
    case 'pending':    return { label: 'Wartend',         klass: 'pending' };
    case 'processing': return { label: 'In Bearbeitung',  klass: 'info', animated: true };
    case 'done':       return { label: 'Fertig',          klass: 'active' };
    default:           return { label: status,            klass: 'info' };
  }
}

export default function StatusBadge({ status }: { status: string }) {
  const spec = resolve(status);
  return (
    <span className={`badge glow ${spec.klass}`}>
      {spec.label}{spec.animated ? '…' : ''}
    </span>
  );
}
