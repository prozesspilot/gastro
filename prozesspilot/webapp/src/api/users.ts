/**
 * M14 — Users-API
 */

import { apiRequest } from './_client';
import type { AuthUserDto } from './auth';

const BASE = '/users';

export interface CreateUserInput {
  email: string;
  display_name: string;
  preset: 'super_admin' | 'admin' | 'operator' | 'viewer' | 'custom';
  permissions?: string[];
  tenant_id?: string | null;
  temporary_password?: string;
}

export interface UpdateUserInput {
  display_name?: string;
  preset?: 'super_admin' | 'admin' | 'operator' | 'viewer' | 'custom';
  permissions?: string[];
  is_active?: boolean;
  locked_until?: null;
  failed_attempts?: 0;
}

export interface CreateUserResponse {
  user: AuthUserDto;
  temporary_password: string;
}

export interface ResetPasswordResponse {
  user: AuthUserDto | null;
  temporary_password: string;
}

export async function listUsers(): Promise<AuthUserDto[]> {
  const res = await apiRequest<{ ok: true; data: { users: AuthUserDto[] } } | { users: AuthUserDto[] }>(BASE);
  const payload = (res as { data?: { users: AuthUserDto[] } }).data ?? (res as { users: AuthUserDto[] });
  return payload.users;
}

export async function getUser(id: string): Promise<AuthUserDto> {
  const res = await apiRequest<{ ok: true; data: { user: AuthUserDto } } | { user: AuthUserDto }>(`${BASE}/${id}`);
  const payload = (res as { data?: { user: AuthUserDto } }).data ?? (res as { user: AuthUserDto });
  return payload.user;
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResponse> {
  const res = await apiRequest<{ ok: true; data: CreateUserResponse } | CreateUserResponse>(BASE, {
    method: 'POST',
    body: input,
  });
  return (res as { data?: CreateUserResponse }).data ?? (res as CreateUserResponse);
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<AuthUserDto> {
  const res = await apiRequest<{ ok: true; data: { user: AuthUserDto } } | { user: AuthUserDto }>(
    `${BASE}/${id}`,
    { method: 'PATCH', body: input },
  );
  const payload = (res as { data?: { user: AuthUserDto } }).data ?? (res as { user: AuthUserDto });
  return payload.user;
}

export async function deleteUser(id: string): Promise<AuthUserDto | null> {
  const res = await apiRequest<{ ok: true; data: { user: AuthUserDto } } | { user: AuthUserDto }>(
    `${BASE}/${id}`,
    { method: 'DELETE' },
  );
  const payload = (res as { data?: { user: AuthUserDto } }).data ?? (res as { user: AuthUserDto });
  return payload.user;
}

export async function resetUserPassword(id: string): Promise<ResetPasswordResponse> {
  const res = await apiRequest<{ ok: true; data: ResetPasswordResponse } | ResetPasswordResponse>(
    `${BASE}/${id}/reset-password`,
    { method: 'POST', body: {} },
  );
  return (res as { data?: ResetPasswordResponse }).data ?? (res as ResetPasswordResponse);
}
