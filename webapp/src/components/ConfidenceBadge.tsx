interface Props {
  confidence: number | undefined | null;
  /** zeigt nur die Prozent-Pille ohne Häkchen/Warnung — für kompakte Tabellen-Spalten */
  compact?: boolean;
}

export default function ConfidenceBadge({ confidence, compact = false }: Props) {
  if (confidence === undefined || confidence === null) return null;
  const pct = Math.round(confidence * 100);

  let klass: 'active' | 'pending' | 'inactive' = 'active';
  let icon = '✓';
  if (pct < 60)        { klass = 'inactive'; icon = '⚠'; }
  else if (pct < 75)   { klass = 'pending';  icon = '·'; }

  return (
    <span className={`badge ${klass}`} title="OCR-Konfidenz">
      {!compact && <span aria-hidden="true">{icon}</span>}
      {pct}%
    </span>
  );
}
