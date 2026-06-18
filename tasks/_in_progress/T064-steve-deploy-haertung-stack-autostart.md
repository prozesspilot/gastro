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

- [x] Root-Cause des 2026-06-17-Ausfalls dokumentiert (siehe „Befunde": kein Reboot/Disk, kein OOM-Beweis, **fehlendes Swap** + **n8n-Crash-Loop** als Lücken; exakter Trigger nicht rekonstruierbar).
- [x] Docker-Dienst on-boot `enabled` (verifiziert). Reboot-Test optional — Host hatte 156 Tage Uptime, Reboot war nicht die Ursache.
- [x] `pg_isready`-Guard im Deploy mit Retry gehärtet (3× à 2 s) — `deploy-staging.yml`, `bash -n` grün.
- [x] RAM-Härtung: n8n via `profiles` deaktiviert (Code) + **4 GB Swap** am Server eingerichtet & reboot-fest (`/etc/fstab`), `free -m` zeigt `Swap: 4095`.

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

## Befunde (Server-Diagnose 2026-06-18)

- **Kein Host-Reboot:** `uptime` = **156 Tage** (Boot 2026-01-12). Die „Reboot-ohne-Autostart"-Hypothese ist **widerlegt**.
- **Platte ok:** `df -h /` = 47 % belegt (62 G frei) → nicht die Ursache.
- **Docker-Autostart bereits aktiv:** `systemctl is-enabled docker` = `enabled`. ✅
- **KEIN Swap:** `free -m` zeigt `Swap: 0 0 0` — der Host hat **gar kein Swap**, obwohl `docker-compose.prod.yml` „4G Swap als Notfall-Puffer" vorsah. Auf 4 GB RAM → jede Speicher-Spitze führt **sofort** zum OOM-Kill ohne Puffer. **Das ist die eigentliche Resilienz-Lücke** und die plausibelste Ursachen-Klasse des Ausfalls.
- **Kein OOM-Beweis im Journal:** `journalctl -k … oom` für 12.–18.06. = leer (Journal reicht vermutlich nicht bis 14.06. zurück → nicht beweisbar, nicht widerlegbar).
- **`free -m` aktuell:** 3868 total / 1355 used / **2512 available** — momentan genug RAM (n8n frisst nichts, weil es beim Start abstürzt).
- **n8n-Crash-Ursache gefunden:** `docker compose logs n8n` → **`database "n8n" does not exist`**. n8n crasht endlos, weil seine DB nie angelegt wurde. **Reiner Crash-Loop, kein Speicherfresser** — also NICHT der OOM-Auslöser, aber unnötiges Dauer-Gezappel auf einem ungenutzten, eingefrorenen Dienst.

**Root-Cause-Fazit:** Der exakte 14.06.-Auslöser ist nicht mehr rekonstruierbar (Recovery hat den Zustand überschrieben, kein OOM-Beweis). Zwei echte Lücken gefunden, die gegen Wiederholung härten: **(1) fehlendes Swap** (war vorgesehen, nie eingerichtet) · **(2) n8n-Crash-Loop** (fehlende DB, ungenutzt).

**Maßnahmen:**
- **(Code, erledigt)** n8n in `docker-compose.prod.yml` per `profiles: ["optional"]` deaktiviert → startet nicht mehr bei `up -d`/Deploy.
- **(Server, Steve)** 4 GB Swap einrichten (Notfall-Puffer) + laufenden n8n-Container stoppen/entfernen.
- Docker-Autostart ist **bereits `enabled`** → Reboot-Resilienz ok (kein Reboot war die Ursache, daher Reboot-Test optional).

## Kontext

Folge des Prod-Vorfalls am 2026-06-17. Der Recovery-Deploy (PR #138) hat den Stack wiederhergestellt, aber die Ursache nicht beseitigt. Zusammen mit [[T063]] (Alerting) sorgt dieser Task dafür, dass (a) ein Ausfall sofort auffällt und (b) er nach einem Reboot gar nicht erst entsteht.
