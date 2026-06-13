# Eingefrorene n8n-Workflows (Post-Pilot)

Diese 17 Workflows wurden in **T049/F3** (2026-06-13) hierher verschoben. Sie rufen alle die **entfernte** `/receipts`-/`/customers`-Welt (T047) und liefen daher gegen HTTP 404.

**Nicht importieren.** `n8n/deploy.sh` ignoriert dieses Verzeichnis (globbt nur top-level `workflows/WF-*.json`).

## Warum eingefroren statt gelöscht

Sie sind die Vorlage für die **Post-Pilot-Reaktivierung**, sobald ein automatischer Eingangskanal (WhatsApp/IMAP, M10/M11) gebaut wird. Bei Reaktivierung müssen sie:
- von `/receipts`+`/customers` auf die belege-Endpoints umgeschrieben werden, und
- die Auth lösen (belege ist JWT; n8n braucht einen HMAC-/Service-Token-Pfad — siehe `n8n/README.md`).

## Inhalt

Haupt-Pipeline (WF-MASTER-RECEIPT, WF-INPUT-{UPLOAD,WHATSAPP,IMAP}, WF-ERROR-HANDLER) · Modul-Workflows (WF-M01…M08) · Phase-4 (WF-M09-SUPPLIER-COMM, WF-PLUGIN-DISPATCHER, WF-CRON-M08, WF-CRON-M09-EXPECTED).
