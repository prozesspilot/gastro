---
name: Pipeline Wiring Session (2026-05-07)
description: How the receipt upload pipeline was connected to n8n, including WF-INPUT-UPLOAD workflow and routing plan fix
type: project
---

Session ran on branch `autonom/solo` on 2026-05-07.

**FOLLOW-UP SESSION (2026-05-07):** WF-INPUT-UPLOAD was confirmed NOT in n8n DB despite being reported "deployed". Root causes found and fixed.

**Core Problem Solved:** Receipt uploads set status `received` but never triggered n8n pipeline.

**Solution Architecture:**
- Created `WF-INPUT-UPLOAD` (id: `wf-input-upload-00000000-0000-000000000020`) — webhook-triggered workflow at `POST /webhook/receipt-received`
- This workflow: normalizes payload → gets profile → calls routing plan → splits steps → calls M01/M02/M03/M05/M06/M07 sub-workflows → finalizes receipt
- Backend calls `triggerReceiptPipeline()` from `core/n8n/client.ts` after both file upload and reprocess endpoints
- WF-MASTER-RECEIPT is NOT used for uploads — it creates new receipts internally; WF-INPUT-UPLOAD handles existing receipts

**Why:** WF-MASTER-RECEIPT uses `executeWorkflowTrigger` (sub-workflow mode only) and internally POSTs to create a new receipt — which conflicts with receipts already created by the upload flow.

**Key fixes:**
1. `backend/src/core/n8n/client.ts` — added `triggerReceiptPipeline()` (best-effort, never throws)
2. `backend/src/modules/receipts/receipt.routes.ts` — calls `triggerReceiptPipeline` after `/:id/file` and `/:id/reprocess`
3. `backend/src/modules/routing/handlers/plan.handler.ts` — fixed SQL query to use `id` not `receipt_id` (modern schema uses UUID `id`); normalized module codes (m01_ingestion → M01); added integrations JSONB as fallback for credentials
4. `n8n/workflows/WF-INPUT-UPLOAD.json` — new workflow file
5. `n8n/deploy.sh` — added `WF-INPUT-UPLOAD` and `WF-INPUT-IMAP` to activation order

**n8n Login (reset on 2026-05-07):**
- Email: admin@prozesspilot.local
- Password: Passwort123! (was reset from "Passwort" by accidental `user-management:reset`)
- Session cookie saved in /tmp/n8n_cookies.txt during session
- Webhook auth: not required (webhooks are public endpoints)

**DB Schema Note:**
- There are TWO receipt schemas: `_shared/receipts/receipt.repository.ts` uses old `receipt_id TEXT` schema from migration 010
- Modern `receipts` table (migration 013) uses `id UUID, tenant_id, customer_id, ...`
- The routing plan handler was fixed to use the modern schema

**WF-INPUT-UPLOAD Bug History (2026-05-07 followup):**
1. Was "activated" in n8n but not actually in `workflow_entity` SQLite table — root cause: SQLite WAL (Write-Ahead Log) not checkpointed when reading with `docker cp`. Always checkpoint WAL before reading DB: `sqlite3 db.sqlite "PRAGMA wal_checkpoint(FULL);"` AND copy .sqlite-wal + .sqlite-shm files together.
2. n8n API returns `{"message":"Workflow was started"}` for ANY POST to `/webhook/<path>` even if workflow is NOT registered. This is n8n's test-mode response. Real registration = entry in `webhook_entity` table.
3. `executeWorkflow` nodes in n8n 2.18.5 require `workflowId` as `{"__rl": true, "value": "...", "mode": "id"}` object, NOT a plain string. Using plain string causes `"Workflow activation failed sub-workflow validation"`.
4. WF-INPUT-UPLOAD originally lacked a "Code: Build Sub-WF Input" node — sub-workflows (M01-M07) expect `{receipt: {receipt_id, customer_id, status}, customer_profile, trace_id}` but UPLOAD was sending flat step data. Added Code node between Split:Steps and Switch.
5. The `finalize_receipt` node was calling `POST /api/v1/receipts/:id/complete` which uses `_shared/receipts` repo (old `receipt_id TEXT` table from migration 010). Changed to `PUT /api/v1/receipts/:id/status` with `{"status":"done"}` which uses the modern `receipts` table (migration 013, `id UUID`).
6. n8n user email is `admin@prozesspilot.local` (NOT `bernhardt@prozesspilot.net` — that user was there historically). API key label "pp" stores JWT in `user_api_keys` table.
7. CONFIRMED WORKING: `received` → `done` in 2s. Execution IDs 32 (WF-INPUT-UPLOAD success) + 33 (WF-M01 success).

**TWO RECEIPTS TABLE SCHEMAS (critical architecture note):**
- Migration 010 (`receipts` old): `receipt_id TEXT PRIMARY KEY` — used by `_shared/receipts/receipt.repository.ts`, `m01-receipt-intake`, `m02-archive`, etc.
- Migration 013 (`receipts` new): `id UUID PRIMARY KEY, tenant_id, customer_id, ...` — used by `modules/receipts/receipt.routes.ts` (API upload flow)
- WF-INPUT-UPLOAD works with the new schema via `PUT /api/v1/receipts/:id/status`
- WF-MASTER-RECEIPT (WhatsApp flow) works with the old schema via `POST /api/v1/receipts/:id/complete`

**Credentials added to CustomerProfile (types.ts + customers.ts + CustomerProfilePage.tsx):**
- OCR: `ocr_provider` (mindee/google_vision/openai) + `ocr_api_key` — visible when m03_extraction enabled
- DATEV: `datev_berater_nr`, `datev_mandanten_nr`, `datev_export_email` — visible when m04_categorization enabled
- sevDesk: `sevdesk_api_token` — visible when m06_portal enabled
- Steuerberater: `tax_advisor_email` — visible with DATEV section

**How to apply:** When touching routing/plan.handler.ts, use the modern receipts table (`id` column, not `receipt_id`). When adding credentials to profiles, add to types.ts + customers.ts (integrations mapping) + CustomerProfilePage.tsx (conditional section).
