# T018 — POS-Credentials Cleanup-Job (DSGVO-Aufbewahrungsfrist)

> **Owner:** Andreas (Backend)
> **Priorität:** P1 (DSGVO, aber nicht KW22-Pilot-Blocker)
> **Dependencies:** T004 (SumUp-OAuth)

## Ziel
Cleanup-Job entfernt inaktive POS-Credentials nach Ablauf der Aufbewahrungsfrist (30 Tage nach `active=false`). Token sind kein Geschäftsdaten-Bestandteil, fallen nicht unter 10-Jahres-Frist.

## Akzeptanz-Kriterien
- [ ] Background-Job (cron oder Postgres-Trigger), der täglich pos_credentials mit `active=false AND updated_at < now() - INTERVAL '30 days'` löscht
- [ ] DELETE wird im auth_audit_log mit eventType `pos_credentials_purged` geloggt
- [ ] Konfigurierbare Retention-Periode (Default 30 Tage) via ENV `POS_CREDENTIALS_RETENTION_DAYS`
- [ ] Test: nach 31 Tagen Simulation werden Credentials gelöscht
- [ ] DSGVO-Doku: Eintrag in datenschutz.md über Aufbewahrungsfrist
