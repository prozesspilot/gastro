export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  uptime?: number;
  [key: string]: unknown;
}

export interface ReadyResponse {
  status: 'ok' | 'not_ready';
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
  if (!res.ok) throw new Error(`Ready-Check fehlgeschlagen: ${res.status}`);
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
