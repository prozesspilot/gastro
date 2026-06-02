# T039 — DSGVO-Export-Cleanup (TTL-Wirksamkeit + MinIO-PII-Aufräumen)

> **Owner:** Andreas (Backend)
> **Priorität:** P1 (DSGVO-Pflicht ab erster Auskunft im Pilot)
> **Dependencies:** keine
> **Welle:** 6
> **Audit:** Lane-A Bug-Audit M02/M12 2026-06-02

---

## Problem

`backend/src/workers/dsgvo-worker.ts:140` schreibt `expires_at` in DB und erzeugt eine Signed-URL mit 3-Tage-TTL — aber **nichts löscht den ZIP-Blob im MinIO-Bucket nach Ablauf**. Konsequenzen:

1. `dsgvo_requests.status='ready'` bleibt nach 3 Tagen stehen → `auskunft-status.handler.ts:58` erzeugt jederzeit eine **neue** Signed-URL mit erneutem 3-Tage-Fenster → die `DSGVO_EXPORT_TTL_DAYS=3`-Vorgabe hat im Effekt **keine Wirkung**.
2. MinIO-Bucket `prozesspilot-raw` (oder dedizierter DSGVO-Bucket?) wächst monoton — alte PII-ZIPs (vollständiger Customer-Datenexport) bleiben dauerhaft liegen.
3. DSGVO-Grundprinzip Datenminimierung wird verletzt: nach Auskunfts-Zustellung gibt's keinen legitimen Grund, den Export weiter zu halten.

`infra/` enthält keine entsprechende MinIO-Lifecycle-Rule, kein Cron, kein systemd-Timer.

---

## Akzeptanz-Kriterien

- [ ] Mechanismus existiert, der nach `expires_at < now()`:
  - [ ] `dsgvo_requests.status` von `'ready'` auf `'expired'` setzt (oder `'deleted'` — entscheiden + dokumentieren)
  - [ ] Das MinIO-Object physisch löscht (`deleteObject` via S3-Client)
  - [ ] `audit_log`-Event schreibt: `gastro.dsgvo_export.expired` mit `request_id`, `tenant_id`, `bytes_freed`
- [ ] `auskunft-status.handler.ts` antwortet bei abgelaufenen Requests mit `410 Gone` (oder `404`), **nicht** mit neuer Signed-URL.
- [ ] Unit-Tests für den Cleanup-Pfad: Happy-Path + S3-DeleteError + DB-Roll-Forward bei Partial-Failure.
- [ ] Integration: einmal lokal eine simulierte Request mit `expires_at` in der Vergangenheit anlegen, Cleanup triggern, verifizieren dass Object weg + Status korrekt + audit-log da ist.

---

## Implementierungs-Optionen (für die Entscheidung)

**Option A — systemd-Timer (konsistent zu T005/T018-Pattern):**
- Neues Cron-Script `backend/src/cron/dsgvo-export-cleanup.ts`
- systemd-Service + Timer auf IONOS, täglich z.B. 04:00 UTC (zwischen sumup 03:00 und pos-cleanup 04:30)
- **Pro:** konsistent zu bestehender Cron-Architektur, läuft im Backend-Container, Tenant-isoliert über Owner-Connection
- **Contra:** weiterer systemd-Timer zu pflegen

**Option B — MinIO-Lifecycle-Rule:**
- `mc ilm rule add` auf den DSGVO-Prefix mit `--expiry-days 3`
- **Pro:** MinIO macht's selbst, keine Backend-Logik
- **Contra:** DB-Status bleibt stehen (Option B braucht zusätzlich Cron, der `status='expired'` setzt — sonst Inkonsistenz). Also nicht alleine ausreichend.

**Empfehlung:** Option A. Audit-Log + Status-Update + DeleteObject in einem TX-Pfad sind sauberer als zwei Quellen of truth.

---

## Hinweise

- Top-Level-Discord-Alert per [[T038-cron-toplevel-discord-alerts]] direkt mit anwenden.
- Owner-Connection per [[T022-pos-cron-owner-connection]]-Pattern nutzen, falls RLS auf `dsgvo_requests` aktiv ist (prüfen!).
- Signed-URL-Hard-Cap AWS-SigV4: 604800s (7 Tage). TTL > 7 würde im Signing crashen.

## Anti-Goals

- Kein generelles Lifecycle-Management-Framework — nur diesen einen Pfad.
- Kein „Notification before deletion"-Mail — der Customer hat 3 Tage zum Download, das war die Vereinbarung.
