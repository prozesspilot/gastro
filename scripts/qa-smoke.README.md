# Pilot-Smoke-Test (`qa-smoke.sh`) — F4-Tor

> **Was es beweist:** Ein **echter Beleg** läuft komplett durch die Pilot-Pipeline und landet in **Lexware Office**. Damit ist verifiziert, dass der Webapp-getriebene belege-Pfad **live** funktioniert — inkl. OCR-Worker, KI-Kategorisierung und Lexware-Export.

```
Health/Ready → /metrics → Login (M14-Notfall) → Upload → OCR (Worker)
  → Categorize (M03) → Lexware-Batch-Export (M05)
```

Das ist **kein CI-Test**. Er braucht eine laufende Instanz und echte externe Dienste (Google Vision OCR, Anthropic Claude, Lexware-Office-Credentials der Steuerberaterin) sowie einen **Geschäftsführer-Login mit TOTP**. Ein Operator (Steve) fährt ihn **manuell** gegen Staging/Prod — z. B. nach jedem Deploy oder vor dem Pilot-Start.

---

## Voraussetzungen

| Tool | Pflicht? | Zweck |
|---|---|---|
| `curl` | ja | HTTP-Requests |
| `jq` | ja | JSON-Parsing |
| `oathtool` | optional | TOTP-Code aus Base32-Secret generieren (`brew install oath-toolkit`) |

---

## Aufruf (gegen Prod)

```bash
BASE_URL=https://api.prozesspilot.net \
PP_SMOKE_TENANT_ID=<echte-tenant-uuid> \
PP_SMOKE_EMAIL=steve@prozesspilot.net \
PP_SMOKE_PASSWORD='<geschäftsführer-passwort>' \
PP_SMOKE_TOTP=123456 \
./scripts/qa-smoke.sh
```

### ENV-Variablen

| Variable | Pflicht | Default | Bedeutung |
|---|---|---|---|
| `BASE_URL` | – | `http://localhost:3000` | Base-URL der Instanz. Prod: `https://api.prozesspilot.net` |
| `PP_SMOKE_TENANT_ID` | **ja** | – | Echte Tenant-UUID des Pilot-Wirts (aus der `tenants`-Tabelle) |
| `PP_SMOKE_EMAIL` | **ja** | – | Geschäftsführer-Email (Notfall-Login ist gf-only) |
| `PP_SMOKE_PASSWORD` | **ja** | – | Geschäftsführer-Passwort |
| `PP_SMOKE_TOTP` | einer von 3 | – | 6-stelliger TOTP-Code (**läuft nach 30 s ab** — kurz vor dem Lauf generieren) |
| `PP_SMOKE_TOTP_SECRET` | einer von 3 | – | Base32-TOTP-Secret (Skript generiert den Code via `oathtool`) |
| `PP_SMOKE_BACKUP_CODE` | einer von 3 | – | 12–16-stelliger Backup-Code als Alternative zu TOTP |
| `PP_SMOKE_FILE` | – | `backend/tests/fixtures/test-receipt.pdf` | Beleg-Datei (JPEG/PNG/HEIC/PDF) |
| `PP_SMOKE_SKIP_EXPORT` | – | – | `=1` → Export-Stufe überspringen (Teil-Smoke ohne Lexware-Credentials) |
| `PP_SMOKE_OCR_TIMEOUT` | – | `180` | Max. Sekunden Warten auf OCR |
| `PP_SMOKE_POLL_INTERVAL` | – | `5` | Poll-Intervall in Sekunden |

### Exit-Codes

| Code | Bedeutung |
|---|---|
| `0` | Alle harten Stufen bestanden (echter Beleg bis Lexware Office) |
| `1` | Mindestens eine harte Stufe fehlgeschlagen |
| `2` | Fehlkonfiguration (fehlende ENV / fehlendes Tool) |

---

## Der Test-Beleg (Fixture)

Default ist `backend/tests/fixtures/test-receipt.pdf` — ein **neutrales** Test-PDF (kein PII). Für einen aussagekräftigen Durchlauf (OCR liefert echte Felder, KI kategorisiert sinnvoll) einen **realistischen, aber PII-freien** Beleg via `PP_SMOKE_FILE` übergeben — z. B. einen selbst erstellten Kassenbon mit Fantasie-Händler und neutralen Beträgen.

> **Nie** einen echten Kundenbeleg (mit personenbezogenen Daten) ins Repo committen — DSGVO. Die Datei wird nur lokal über `PP_SMOKE_FILE` referenziert.

---

## Hinweise zum Verhalten

- **Idempotenz:** Wird derselbe Beleg zweimal hochgeladen, erkennt das Backend den SHA256-Hash und liefert den bestehenden Beleg (HTTP 200, `is_duplicate`). Das Skript warnt und nutzt den bestehenden Beleg. Für einen **frischen** End-to-End-Durchlauf eine eindeutige Datei verwenden.
- **`requires_review`:** Liegt die KI-Confidence unter 0,75, landet der Beleg in `requires_review` statt `categorized` — dann ist er **kein** Auto-Export-Kandidat, und Stufe 6 zeigt `pushed=0`. Das Skript meldet das als Warnung (kein harter Fehler): die Pipeline lief technisch, das Ergebnis braucht aber manuelle Prüfung.
- **`pushed=0, skipped>0`:** Der Beleg war bereits exportiert (Idempotenz des Lexware-Pushs). Auch das ist kein Fehler.
- **Rate-Limit:** Der Notfall-Login ist auf 5 Versuche/15 Min limitiert. Bei wiederholten Läufen mit abgelaufenem TOTP droht ein Lockout — dann 15 Min warten.

---

## Verwandt

- CI-Smoke (Health + Metrics, in-process): `backend/tests/smoke.test.ts` (läuft in der Pipeline).
- Prod-Health-Checks: `infra/runbook/05_monitoring_checks.md`.
