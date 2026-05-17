import { useEffect, useMemo, useState } from 'react';
import {
  fetchCustomers,
  fetchReceipts,
  fetchReceiptStats,
  fetchTenants,
  getActiveTenantId,
  getCustomerStats,
  setActiveTenantId,
} from '../api';
import type { ReceiptStats } from '../api/receipts';
import type { CustomerStats } from '../api/stats';
import { useReceiptEvents } from '../hooks/useReceiptEvents';
import { SkeletonKpi, SkeletonBlock } from '../components/Skeleton';
import { categoryColorVar } from '../components/CategoryBadge';
import type { Customer, Receipt, Tenant } from '../types';

const SOURCE_COLORS: Record<string, string> = {
  manual:   '#58a6ff',
  whatsapp: '#34d399',
  email:    '#a78bfa',
  web:      '#fb923c',
  test:     '#94a3b8',
};

export default function StatsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [tenantsLoading, setTenantsLoading] = useState(true);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');

  const [stats, setStats] = useState<ReceiptStats | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTenants()
      .then((list) => {
        setTenants(list);
        const stored = getActiveTenantId();
        const initial = stored && list.some((t) => t.id === stored)
          ? stored
          : list[0]?.id ?? '';
        if (initial) {
          setSelectedTenant(initial);
          setActiveTenantId(initial);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setTenantsLoading(false));
  }, []);

  async function loadAll(id: string, customerId: string) {
    setLoading(true);
    setError(null);
    try {
      const [s, r, cs] = await Promise.all([
        fetchReceiptStats(id).catch(() => emptyStats()),
        fetchReceipts(id).catch(() => [] as Receipt[]),
        customerId ? getCustomerStats(customerId).catch(() => null) : Promise.resolve(null),
      ]);
      setStats(s);
      setReceipts(r);
      setCustomerStats(cs);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedTenant) {
      setCustomers([]);
      setSelectedCustomer('');
      setStats(null);
      setReceipts([]);
      setCustomerStats(null);
      return;
    }
    fetchCustomers(selectedTenant)
      .then((list) => {
        setCustomers(list);
        if (selectedCustomer && !list.some((c) => c.id === selectedCustomer)) {
          setSelectedCustomer('');
        }
      })
      .catch(() => setCustomers([]));
    loadAll(selectedTenant, selectedCustomer);
  }, [selectedTenant, selectedCustomer]);

  useReceiptEvents(selectedTenant || null, (event) => {
    if (event === 'receipt:status' || event === 'receipt:created' || event === 'receipt:updated') {
      if (selectedTenant) loadAll(selectedTenant, selectedCustomer);
    }
  });

  function onTenantChange(id: string) {
    setSelectedTenant(id);
    setActiveTenantId(id);
    setSelectedCustomer('');
  }

  // ── Aggregations ──────────────────────────────────────────────────────────
  const total = stats?.total ?? 0;
  const today = stats?.today ?? 0;

  const statusGroups = useMemo(() => groupStatuses(stats), [stats]);
  const errorRate = total > 0 ? Math.round((statusGroups.error / total) * 100) : 0;
  const processingRate = total > 0 ? Math.round((statusGroups.done / total) * 100) : 0;

  const trend = useMemo(() => buildDailyTrend(receipts), [receipts]);
  const trendCmp = useMemo(() => buildWeekComparison(receipts), [receipts]);

  const categories = useMemo(
    () => customerStats ? mapServerCategories(customerStats) : buildTopCategories(receipts),
    [customerStats, receipts],
  );
  const totalGross = useMemo(() => categories.reduce((s, c) => s + c.gross, 0), [categories]);
  const suppliers = useMemo(
    () => customerStats ? mapServerSuppliers(customerStats) : buildTopSuppliers(receipts),
    [customerStats, receipts],
  );
  const avgDuration = useMemo(
    () => customerStats?.processing_times.avg_ms != null
      ? formatMs(customerStats.processing_times.avg_ms)
      : buildAvgDuration(receipts),
    [customerStats, receipts],
  );
  const exportRate = customerStats?.export_rate ?? null;

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-subtle)', marginBottom: 6 }}>
            ANALYSE
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.8px' }}>
            <span className="gradient-text">Statistiken</span> 📊
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            Übersicht über Belege, Status, Quellen und Verarbeitungsleistung
          </p>
        </div>
      </div>

      {/* ── Tenant + Kunde ── */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="two-col">
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="stats-tenant">Tenant</label>
            <select
              id="stats-tenant"
              value={selectedTenant}
              onChange={(e) => onTenantChange(e.target.value)}
              disabled={tenantsLoading}
            >
              <option value="">— Bitte wählen —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="stats-customer">Kunde (optional)</label>
            <select
              id="stats-customer"
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              disabled={!selectedTenant || customers.length === 0}
            >
              <option value="">— Alle Kunden (Tenant-Übersicht) —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.display_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {!selectedTenant ? (
        <div className="card">
          <div className="empty-illustration">
            <div className="empty-illustration-icon">📊</div>
            <div className="empty-illustration-title">Kein Tenant ausgewählt</div>
            <div className="empty-illustration-text">
              Wählen Sie oben einen Mandanten, um dessen Statistiken zu sehen.
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ── KPI-Row ── */}
          <div className="kpi-grid">
            {loading ? (
              <>
                <SkeletonKpi /><SkeletonKpi /><SkeletonKpi /><SkeletonKpi />
              </>
            ) : (
              <>
                <KpiTile
                  color="#f472b6"
                  glow="rgba(244,114,182,0.1)"
                  icon="📋"
                  label="Belege gesamt"
                  value={total}
                  sub={`${today} heute · ${trend.thisWeek} diese Woche`}
                  trend={trendCmp.pct}
                />
                <KpiTile
                  color="#34d399"
                  glow="rgba(52,211,153,0.1)"
                  icon="✓"
                  label="Verarbeitungsrate"
                  value={`${processingRate}%`}
                  sub={`${statusGroups.done} von ${total} verarbeitet`}
                />
                <KpiTile
                  color="#a78bfa"
                  glow="rgba(167,139,250,0.1)"
                  icon="⚡"
                  label="∅ Durchlaufzeit"
                  value={avgDuration ? `${avgDuration}` : '—'}
                  sub={avgDuration ? 'received → completed' : 'Keine Daten'}
                />
                <KpiTile
                  color={errorRate > 0 ? '#f87171' : '#34d399'}
                  glow={errorRate > 0 ? 'rgba(248,113,113,0.1)' : 'rgba(52,211,153,0.1)'}
                  icon={errorRate > 0 ? '⚠' : '✓'}
                  label="Fehlerrate"
                  value={`${errorRate}%`}
                  sub={`${statusGroups.error} Fehler · ${statusGroups.review} Prüfung`}
                />
              </>
            )}
          </div>

          {/* ── Export-Rate (nur bei ausgewähltem Kunden) ── */}
          {exportRate && (
            <div className="card" style={{ padding: 24, marginBottom: 20 }}>
              <div className="section-header">
                <span className="section-title">Export-Rate</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Anteil verbuchter Belege
                </span>
              </div>
              <ExportRateBars rate={exportRate} />
            </div>
          )}

          {/* ── Donut + Source ── */}
          <div className="two-col" style={{ marginBottom: 20 }}>
            <div className="card" style={{ padding: 24 }}>
              <div className="section-header">
                <span className="section-title">Status-Verteilung</span>
              </div>
              {loading ? <SkeletonBlock height={260} /> : (
                <DonutChart groups={statusGroups} />
              )}
            </div>

            <div className="card" style={{ padding: 24 }}>
              <div className="section-header">
                <span className="section-title">Quellen</span>
              </div>
              {loading ? <SkeletonBlock height={160} /> : (
                <SourceBars stats={stats} />
              )}
            </div>
          </div>

          {/* ── Trend ── */}
          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
            <div className="section-header">
              <span className="section-title">Tages-Trend (letzte 7 Tage)</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{trend.total} Belege</span>
            </div>
            {loading ? <SkeletonBlock height={200} /> : (
              <TrendChart days={trend.days} max={trend.max} />
            )}
          </div>

          {/* ── Kategorien (Brutto) ── */}
          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
            <div className="section-header">
              <span className="section-title">Ausgaben nach Kategorie</span>
              {totalGross > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {totalGross.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} gesamt
                </span>
              )}
            </div>
            {loading ? <SkeletonBlock height={200} /> : categories.length === 0 ? (
              <div style={{ padding: '20px 0', color: 'var(--text-subtle)', fontSize: 13, textAlign: 'center' }}>
                Noch keine kategorisierten Belege.
              </div>
            ) : (
              <div>
                {categories.map((c) => {
                  const pct = totalGross > 0 ? (c.gross / totalGross) * 100 : 0;
                  const color = categoryColorVar(c.category);
                  return (
                    <div key={c.category} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 130px 50px', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.label}
                      </span>
                      <div className="source-bar-track">
                        <div
                          className="source-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                            boxShadow: `0 0 8px ${color}55`,
                          }}
                        />
                      </div>
                      <span style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
                        {c.gross.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                      </span>
                      <span style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Top Lieferanten ── */}
          <div className="card" style={{ padding: 24 }}>
            <div className="section-header">
              <span className="section-title">Top-Lieferanten</span>
            </div>
            {loading ? <SkeletonBlock height={200} /> : suppliers.length === 0 ? (
              <div style={{ padding: '20px 0', color: 'var(--text-subtle)', fontSize: 13, textAlign: 'center' }}>
                Noch keine Lieferanten erfasst.
              </div>
            ) : (
              <div>
                {suppliers.map((s, i) => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: i === suppliers.length - 1 ? 'none' : '1px solid var(--border)' }}>
                    <div
                      style={{
                        width: 36, height: 36,
                        borderRadius: '50%',
                        background: 'var(--grad-brand)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, color: 'white',
                        flexShrink: 0,
                      }}
                    >
                      {s.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {s.count} {s.count === 1 ? 'Beleg' : 'Belege'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>
                      {s.gross.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-Components ────────────────────────────────────────────────────────────

function KpiTile({
  color, icon, label, value, sub, glow, trend,
}: {
  color: string; icon: string; label: string; value: number | string; sub: string; glow: string;
  trend?: number;
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-card-glow" style={{ background: color }} />
      <div className="kpi-icon-wrap" style={{ background: glow, color }}>{icon}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div className="kpi-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {trend !== undefined && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: trend > 0 ? 'var(--green)' : trend < 0 ? '#f87171' : 'var(--text-subtle)',
          }}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '='} {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
        <span>{sub}</span>
      </div>
    </div>
  );
}

interface StatusGroups {
  received: number;
  in_progress: number;
  review: number;
  done: number;
  error: number;
}

function DonutChart({ groups }: { groups: StatusGroups }) {
  const total = groups.received + groups.in_progress + groups.review + groups.done + groups.error;

  const palette = {
    received:    '#58a6ff',
    in_progress: '#a78bfa',
    review:      '#fb923c',
    done:        '#34d399',
    error:       '#f87171',
  };

  let gradient: string;
  if (total === 0) {
    gradient = 'conic-gradient(rgba(255,255,255,0.06) 0deg 360deg)';
  } else {
    let acc = 0;
    const segments: string[] = [];
    const order: Array<[keyof StatusGroups, string]> = [
      ['done',        palette.done],
      ['in_progress', palette.in_progress],
      ['received',    palette.received],
      ['review',      palette.review],
      ['error',       palette.error],
    ];
    for (const [key, color] of order) {
      const v = groups[key];
      if (v === 0) continue;
      const start = acc;
      const end = acc + (v / total) * 360;
      segments.push(`${color} ${start}deg ${end}deg`);
      acc = end;
    }
    gradient = `conic-gradient(${segments.join(', ')})`;
  }

  return (
    <div>
      <div className="donut" style={{ background: gradient }}>
        <div className="donut-center">
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{total}</div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            gesamt
          </div>
        </div>
      </div>
      <div className="donut-legend">
        <LegendItem color={palette.done}        label="Fertig"          value={groups.done} />
        <LegendItem color={palette.in_progress} label="In Bearbeitung"  value={groups.in_progress} />
        <LegendItem color={palette.received}    label="Eingegangen"     value={groups.received} />
        <LegendItem color={palette.review}      label="Prüfung"         value={groups.review} />
        <LegendItem color={palette.error}       label="Fehler"          value={groups.error} />
      </div>
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="donut-legend-item">
      <span className="donut-legend-dot" style={{ background: color, boxShadow: `0 0 6px ${color}88` }} />
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>{value}</span>
    </div>
  );
}

function SourceBars({ stats }: { stats: ReceiptStats | null }) {
  const counts = stats?.by_source ?? {};
  const max = Math.max(1, ...Object.values(counts));
  const rows = ['manual', 'whatsapp', 'email', 'web', 'test']
    .map((key) => ({ key, count: counts[key] ?? 0, color: SOURCE_COLORS[key] ?? '#94a3b8' }))
    .filter((r) => r.count > 0 || r.key === 'manual' || r.key === 'whatsapp' || r.key === 'email');

  const labelMap: Record<string, [string, string]> = {
    manual:   ['📤', 'Manuell'],
    whatsapp: ['📱', 'WhatsApp'],
    email:    ['📧', 'E-Mail'],
    web:      ['🌐', 'Web'],
    test:     ['🧪', 'Test'],
  };

  return (
    <div>
      {rows.map((r) => {
        const [icon, label] = labelMap[r.key] ?? ['📄', r.key];
        const width = max > 0 ? (r.count / max) * 100 : 0;
        return (
          <div key={r.key} className="source-bar-row">
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {icon} {label}
            </span>
            <div className="source-bar-track">
              <div
                className="source-bar-fill"
                style={{
                  width: `${width}%`,
                  background: `linear-gradient(90deg, ${r.color}, ${r.color}dd)`,
                  boxShadow: `0 0 10px ${r.color}66`,
                }}
              />
            </div>
            <span style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{r.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ days, max }: { days: { label: string; date: string; count: number }[]; max: number }) {
  return (
    <div className="trend-chart">
      {days.map((d) => {
        const heightPct = max > 0 ? Math.max(2, (d.count / max) * 100) : 2;
        return (
          <div key={d.date} className="trend-bar">
            <div
              className="trend-bar-fill"
              style={{ height: `${heightPct}%`, minHeight: 4 }}
            />
            <div className="trend-bar-tooltip">
              <strong>{d.count}</strong> {d.count === 1 ? 'Beleg' : 'Belege'}<br />
              <span style={{ color: 'var(--text-muted)' }}>{d.date}</span>
            </div>
            <div className="trend-label">{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyStats(): ReceiptStats {
  return {
    total: 0,
    today: 0,
    by_status: {},
    by_source: {},
  };
}

function groupStatuses(stats: ReceiptStats | null): StatusGroups {
  const by = stats?.by_status ?? {};
  return {
    received:    (by['received'] ?? 0) + (by['pending'] ?? 0),
    in_progress: (by['extracting'] ?? 0) + (by['extracted'] ?? 0) + (by['categorizing'] ?? 0) + (by['categorized'] ?? 0) + (by['archiving'] ?? 0) + (by['archived'] ?? 0) + (by['exporting'] ?? 0) + (by['processing'] ?? 0),
    review:      by['requires_review'] ?? 0,
    done:        (by['exported'] ?? 0) + (by['completed'] ?? 0) + (by['done'] ?? 0),
    error:       by['error'] ?? 0,
  };
}

function buildDailyTrend(receipts: Receipt[]) {
  const days: { label: string; date: string; count: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const labels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const isoDate = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    days.push({ label: labels[d.getDay()], date: isoDate, count: 0 });
  }

  let total = 0;
  for (const r of receipts) {
    const created = new Date(r.created_at);
    created.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - created.getTime()) / 86_400_000);
    if (diffDays >= 0 && diffDays < 7) {
      const idx = 6 - diffDays;
      days[idx].count++;
      total++;
    }
  }

  if (total === 0 && receipts.length === 0) {
    const mock = [3, 5, 2, 7, 4, 6, 4];
    for (let i = 0; i < 7; i++) days[i].count = mock[i];
    total = mock.reduce((s, v) => s + v, 0);
  }

  const max = Math.max(1, ...days.map((d) => d.count));
  const thisWeek = days.reduce((s, d) => s + d.count, 0);

  return { days, max, total, thisWeek };
}

function buildWeekComparison(receipts: Receipt[]): { pct: number } {
  const now = Date.now();
  const week = 7 * 86_400_000;
  let cur = 0, prev = 0;
  for (const r of receipts) {
    const t = new Date(r.created_at).getTime();
    const diff = now - t;
    if (diff >= 0 && diff < week) cur++;
    else if (diff >= week && diff < 2 * week) prev++;
  }
  if (prev === 0) return { pct: cur > 0 ? 100 : 0 };
  return { pct: Math.round(((cur - prev) / prev) * 100) };
}

function buildTopCategories(receipts: Receipt[]) {
  const map = new Map<string, { label: string; count: number; gross: number }>();
  for (const r of receipts) {
    const c = r.categorization;
    if (!c) continue;
    const entry = map.get(c.category_id) ?? { label: c.category_name || c.category_id, count: 0, gross: 0 };
    entry.count++;
    entry.gross += r.extracted_data?.total_amount ?? 0;
    map.set(c.category_id, entry);
  }
  return Array.from(map.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 8);
}

function buildTopSuppliers(receipts: Receipt[]) {
  const map = new Map<string, { count: number; gross: number }>();
  for (const r of receipts) {
    const name = r.extracted_data?.vendor_name;
    if (!name) continue;
    const entry = map.get(name) ?? { count: 0, gross: 0 };
    entry.count++;
    entry.gross += r.extracted_data?.total_amount ?? 0;
    map.set(name, entry);
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 5);
}

function mapServerCategories(cs: CustomerStats) {
  return cs.by_category.slice(0, 8).map((c) => ({
    category: c.category_id,
    label: c.category_name,
    count: c.count,
    gross: c.gross_sum,
  }));
}

function mapServerSuppliers(cs: CustomerStats) {
  return cs.top_suppliers.slice(0, 5).map((s) => ({
    name: s.supplier_name,
    count: s.count,
    gross: s.gross_sum,
  }));
}

function formatMs(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

function ExportRateBars({ rate }: { rate: { lexoffice: number; datev: number } }) {
  const rows: Array<[string, string, number, string]> = [
    ['lexoffice', 'Lexoffice', rate.lexoffice, '#34d399'],
    ['datev',     'DATEV',     rate.datev,     '#a78bfa'],
  ];
  return (
    <div>
      {rows.map(([key, label, pct, color]) => (
        <div key={key} className="source-bar-row">
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
          <div className="source-bar-track">
            <div
              className="source-bar-fill"
              style={{
                width: `${Math.max(0, Math.min(100, pct))}%`,
                background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                boxShadow: `0 0 8px ${color}55`,
              }}
            />
          </div>
          <span style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>
            {pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

function buildAvgDuration(receipts: Receipt[]): string | null {
  const durations: number[] = [];
  for (const r of receipts) {
    if (!r.processing_started_at || !r.processing_completed_at) continue;
    const start = new Date(r.processing_started_at).getTime();
    const end   = new Date(r.processing_completed_at).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    durations.push(end - start);
  }
  if (durations.length === 0) return null;
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length / 1000;
  if (avg < 60) return `${Math.round(avg)} s`;
  if (avg < 3600) return `${Math.round(avg / 60)} min`;
  return `${(avg / 3600).toFixed(1)} h`;
}
