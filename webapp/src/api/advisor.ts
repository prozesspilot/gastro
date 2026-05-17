/**
 * M06 Steuerberater-Portal — API-Client
 */

import { apiRequest, unwrap } from './_client';

export interface CustomerOverviewItem {
  customer_id: string;
  name: string;
  receipt_count: number;
  pending_count: number;
  exported_count: number;
}

export interface PendingReceiptItem {
  receipt_id: string;
  customer_id: string;
  customer_name: string;
  status: string;
  supplier_name?: string;
  document_date?: string;
  amount?: number;
  currency?: string;
  review_reason?: string;
  created_at: string;
}

export interface BulkApproveResult {
  approved_count: number;
  skipped_count: number;
  approval_id: string | null;
  approved_receipt_ids: string[];
  skipped_receipt_ids: string[];
}

export interface ReceiptComment {
  comment_id: string;
  receipt_id: string;
  advisor_id: string;
  customer_id: string;
  comment: string;
  created_at: string;
}

export async function getAdvisorOverview(advisorId: string): Promise<CustomerOverviewItem[]> {
  const res = await apiRequest<{ ok: true; data: CustomerOverviewItem[] }>(
    `/advisor/overview?advisor_id=${encodeURIComponent(advisorId)}`,
  );
  return unwrap<CustomerOverviewItem[]>(res);
}

export async function getPendingReceipts(
  advisorId: string,
  opts?: { customerId?: string; limit?: number; offset?: number },
): Promise<PendingReceiptItem[]> {
  const params = new URLSearchParams({ advisor_id: advisorId });
  if (opts?.customerId) params.set('customer_id', opts.customerId);
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
  const res = await apiRequest<{ ok: true; data: PendingReceiptItem[] }>(
    `/advisor/receipts/pending?${params.toString()}`,
  );
  return unwrap<PendingReceiptItem[]>(res);
}

export async function bulkApprove(
  advisorId: string,
  receiptIds: string[],
  comment?: string,
): Promise<BulkApproveResult> {
  const res = await apiRequest<{ ok: true; data: BulkApproveResult }>(
    '/advisor/receipts/bulk-approve',
    {
      method: 'POST',
      body: { advisor_id: advisorId, receipt_ids: receiptIds, comment },
    },
  );
  return unwrap<BulkApproveResult>(res);
}

export async function addComment(
  receiptId: string,
  advisorId: string,
  comment: string,
): Promise<ReceiptComment> {
  const res = await apiRequest<{ ok: true; data: ReceiptComment }>(
    `/advisor/receipts/${encodeURIComponent(receiptId)}/comment`,
    {
      method: 'POST',
      body: { advisor_id: advisorId, comment },
    },
  );
  return unwrap<ReceiptComment>(res);
}
