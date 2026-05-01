/**
 * M09 Lieferanten-Kommunikation — API-Client
 */

import { apiRequest, unwrap } from './_client';

export interface Communication {
  communication_id: string;
  customer_id: string;
  receipt_id: string | null;
  expected_id: string | null;
  channel: string;
  direction: 'inbound' | 'outbound';
  template: string | null;
  to_address: string | null;
  from_address: string | null;
  subject: string | null;
  reference_id: string | null;
  status: string;
  external_id: string | null;
  created_at: string;
}

export interface ListCommunicationsParams {
  customer_id?: string;
  receipt_id?: string;
  direction?: 'inbound' | 'outbound';
  status?: string;
  limit?: number;
  offset?: number;
}

export async function listCommunications(
  params: ListCommunicationsParams = {},
): Promise<Communication[]> {
  const query = new URLSearchParams();
  if (params.customer_id) query.set('customer_id', params.customer_id);
  if (params.receipt_id) query.set('receipt_id', params.receipt_id);
  if (params.direction) query.set('direction', params.direction);
  if (params.status) query.set('status', params.status);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));

  const qs = query.toString();
  const res = await apiRequest<{ ok: true; data: Communication[] }>(
    `/communications${qs ? `?${qs}` : ''}`,
  );
  return unwrap<Communication[]>(res);
}
