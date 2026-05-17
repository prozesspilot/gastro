import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchCustomers,
  fetchReceipts,
  fetchTenants,
  getActiveTenantId,
} from '../api';
import { useDebounce } from '../hooks/useDebounce';
import type { Customer, Receipt, Tenant } from '../types';

type ResultKind = 'tenant' | 'customer' | 'receipt';

interface SearchResult {
  kind: ResultKind;
  id: string;
  title: string;
  sub: string;
  path: string;
  icon: string;
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export default function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 300);
  const inputRef = useRef<HTMLInputElement>(null);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Daten laden bei Öffnen
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const tList = await fetchTenants();
        if (cancelled) return;
        setTenants(tList);

        const stored = getActiveTenantId();
        const id = stored && tList.some((t) => t.id === stored)
          ? stored
          : tList[0]?.id ?? null;

        if (cancelled) return;
        setActiveTenantId(id);

        if (id) {
          const [cList, rList] = await Promise.all([
            fetchCustomers(id).catch(() => [] as Customer[]),
            fetchReceipts(undefined).catch(() => [] as Receipt[]),
          ]);
          if (cancelled) return;
          setCustomers(cList);
          setReceipts(rList);
        } else {
          setCustomers([]);
          setReceipts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [open]);

  // Reset bei Schließen
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return;
  }, [open]);

  const grouped = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) {
      return { tenants: [], customers: [], receipts: [] };
    }

    const tenantHits: SearchResult[] = tenants
      .filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
      .slice(0, 5)
      .map((t) => ({
        kind: 'tenant',
        id: t.id,
        title: t.name,
        sub: t.slug,
        path: `/tenants/${t.id}/customers`,
        icon: '🏢',
      }));

    const customerHits: SearchResult[] = activeTenantId
      ? customers
          .filter((c) => c.display_name.toLowerCase().includes(q))
          .slice(0, 5)
          .map((c) => ({
            kind: 'customer',
            id: c.id,
            title: c.display_name,
            sub: c.id,
            path: `/tenants/${activeTenantId}/customers/${c.id}`,
            icon: '👤',
          }))
      : [];

    const receiptHits: SearchResult[] = receipts
      .filter((r) => {
        const name = r.file_name.toLowerCase();
        if (name.includes(q)) return true;
        const supplier = (r.extracted_data?.vendor_name ?? '').toLowerCase();
        if (supplier.includes(q)) return true;
        return false;
      })
      .slice(0, 6)
      .map((r) => {
        const id = r.id;
        return {
          kind: 'receipt' as const,
          id,
          title: r.extracted_data?.vendor_name ?? r.file_name,
          sub: `${r.file_type.toUpperCase()} · ${statusLabel(r.status)}`,
          path: `/receipts/${id}`,
          icon: '📋',
        };
      });

    return { tenants: tenantHits, customers: customerHits, receipts: receiptHits };
  }, [debounced, tenants, customers, receipts, activeTenantId]);

  const flat = useMemo(() => {
    return [...grouped.tenants, ...grouped.customers, ...grouped.receipts];
  }, [grouped]);

  const totalCount = flat.length;

  // Active-Index zurücksetzen wenn neue Resultate
  useEffect(() => {
    setActiveIndex(0);
  }, [debounced]);

  // Keyboard-Navigation
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (totalCount === 0 ? 0 : (i + 1) % totalCount));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (totalCount === 0 ? 0 : (i - 1 + totalCount) % totalCount));
        return;
      }
      if (e.key === 'Enter') {
        const item = flat[activeIndex];
        if (item) {
          e.preventDefault();
          navigate(item.path);
          onClose();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, totalCount, activeIndex, flat, navigate, onClose]);

  if (!open) return null;

  return (
    <div
      className="global-search-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-search-title"
    >
      <div
        className="global-search-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="global-search-input-row">
          <span className="global-search-icon" aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            id="global-search-title"
            type="text"
            placeholder="Suche nach Mandanten, Kunden oder Belegen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Globale Suche"
          />
          {loading && <span className="spinner" style={{ width: 16, height: 16 }} />}
        </div>

        <div className="global-search-results">
          {!debounced.trim() ? (
            <div className="global-search-empty">
              💡 Tippen Sie etwas, um in Mandanten, Kunden und Belegen zu suchen.
            </div>
          ) : totalCount === 0 ? (
            <div className="global-search-empty">
              🔎 Nichts gefunden für „{debounced}"
            </div>
          ) : (
            <>
              <ResultGroup
                label="Mandanten"
                results={grouped.tenants}
                offset={0}
                activeIndex={activeIndex}
                onPick={(item) => { navigate(item.path); onClose(); }}
              />
              <ResultGroup
                label="Kunden"
                results={grouped.customers}
                offset={grouped.tenants.length}
                activeIndex={activeIndex}
                onPick={(item) => { navigate(item.path); onClose(); }}
              />
              <ResultGroup
                label="Belege"
                results={grouped.receipts}
                offset={grouped.tenants.length + grouped.customers.length}
                activeIndex={activeIndex}
                onPick={(item) => { navigate(item.path); onClose(); }}
              />
            </>
          )}
        </div>

        <div className="global-search-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd>navigieren</span>
          <span><kbd>↵</kbd>öffnen</span>
          <span><kbd>esc</kbd>schließen</span>
        </div>
      </div>
    </div>
  );
}

function ResultGroup({
  label,
  results,
  offset,
  activeIndex,
  onPick,
}: {
  label: string;
  results: SearchResult[];
  offset: number;
  activeIndex: number;
  onPick: (item: SearchResult) => void;
}) {
  if (results.length === 0) return null;
  return (
    <>
      <div className="global-search-section-label">{label}</div>
      {results.map((item, i) => {
        const idx = offset + i;
        const isActive = idx === activeIndex;
        return (
          <div
            key={item.id}
            className={`global-search-item${isActive ? ' active' : ''}`}
            onClick={() => onPick(item)}
            onMouseEnter={() => { /* could update activeIndex but kept stable */ }}
            role="option"
            aria-selected={isActive}
          >
            <span className="global-search-item-icon">{item.icon}</span>
            <div className="global-search-item-body">
              <div className="global-search-item-title">{item.title}</div>
              <div className="global-search-item-sub">{item.sub}</div>
            </div>
            <span className="badge info" style={{ flexShrink: 0 }}>{kindLabel(item.kind)}</span>
          </div>
        );
      })}
    </>
  );
}

function kindLabel(k: ResultKind): string {
  switch (k) {
    case 'tenant':   return 'Mandant';
    case 'customer': return 'Kunde';
    case 'receipt':  return 'Beleg';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'received':         return 'Empfangen';
    case 'extracting':       return 'OCR läuft';
    case 'extracted':        return 'Extrahiert';
    case 'categorizing':     return 'Kategorisiert';
    case 'categorized':      return 'Kategorisiert';
    case 'archiving':        return 'Archiviert';
    case 'archived':         return 'Archiviert';
    case 'exporting':        return 'Exportiert';
    case 'exported':         return 'Exportiert';
    case 'completed':        return 'Fertig';
    case 'requires_review':  return 'Prüfung';
    case 'error':            return 'Fehler';
    default:                 return status;
  }
}
