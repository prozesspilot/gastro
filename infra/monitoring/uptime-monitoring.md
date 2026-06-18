# Uptime-Monitoring (host-extern) — T063

**Zweck:** Einen Prod-Ausfall **innerhalb weniger Minuten** in Discord melden — statt wie am 2026-06-17 erst nach ~4 Tagen, weil niemand es gemerkt hat.

## Wie es funktioniert

- **Workflow:** `.github/workflows/uptime-monitor.yml` — läuft per `schedule` **alle 5 Minuten** auf GitHub-Runnern.
- **Host-EXTERN (wichtig):** Der Check läuft NICHT auf dem IONOS-Host, sondern bei GitHub. Damit meldet er auch, wenn der **ganze Host weg** ist. Der host-interne Prometheus/Grafana-Stack (`docker-compose.yml` hier daneben) ist dafür blind — wenn der Host stirbt, stirbt auch das Monitoring.
- **Geprüfte Endpoints:**
  - `https://api.prozesspilot.net/api/v1/health` → erwartet `HTTP 200` + Body enthält `"ok":true`
  - `https://api.prozesspilot.net/api/v1/ready` → erwartet `HTTP 200` (DB/Redis-Konnektivität)
- **Entprellung:** Pro Lauf **bis zu 3 Versuche** (à 20 s). Erst wenn alle 3 scheitern, gilt Prod als „down" → kein Fehlalarm bei einem transienten Blip.
- **Statuswechsel-Logik (kein Spam):** Der letzte Status (`up`/`down`) wird zwischen den Läufen im **Actions-Cache** gehalten. Gemeldet wird **nur beim Wechsel**:
  - `up → down`: 🚨 **Prod ist DOWN**-Alert
  - `down → up`: ✅ **Prod wieder ERREICHBAR**-Recovery
  - gleicher Status: keine Meldung
- **Ziel:** `DISCORD_ALERTS_WEBHOOK` (GitHub-Secret). Ohne Secret läuft der Workflow durch und überspringt nur den Post (Log-Hinweis).
- **Ping-Logik (bewusst, KEIN `@everyone`):** Der **DOWN-Alert** pingt gezielt die **Geschäftsführer-Rolle** (`DISCORD_ROLE_ID_GF`-Secret) — ein echter Prod-Ausfall *soll* benachrichtigen, sonst geht die Meldung unter. Die **Recovery-Meldung** ist still (kein Ping). Kein Massen-`@everyone` (das wurde projektweit entfernt). Ist `DISCORD_ROLE_ID_GF` nicht gesetzt, kommt der Down-Alert ohne Ping.

## Voraussetzung

GitHub-Secret **`DISCORD_ALERTS_WEBHOOK`** muss gesetzt sein (wird bereits von `deploy-staging.yml` genutzt — vermutlich schon vorhanden). Prüfen/setzen:
`Repo → Settings → Secrets and variables → Actions → DISCORD_ALERTS_WEBHOOK`.

## Testen

Manuell auslösen (ohne 5 Min zu warten):
```
gh workflow run uptime-monitor.yml
```
Dann unter `Actions → Uptime Monitor` den Lauf ansehen — das Log zeigt „Aktueller Status: up/down" und ob ein Alert gesendet wurde. Bei `up` (Normalfall) kommt **keine** Discord-Meldung (nur bei Statuswechsel).

## Ein-/Ausschalten

- **Pausieren:** in `Actions → Uptime Monitor` den Workflow per „⋯ → Disable workflow" deaktivieren. **Oder** im YAML den `schedule:`-Block auskommentieren (dann läuft nur noch `workflow_dispatch` manuell).
- **Intervall ändern:** `cron: '*/5 * * * *'` anpassen (GitHub-Minimum sind 5 Min; das tatsächliche Timing kann unter Last um einige Minuten schwanken).

## Grenzen & möglicher Ausbau

- GitHub-Actions-`schedule` ist **nicht sekundengenau** (± einige Minuten, gelegentlich verzögert) und hängt davon ab, dass GitHub-Actions selbst läuft. Für den Zweck „ein mehrtägiger Ausfall darf nicht unbemerkt bleiben" ist das **mehr als ausreichend** (Minuten statt Tage).
- **⚠️ 60-Tage-Auto-Disable:** GitHub deaktiviert geplante Workflows **automatisch nach 60 Tagen ohne Commit-Aktivität** im Repo. Bei aktiver Entwicklung unkritisch — aber bei einer längeren Commit-Pause würde der Monitor *still* einschlafen (also genau dann blind, wenn man es am wenigsten merkt). Gegenmittel: regelmäßige Repo-Aktivität (gegeben), oder bei langer Pause den Workflow unter `Actions → Uptime Monitor` einmal manuell wieder aktivieren. Der robustere Ausbau unten (externer Dienst) hat dieses Limit nicht.
- **Robustheits-Upgrade (optional, später):** ein dedizierter externer Dienst wie **UptimeRobot** oder **Better Stack** → Discord. Die sind speziell dafür gebaut (engmaschiger, eigene Recovery-/Dedup-Logik, Status-Page) und unabhängig von GitHub. Setup wäre ein einmaliger Account + Monitor auf `api/health` + Discord-Integration.
