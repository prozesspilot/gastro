/**
 * M14 — Auth-API
 *
 * Bewusst KEIN apiRequest (das den Bearer-Header anhängt) — diese Endpoints
 * funktionieren ohne Bearer, und das Refresh-Cookie wird per `credentials: 'include'`
 * automatisch mitgesendet.
 */

import { ApiError, unwrap } from './_client';

const BASE = '/api/v1/auth';

export interface AuthUserDto {
  id: string;
  email: string;
  display_name: string;
  tenant_id: string | null;
  permissions: string[];
  preset: string | null;
  is_active: boolean;
  password_must_change: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  user: AuthUserDto;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let parsed: unknown;
    try { parsed = await res.json(); } catch { /* ignore */ }
    const err = parsed as { error?: { code?: string; message?: string; details?: unknown } } | undefined;
    throw new ApiError(res.status, err?.error?.message ?? res.statusText, err?.error?.code, err?.error?.details);
  }
  if (res.status === 204) return undefined as T;
  return unwrap<T>(await res.json());
}

async function getJson<T>(path: string, accessToken?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  if (!res.ok) {
    let parsed: unknown;
    try { parsed = await res.json(); } catch { /* ignore */ }
    const err = parsed as { error?: { code?: string; message?: string } } | undefined;
    throw new ApiError(res.status, err?.error?.message ?? res.statusText, err?.error?.code);
  }
  return unwrap<T>(await res.json());
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return postJson<LoginResponse>('/login', { email, password });
}

export async function refresh(): Promise<LoginResponse> {
  return postJson<LoginResponse>('/refresh');
}

export async function logout(): Promise<void> {
  await postJson<{ logged_out: boolean }>('/logout');
}

export async function me(accessToken: string): Promise<{ user: AuthUserDto }> {
  return getJson<{ user: AuthUserDto }>('/me', accessToken);
}

export async function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch(`${BASE}/change-password`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) {
    let parsed: unknown;
    try { parsed = await res.json(); } catch { /* ignore */ }
    const err = parsed as { error?: { code?: string; message?: string } } | undefined;
    throw new ApiError(res.status, err?.error?.message ?? res.statusText, err?.error?.code);
  }
}
