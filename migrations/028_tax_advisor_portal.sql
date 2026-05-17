-- =============================================================================
-- Migration 013 — Tax Advisor Portal (M06 Steuerberater-Portal)
-- Tabellen für Multi-Tenant-Ansicht von Steuerberatern
-- =============================================================================

-- ── Tax Advisor Rollen ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_advisor_users (
  advisor_id    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','viewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tax_advisor_users_tenant ON tax_advisor_users (tenant_id);

-- ── Welche Kunden darf der Steuerberater sehen? ───────────────────────────────
CREATE TABLE IF NOT EXISTS advisor_customer_access (
  advisor_id    TEXT NOT NULL REFERENCES tax_advisor_users(advisor_id) ON DELETE CASCADE,
  customer_id   TEXT NOT NULL,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (advisor_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_advisor_access_customer ON advisor_customer_access (customer_id);

-- ── Bulk-Approve: Steuerberater kann mehrere Belege auf einmal freigeben ──────
CREATE TABLE IF NOT EXISTS bulk_approvals (
  approval_id   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  advisor_id    TEXT NOT NULL,
  tenant_id     TEXT NOT NULL,
  receipt_ids   TEXT[] NOT NULL,
  comment       TEXT,
  approved_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bulk_approvals_advisor ON bulk_approvals (advisor_id, approved_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_approvals_tenant ON bulk_approvals (tenant_id);

-- ── Receipt Comments (Steuerberater-Kommentare zu Belegen) ───────────────────
CREATE TABLE IF NOT EXISTS receipt_comments (
  comment_id    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  receipt_id    TEXT NOT NULL,
  advisor_id    TEXT NOT NULL,
  tenant_id     TEXT NOT NULL,
  customer_id   TEXT NOT NULL,
  comment       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receipt_comments_receipt ON receipt_comments (receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_comments_advisor ON receipt_comments (advisor_id);
