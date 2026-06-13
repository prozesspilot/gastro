# ProzessPilot n8n Workflows

> **Stand 2026-06-13 (T049/F3): Der Pilot läuft Webapp-getrieben, nicht über n8n.**

## Warum hier (fast) nichts aktiv ist

Der Pilot-Beleg-Pfad ist **Mitarbeiter/Webapp-getrieben** und vollständig JWT-geschützt:

```
Upload (Webapp, JWT)
  → OCR            (Worker, automatisch beim Upload)
  → Categorize     (POST /api/v1/belege/:id/categorize, JWT)
  → Lexware-Export (POST /api/v1/belege/:id/exports/lexware, JWT)
```

Alle belege-Endpoints verlangen einen **M14-JWT-Cookie + `X-PP-Tenant-ID`** (`m14StaffAuthHook` + `m14TenantContextHook`). n8n authentifiziert per **HMAC** und kann diese Endpoints daher **nicht** aufrufen. Es gibt im Pilot bewusst **keinen aktiven n8n-Workflow** — `n8n/deploy.sh` deployt entsprechend nichts (kein Fehler).

## `_eingefroren/`

Die 17 alten Workflows liegen in [`workflows/_eingefroren/`](workflows/_eingefroren/). Sie rufen die **entfernte** `/receipts`-/`/customers`-Welt (T047) → liefen gegen HTTP 404. Sie bleiben als Referenz für die **Post-Pilot-Reaktivierung** erhalten — relevant, sobald ein automatischer Multi-Channel-Eingang (WhatsApp/IMAP) gebaut wird (M10/M11, eingefroren).

## Post-Pilot: Wann n8n wieder ins Spiel kommt

n8n wird gebraucht, sobald Belege **nicht** mehr nur manuell über die Webapp hochgeladen werden, sondern automatisch über WhatsApp/E-Mail/Web-Chat einlaufen. Dann braucht es:
1. einen HMAC- oder Service-Token-Pfad zu den belege-Endpoints (n8n→Backend ohne JWT-Cookie), und
2. einen neuen Pilot-Workflow auf der belege-Welt (kein `/receipts` mehr).

Bis dahin: nichts importieren. Der Webapp-Pfad ist die Pilot-Pipeline.

## Deploy

`./deploy.sh` importiert nur top-level `workflows/WF-*.json` (nicht `_eingefroren/`). Aktuell = 0 Workflows = nichts zu tun.
