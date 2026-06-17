# T064 — Deploy-Härtung + Stack-Autostart-on-boot sicherstellen

**ID:** T064
**Priorität:** P1 (Ursachen-Prävention des 2026-06-17-Ausfalls)
**Geschätzt:** S–M
**Anker:** Prod-Vorfall 2026-06-17 · `.github/workflows/deploy-staging.yml` · `docker-compose.prod.yml` · Code-Review PR #138

---

## Problem / Hintergrund

Beim Vorfall am 2026-06-17 war der gesamte Stack ~4 Tage unten. Dass `restart: always` Postgres **nicht** selbst zurückgebracht hat, deutet stark auf einen **Host-Reboot ohne Auto-Start des Docker-Stacks** hin (oder ein OOM-Ereignis, das den Stack nicht erholte). Die Ursache wurde nicht final diagnostiziert (kein Server-Zugang während des Incidents) — das muss verifiziert und abgesichert werden, sonst kann es wiederkommen.

## Was zu tun ist

1. **Root-Cause verifizieren (auf dem Server):**
   - `uptime` (Host-Reboot um den 14.06.?), `last reboot`, `journalctl -k | grep -i oom` (OOM-Killer?), `df -h` (Platte?), `docker events`-Historie.
   - `systemctl is-enabled docker` — ist der Docker-Dienst **on-boot enabled**? Wenn nein: `systemctl enable docker`.
2. **Stack-Autostart on boot sicherstellen:** Mit `restart: always` + on-boot-enabled Docker kommen die Container nach einem Reboot von selbst hoch. Verifizieren (Test-Reboot in einem ruhigen Fenster) oder alternativ einen systemd-Unit/`docker compose up`-on-boot-Hook einrichten, der `cd /opt/gastro && docker compose -f docker-compose.prod.yml up -d` beim Boot ausführt.
3. **OOM-Härtung prüfen:** 4 GB RAM ist knapp (postgres 1G + backend 768M + n8n 800M + …). Prüfen ob n8n (800M, im Pilot eingefroren) auf dem Prod-Host überhaupt laufen muss; ggf. Swap/Limits anpassen.
4. **Deploy-`pg_isready`-Härtung (Reviewer-Hinweis aus PR #138):** Der neue Backup-Guard überspringt das Backup, wenn `pg_isready` einmal fehlschlägt. Bei einem transienten „not ready" direkt nach Container-Start ein false-negative → Backup würde fälschlich übersprungen, obwohl die DB existiert. Mit kurzem Retry härten (z.B. 3× à 2 s), bevor „kein Backup" entschieden wird.

## Akzeptanz-Kriterien

- [ ] Root-Cause des 2026-06-17-Ausfalls dokumentiert (Reboot / OOM / Disk / sonstiges).
- [ ] Docker-Dienst on-boot enabled **und** verifiziert, dass der Stack nach Reboot von selbst hochkommt.
- [x] `pg_isready`-Guard im Deploy mit Retry gehärtet (3× à 2 s) — `deploy-staging.yml`, `bash -n` grün.
- [ ] Falls RAM die Ursache war: Maßnahme umgesetzt (Service entfernt / Swap / Limits).

## Operator-Runbook (Steve am Server — SSH `root@87.106.8.111`)

Claude hat keinen SSH-Zugang (Key nur in GitHub-Secrets). Diese Schritte führt Steve aus; die Ausgaben hier reinpasten, dann dokumentiert Claude den Root-Cause + entscheidet die Maßnahme. **Befehle einzeilig halten (Umbruch-Falle).**

**A) Root-Cause-Diagnose (read-only):**
```
uptime
```
```
who -b
```
```
journalctl -k --since "2026-06-13" | grep -i -E "oom|killed process" | tail
```
```
df -h /
```
```
docker compose -f /opt/gastro/docker-compose.prod.yml ps
```
→ Reboot um den 14.06.? (uptime/who -b) · OOM-Killer? (journalctl) · Platte voll? (df) · welche Container laufen?

**B) Docker-Autostart on boot sicherstellen:**
```
systemctl is-enabled docker
```
Falls **nicht** `enabled`:
```
systemctl enable docker
```
(Mit `restart: always` + on-boot-enabled Docker kommt der Stack nach einem Reboot von selbst hoch.)

**C) Autostart verifizieren** (in einem ruhigen Fenster, Prod kurz weg):
```
reboot
```
→ ~2 Min warten, dann von außen: `curl -s -o /dev/null -w "%{http_code}\n" https://api.prozesspilot.net/api/v1/health` → erwartet `200` **ohne** manuellen Eingriff.

**D) RAM/OOM-Härtung (falls journalctl OOM zeigte):**
```
free -m
```
n8n (`mem_limit: 800m`) ist im Pilot eingefroren — prüfen, ob es auf Prod laufen muss; ggf. `docker compose -f docker-compose.prod.yml stop n8n` (und aus dem Autostart nehmen) entlastet den 4-GB-Host deutlich. Entscheidung dokumentieren.

## Kontext

Folge des Prod-Vorfalls am 2026-06-17. Der Recovery-Deploy (PR #138) hat den Stack wiederhergestellt, aber die Ursache nicht beseitigt. Zusammen mit [[T063]] (Alerting) sorgt dieser Task dafür, dass (a) ein Ausfall sofort auffällt und (b) er nach einem Reboot gar nicht erst entsteht.
