# T096 — Production betriebsbereit machen (Schritt 1 von 4 zum ersten echten Beleg)

**ID:** T096
**Verantwortlich:** Steve (Server-Zugang) — Andreas unterstützt
**Priorität:** **P0** — blockiert alles Weitere
**Branch:** `server/T096-production-betriebsbereit`
**Geschätzt:** 0,5 Tage (überwiegend Server-Arbeit, wenig Code)
**Dependencies:** — (keine)
**Ziel-Meilenstein:** F4-Tor (Pilot-Smoke-Test)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Der IONOS-Server läuft bereits (87.106.8.111, Postgres 16 + Redis 7 + MinIO als
Docker-Container, Firewall konfiguriert). Es fehlen die letzten Schritte, damit die
Instanz **einen Beleg annehmen** kann. Danach müssen `/api/v1/health` und
`/api/v1/ready` beide **200** liefern — das ist die erste Stufe von `qa-smoke.sh`.

Diese Task ist Schritt **1 von 4** auf dem Weg zum ersten echten Durchlauf:
**T096 (diese)** → T097 (OCR + KI) → T098 (Teil-Smoke) → T099 (Lexware + volles F4-Tor).

---

## ⚠️ Fallstrick, der zwingend zu beachten ist

Die bisherige Rotations-Anleitung in `MANUELLE_AUFGABEN.md` ist **unvollständig** und
würde die Uploads lautlos zerstören:

| Wer | Liest welche Variable |
|---|---|
| `docker-compose.prod.yml` (MinIO-Container) | `PP_S3_ACCESS_KEY` / **`PP_S3_SECRET_KEY`** |
| **Backend** (`core/config.ts:17-18`) | `MINIO_ACCESS_KEY` / **`MINIO_SECRET_KEY`** (Defaults `pp` / `pp-secret`) |

Das sind **zwei Namen für dasselbe Passwort**. Wer nur `PP_S3_SECRET_KEY` rotiert,
ändert das MinIO-Root-Passwort — das Backend versucht weiterhin das alte und
**jeder Beleg-Upload schlägt fehl**.

➡️ **Beide Paare müssen auf dieselben Werte gesetzt werden.**

Ebenfalls irreführend: `PP_S3_BUCKET=prozesspilot-receipts` in `.env.example` wird
**nirgends im Code gelesen** (tote Variable). Maßgeblich ist `MINIO_BUCKET`,
Default **`prozesspilot-raw`**.

---

## Schritte

### 1. MinIO-Bucket anlegen
```
Bucket-Name: prozesspilot-raw     ← NICHT "prozesspilot-receipts"
```
Begründung: `backend/src/core/config.ts:19` → `MINIO_BUCKET` mit Default `prozesspilot-raw`;
`storage.service.ts` nutzt ausschließlich `config.MINIO_BUCKET`.

### 2. Secrets rotieren (P0-Sicherheit — vor dem ersten echten Beleg)
Herkunft: Audit 2026-06-05 (L8) — das MinIO-Root-Passwort geriet am 02.06. kurz in
Mac-Scrollback + Chat-Log. Server-History sauber, Bucket leer.

1. Neues Secret erzeugen: `openssl rand -base64 32` → in 1Password ablegen
2. In `/opt/gastro/.env.prod` **alle vier** setzen:
   ```
   PP_S3_ACCESS_KEY=<neu-user>      # MinIO-Container
   PP_S3_SECRET_KEY=<neu-secret>    # MinIO-Container
   MINIO_ACCESS_KEY=<neu-user>      # Backend — MUSS identisch sein
   MINIO_SECRET_KEY=<neu-secret>    # Backend — MUSS identisch sein
   ```
3. Ebenso `JWT_SECRET` rotieren (P0/P1, mind. 32 Zeichen)
4. **Wichtig:** `.env.prod`-Änderungen greifen NUR via
   `docker compose up -d --force-recreate` — **nicht** `restart`
   (Memory `prod-env-change-recreate`)

### 3. Migrations anwenden — ein Befehl, nicht fünf
`MANUELLE_AUFGABEN.md` listet „Migration 070/080/100/110/120 laufen lassen" als fünf
Einzelpunkte. Das ist überholt: `backend/src/core/db/migrate.ts` führt eine
`schema_migrations`-Tabelle, ermittelt alle `pending` und wendet sie **sortiert** an.
Zudem fehlen in der Liste die neueren Migrations **127–131**.

```bash
cd /opt/gastro/backend && npm run migrate:prod
```
Danach die angewendeten Versionen gegen `ls backend/migrations/*.sql` abgleichen.

### 4. `TRUST_PROXY` setzen (T017)
Ohne die Variable sieht das Backend hinter Caddy nur die Proxy-IP → Rate-Limiting
und Audit-Log protokollieren die falsche Herkunft.

### 5. SSH-Key von Andreas hinterlegen
Damit nicht nur Steve an den Server kommt (Bus-Faktor).

---

## Akzeptanz-Kriterien

- [ ] Bucket `prozesspilot-raw` existiert in MinIO
- [ ] `PP_S3_*` **und** `MINIO_*` in `.env.prod` gesetzt und **identisch**
- [ ] Kein `minioadmin`-Default mehr aktiv
- [ ] `JWT_SECRET` rotiert (≥ 32 Zeichen), alter Wert ungültig
- [ ] Container via `up -d --force-recreate` neu erzeugt (nicht `restart`)
- [ ] `npm run migrate:prod` fehlerfrei; alle Migrations bis **131** angewendet
- [ ] `TRUST_PROXY` gesetzt
- [ ] Andreas' SSH-Key hinterlegt
- [ ] **`GET /api/v1/health` → 200**
- [ ] **`GET /api/v1/ready` → 200** (prüft DB + Redis + Migrationen)
- [ ] **`GET /metrics` → 200** mit `pp_`-Namespace im Prometheus-Format
- [ ] Neue Secrets in 1Password + GitHub-Secrets gepflegt
- [ ] `MANUELLE_AUFGABEN.md` aktualisiert: erledigte Punkte abgehakt, die 5 Migrations-Einzelpunkte durch den einen `migrate:prod`-Schritt ersetzt

---

## Spec-Referenzen

- `scripts/qa-smoke.README.md` — Stufen 1–3 (Health / Ready / Metrics) sind das Ziel dieser Task
- `.claude/CLAUDE.md` §6.6 — Secrets nie im Code, nie in Logs
- `tasks/MANUELLE_AUFGABEN.md` — Einträge „IONOS-Server-Setup", „MinIO-Root-Passwort rotieren", „JWT_SECRET rotieren", „TRUST_PROXY", „Migration … laufen lassen"

---

## Notes

**Aufräumen (klein, gehört hierher):** `PP_S3_BUCKET` aus `.env.example` entfernen oder
als „wird nicht gelesen" kommentieren. Zwei widersprüchliche Bucket-Namen in der
Beispiel-Config sind eine Falle für den nächsten Menschen.

**Kein Code-Deploy nötig.** Diese Task ändert Konfiguration und Server-Zustand, nicht
das Programm. Der einzige Repo-Anteil ist die `.env.example`-Bereinigung plus die
Aktualisierung von `MANUELLE_AUFGABEN.md`.

---

## Offene Fragen (während der Bearbeitung)

<keine>

---

## Lessons Learned (nach Abschluss)

<nach Abschluss ausfüllen>
