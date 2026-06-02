# T022 — POS-Cron auf Owner-Connection umstellen (RLS-Voraussetzung)

**Priorität:** P1 — Blocker, sobald RLS auf `pos_credentials` aktiviert wird
**Modul:** M15 (pos-connector)
**Herkunft:** Review-Findings aus PR #60 (T005) + PR #61 (T018)
**Implementierung in Review:** PR #90 (`andreas/T022-pos-cron-owner-connection`, OPEN, Stand 2026-06-02) — `SECURITY DEFINER`-Variante.
**Merge-Reihenfolge (per Lane-A-Bug-Audit 2026-06-02):** PR #90 MUSS vor jedem RLS-Aktivierungs-PR auf `pos_credentials` gemerged werden, sonst silent-empty-Cron.

## Problem

Zwei Cron-Pfade in M15 greifen über die App-Rolle `gastro_app` auf
`pos_credentials` zu:

- `listActiveSumUpTenants` (Daily-Sync, `kasse-transactions.repository.ts`)
- `purgeInactivePosCredentials` (DSGVO-Cleanup, `pos.repository.ts`)

Beide setzen defensiv `set_config('app.bypass_rls','on')` bzw. lasen/löschen
über alle Tenants. Aktuell funktioniert das **nur**, weil `pos_credentials`
noch **keine** RLS-Policy hat (Migration 022).

`is_rls_bypassed()` (Migration `002_helpers.sql`) liefert für `gastro_app`
**false** (nur `gastro_owner`/Superuser bekommen Bypass). Sobald RLS auf
`pos_credentials` aktiviert wird, geben beide Crons als `gastro_app` ein
**Silent-Empty-Result** zurück (kein Fehler, aber 0 Rows) → Sync/Cleanup
laufen still ins Leere.

## Aufgabe

1. Cron-Pfade auf eine **Owner-Connection** (`gastro_owner`) umstellen —
   analog zum Migrate-Pfad — ODER eine `SECURITY DEFINER`-Funktion bauen
   (analog `insert_auth_audit_log`, Migration 061), die den Cross-Tenant-Zugriff
   kapselt.
2. Die irreführenden `bypass_rls`-Kommentare sind bereits korrigiert (PR #60/#61),
   aber die Implementierung muss nachziehen, bevor RLS aktiviert wird.
3. Sicherstellen, dass der `audit_log`-Insert im Cleanup weiter tenant-isoliert
   funktioniert (pro Row `app.tenant_id` setzen — bleibt korrekt).

## Abhängigkeit / Reihenfolge

- MUSS **vor oder zusammen mit** der RLS-Aktivierung auf `pos_credentials`
  gemerged werden, sonst brechen Daily-Sync + DSGVO-Cleanup still.

## Akzeptanz

- Integrationstest: mit aktiver RLS auf `pos_credentials` liefert
  `listActiveSumUpTenants` weiterhin alle aktiven Tenants, und
  `purgeInactivePosCredentials` löscht weiterhin korrekt + schreibt `audit_log`.
- Siehe auch [[T023]] (Integrationstests).
