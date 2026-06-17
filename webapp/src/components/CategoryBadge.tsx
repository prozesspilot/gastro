interface Props {
  category?: string | null;
  label?: string | null;
}

interface Style { bg: string; border: string; color: string; }

// Light-Theme (T065): blasser Tint-Hintergrund + dunkler, gesättigter Text (WCAG AA).
const COLORS: Record<string, Style> = {
  wareneinkauf_food:      { bg: '#E9F8EF', border: '#C6EDD5', color: '#128040' },
  wareneinkauf_nonfood:   { bg: '#E3F6F3', border: '#BFE9E2', color: '#0F766E' },
  betriebskosten_energie: { bg: '#FDF0E3', border: '#F6DEC0', color: '#B45309' },
  miete:                  { bg: '#ECF8FE', border: '#CDEBFA', color: '#0879C2' },
  personal:               { bg: '#F1ECFD', border: '#DED2FB', color: '#6D28D9' },
  versicherung:           { bg: '#FCE9F2', border: '#F6CFE0', color: '#BE185D' },
  marketing:              { bg: '#FDEFE6', border: '#F8D6C2', color: '#C2410C' },
  reise:                  { bg: '#FDF7E3', border: '#F4E6B5', color: '#A16207' },
  bewirtung:              { bg: '#FBEAFB', border: '#F3CFF3', color: '#A21CAF' },
  buerokosten:            { bg: '#E6F4FE', border: '#C4E5FB', color: '#0369A1' },
  reparatur:              { bg: '#FDECEC', border: '#F6CDCD', color: '#C13438' },
  steuer:                 { bg: '#F3ECFD', border: '#E0D0FA', color: '#7E22CE' },
  kommunikation:          { bg: '#E3F6F3', border: '#BFE9E2', color: '#0F766E' },
  sonstige_aufwand:       { bg: '#EEF2F7', border: '#DDE4EC', color: '#4E5A6B' },
};

const FALLBACK: Style = { bg: '#EEF2F7', border: '#DDE4EC', color: '#4E5A6B' };

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
