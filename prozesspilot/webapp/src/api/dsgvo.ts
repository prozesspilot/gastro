/**
 * DSGVO-Compliance API-Client
 */

import { apiRequest, unwrap } from './_client';

export interface DeletionRequest {
  request_id: string;
  customer_id: string | null;
  tenant_id: string;
  requested_by: string;
  reason?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processed_at?: string;
  deleted_tables?: Record<string, number>;
  error_message?: string;
  created_at: string;
}

export interface PiiInventoryEntry {
  table: string;
  description: string;
  fields: string[];
  encrypted: string[];
  basis: string;
  retention: string;
}

export async function requestDeletion(input: {
  customer_id?: string;
  reason?: string;
  requested_by: string;
}): Promise<DeletionRequest> {
  const res = await apiRequest<{ ok: boolean; data: DeletionRequest }>('/dsgvo/delete-request', {
    method: 'POST',
    body: input,
  });
  return unwrap<DeletionRequest>(res);
}

export async function getDeletionStatus(requestId: string): Promise<DeletionRequest> {
  const res = await apiRequest<{ ok: boolean; data: DeletionRequest }>(
    `/dsgvo/delete-request/${requestId}`,
  );
  return unwrap<DeletionRequest>(res);
}

export async function exportCustomerData(customerId: string): Promise<unknown> {
  const res = await apiRequest<{ ok: boolean; data: unknown }>(
    `/dsgvo/export-data?customer_id=${encodeURIComponent(customerId)}`,
  );
  return unwrap<unknown>(res);
}

export async function getPiiInventory(): Promise<{
  inventory: PiiInventoryEntry[];
  total_tables: number;
  total_pii_fields: number;
  encrypted_fields: string[];
}> {
  const res = await apiRequest<{
    ok: boolean;
    data: {
      inventory: PiiInventoryEntry[];
      total_tables: number;
      total_pii_fields: number;
      encrypted_fields: string[];
    };
  }>('/dsgvo/pii-inventory');
  return unwrap(res);
}
