import type { CSSProperties } from 'react';

type Size = number | string;

function toCss(value: Size): string {
  return typeof value === 'number' ? `${value}px` : value;
}

export function SkeletonLine({
  width = '100%',
  height = 14,
  style,
}: {
  width?: Size;
  height?: Size;
  style?: CSSProperties;
}) {
  return (
    <div
      className="skeleton skeleton-shimmer"
      aria-hidden="true"
      style={{
        width: toCss(width),
        height: toCss(height),
        ...style,
      }}
    />
  );
}

export function SkeletonBlock({
  height = 80,
  width = '100%',
  style,
}: {
  height?: Size;
  width?: Size;
  style?: CSSProperties;
}) {
  return (
    <div
      className="skeleton skeleton-shimmer"
      aria-hidden="true"
      style={{
        width: toCss(width),
        height: toCss(height),
        borderRadius: 12,
        ...style,
      }}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number } = {}) {
  return (
    <div className="card" aria-busy="true" style={{ padding: 20 }}>
      <SkeletonLine width="40%" height={12} style={{ marginBottom: 14 }} />
      <SkeletonLine width="80%" height={20} style={{ marginBottom: 16 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={`${60 + ((i * 17) % 30)}%`}
          height={12}
          style={{ marginBottom: 8 }}
        />
      ))}
    </div>
  );
}

export function SkeletonKpi() {
  return (
    <div className="kpi-card" aria-busy="true">
      <div
        className="skeleton skeleton-shimmer"
        aria-hidden="true"
        style={{ width: 42, height: 42, borderRadius: 12, marginBottom: 16 }}
      />
      <SkeletonLine width="50%" height={10} style={{ marginBottom: 10 }} />
      <SkeletonLine width="35%" height={32} style={{ marginBottom: 8 }} />
      <SkeletonLine width="60%" height={10} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number } = {}) {
  return (
    <table aria-busy="true" aria-label="Lade Tabelle">
      <thead>
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i}>
              <SkeletonLine width="60%" height={10} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c}>
                <SkeletonLine
                  width={c === 0 ? '70%' : c === cols - 1 ? '40%' : '55%'}
                  height={12}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
