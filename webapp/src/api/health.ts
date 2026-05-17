// Entspricht dem tatsächlichen Backend-Response von GET /api/v1/health
export interface HealthResponse {
  ok: boolean;
  version?: string;
  timestamp?: string;
  uptime?: number;
  checks?: Record<string, string>;
  // Legacy-Feld (falls Backend-Version das noch schickt)
  status?: 'ok' | 'degraded' | 'down';
  [key: string]: unknown;
}

// Entspricht dem tatsächlichen Backend-Response von GET /api/v1/ready
export interface ReadyResponse {
  ok: boolean;
  db?: {
    connected: boolean;
    pool_size?: number | null;
    active_connections?: number | null;
  };
  redis?: {
    connected: boolean;
  };
  migrations?: {
    last_applied: string | null;
    total: number;
  };
  // Legacy-Felder
  status?: 'ok' | 'not_ready';
  checks?: Record<string, { status: 'ok' | 'fail'; message?: string }>;
  [key: string]: unknown;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/v1/health', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Health-Check fehlgeschlagen: ${res.status}`);
  return res.json() as Promise<HealthResponse>;
}

export async function fetchReady(): Promise<ReadyResponse> {
  const res = await fetch('/api/v1/ready', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  // 503 ist kein Fehler — Body enthält die strukturierten Check-Ergebnisse
  if (!res.ok && res.status !== 503) throw new Error(`Ready-Check fehlgeschlagen: ${res.status}`);
  return res.json() as Promise<ReadyResponse>;
}

export async function pingUrl(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    await fetch(url, { mode: 'no-cors', signal: ctrl.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}
