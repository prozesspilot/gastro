interface Props {
  category?: string | null;
  label?: string | null;
}

interface Style { bg: string; border: string; color: string; }

const COLORS: Record<string, Style> = {
  wareneinkauf_food:      { bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.30)',  color: '#34d399' },
  wareneinkauf_nonfood:   { bg: 'rgba(45,212,191,0.10)',  border: 'rgba(45,212,191,0.30)',  color: '#2dd4bf' },
  betriebskosten_energie: { bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.30)',  color: '#fbbf24' },
  miete:                  { bg: 'rgba(88,166,255,0.10)',  border: 'rgba(88,166,255,0.30)',  color: '#58a6ff' },
  personal:               { bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.30)', color: '#a78bfa' },
  versicherung:           { bg: 'rgba(244,114,182,0.10)', border: 'rgba(244,114,182,0.30)', color: '#f472b6' },
  marketing:              { bg: 'rgba(251,146,60,0.10)',  border: 'rgba(251,146,60,0.30)',  color: '#fb923c' },
  reise:                  { bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.30)',  color: '#fbbf24' },
  bewirtung:              { bg: 'rgba(217,70,239,0.10)',  border: 'rgba(217,70,239,0.30)',  color: '#d946ef' },
  buerokosten:            { bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.30)',  color: '#60a5fa' },
  reparatur:              { bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.30)', color: '#f87171' },
  steuer:                 { bg: 'rgba(168,85,247,0.10)',  border: 'rgba(168,85,247,0.30)',  color: '#a855f7' },
  kommunikation:          { bg: 'rgba(45,212,191,0.10)',  border: 'rgba(45,212,191,0.30)',  color: '#2dd4bf' },
  sonstige_aufwand:       { bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.30)', color: '#94a3b8' },
};

const FALLBACK: Style = { bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)', color: '#a78bfa' };

export default function CategoryBadge({ category, label }: Props) {
  if (!category && !label) return null;
  const text = label || category || '';
  const style = (category && COLORS[category]) || FALLBACK;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.color,
      }}
    >
      {text}
    </span>
  );
}

export function categoryColorVar(category?: string | null): string {
  if (!category) return FALLBACK.color;
  return (COLORS[category] ?? FALLBACK).color;
}
