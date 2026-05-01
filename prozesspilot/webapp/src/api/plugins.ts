/**
 * Plugin-System API-Client
 */

import { apiRequest, unwrap } from './_client';

export interface Plugin {
  plugin_id: string;
  tenant_id: string;
  name: string;
  version: string;
  description?: string;
  webhook_url: string;
  hook_events: string[];
  enabled: boolean;
  created_at: string;
  updated_at?: string;
}

export interface PluginExecution {
  execution_id: string;
  plugin_id: string;
  hook_event: string;
  receipt_id?: string;
  response_status?: number;
  response_body?: string;
  duration_ms: number;
  success: boolean;
  error_message?: string;
  executed_at: string;
}

export interface RegisterPluginInput {
  name: string;
  description?: string;
  webhook_url: string;
  webhook_secret: string;
  hook_events: string[];
  version?: string;
}

export interface UpdatePluginInput {
  name?: string;
  description?: string;
  webhook_url?: string;
  webhook_secret?: string;
  hook_events?: string[];
  enabled?: boolean;
}

export async function listPlugins(): Promise<Plugin[]> {
  const res = await apiRequest<{ ok: boolean; data: { plugins: Plugin[] } }>('/plugins');
  return (res as { data: { plugins: Plugin[] } }).data.plugins ?? [];
}

export async function registerPlugin(input: RegisterPluginInput): Promise<Plugin> {
  const res = await apiRequest<{ ok: boolean; data: Plugin }>('/plugins', {
    method: 'POST',
    body: input,
  });
  return unwrap<Plugin>(res);
}

export async function updatePlugin(pluginId: string, input: UpdatePluginInput): Promise<Plugin> {
  const res = await apiRequest<{ ok: boolean; data: Plugin }>(`/plugins/${pluginId}`, {
    method: 'PUT',
    body: input,
  });
  return unwrap<Plugin>(res);
}

export async function deletePlugin(pluginId: string): Promise<{ deleted: boolean }> {
  const res = await apiRequest<{ ok: boolean; data: { deleted: boolean } }>(
    `/plugins/${pluginId}`,
    { method: 'DELETE' },
  );
  return unwrap<{ deleted: boolean }>(res);
}

export async function getPluginExecutions(
  pluginId: string,
  limit = 50,
  offset = 0,
): Promise<{ executions: PluginExecution[]; total: number }> {
  const res = await apiRequest<{
    ok: boolean;
    data: { executions: PluginExecution[]; total: number };
  }>(`/plugins/${pluginId}/executions?limit=${limit}&offset=${offset}`);
  return unwrap<{ executions: PluginExecution[]; total: number }>(res);
}
