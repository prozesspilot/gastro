import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  toast: (type: ToastType, message: string) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const MAX_TOASTS = 3;
const TIMEOUT_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => {
        const next = [...prev, { id, type, message }];
        return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
      });
      setTimeout(() => dismiss(id), TIMEOUT_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastCtx>(() => ({ toast: push, dismiss }), [push, dismiss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (hovered) return;
    const t = setTimeout(onDismiss, TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [hovered, onDismiss]);

  const icon = {
    success: '✓',
    error:   '⚠',
    info:    'ℹ',
    warning: '⚠',
  }[toast.type];

  return (
    <div
      className={`toast toast-${toast.type}`}
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="toast-icon" aria-hidden="true">{icon}</span>
      <span className="toast-message">{toast.message}</span>
      <button
        type="button"
        className="toast-close"
        onClick={onDismiss}
        aria-label="Schließen"
      >
        ×
      </button>
    </div>
  );
}
