# T098 — Erster echter Durchlauf: Teil-Smoke ohne Export (Schritt 3 von 4)

**ID:** T098
**Verantwortlich:** Steve (Operator, GF-Login nötig)
**Priorität:** **P0** — **das ist der Meilenstein**
**Branch:** `server/T098-erster-durchlauf` (nur für Doku-Änderungen; der Lauf selbst ist manuell)
**Geschätzt:** 0,5 Tage
**Dependencies:** **T096** und **T097** müssen erledigt sein
**Ziel-Meilenstein:** Vorstufe zum F4-Tor
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

`scripts/qa-smoke.sh` **mit `PP_SMOKE_SKIP_EXPORT=1`** gegen die Production-Instanz
fahren. Damit läuft die Kette

```
Health → Ready → /metrics → Login (M14-Notfall) → Upload → OCR (Worker) → Categorize (M03)
```

zum ersten Mal mit einem **echten Beleg** und **echten externen Diensten** durch.

### Warum diese Task getrennt von T099 existiert

Der volle Smoke-Test braucht Lexware-Credentials — und die kommen von der
**Steuerberaterin des Pilot-Wirts**, also von einer externen Person mit eigener
Terminlage. Diese Abhängigkeit darf den Beweis der Kernkette **nicht** blockieren.

`PP_SMOKE_SKIP_EXPORT=1` überspringt genau die Export-Stufe. Damit ist der wertvollste
Teil — dass Upload, OCR und KI-Kategorisierung in Produktion wirklich funktionieren —
**heute** beweisbar, ohne auf irgendwen zu warten.

Schritt **3 von 4**: T096 → T097 → **T098 (diese)** → T099 (Lexware + volles F4-Tor).

---

## Vorbereitung

### Werkzeuge (auf dem Rechner des Operators)
- `curl` — Pflicht
- `jq` — Pflicht
- `oathtool` — optional, aber empfohlen: `brew install oath-toolkit`
  (generiert den TOTP-Code selbst; sonst muss man ihn in 30 Sekunden von Hand eintippen)

### Test-Mandant
`PP_SMOKE_TENANT_ID` braucht eine **echte Tenant-UUID** aus der `tenants`-Tabelle.
Falls noch keiner existiert: über die Mitarbeiter-Webapp („Neuer Kunde", T093) einen
Test-Mandanten anlegen und die UUID notieren.

### Geschäftsführer-Login
Das Notfall-Login ist **gf-only**. Der Bootstrap-Admin wurde am 2026-05-19 gegen die
Production-DB ausgeführt, das Konto existiert also. Benötigt: Email, Passwort und
zweiter Faktor.

> Die `JWT_SECRET`-Rotation aus T096 macht nur **bestehende Sessions** ungültig —
> Passwort und TOTP-Secret bleiben gültig.

---

## Aufruf

```bash
BASE_URL=https://api.prozesspilot.net \
PP_SMOKE_TENANT_ID=<echte-tenant-uuid> \
PP_SMOKE_EMAIL=steve@prozesspilot.net \
PP_SMOKE_PASSWORD='<gf-passwort>' \
PP_SMOKE_TOTP_SECRET='<base32-secret>' \
PP_SMOKE_SKIP_EXPORT=1 \
./scripts/qa-smoke.sh
```

⚠️ Bei `PP_SMOKE_TOTP` statt `PP_SMOKE_TOTP_SECRET`: Der Code **läuft nach 30 Sekunden ab** —
unmittelbar vor dem Aufruf generieren, sonst bricht der Login mit `totp_invalid` ab.

⚠️ Nach zu vielen Fehlversuchen greift das Rate-Limit → **15 Minuten Sperre**. Also
Zugangsdaten vorher prüfen, nicht raten.

---

## Akzeptanz-Kriterien

- [ ] Skript endet mit **Exit-Code 0** (bei gesetztem `PP_SMOKE_SKIP_EXPORT=1`)
- [ ] `GET /api/v1/health` → 200
- [ ] `GET /api/v1/ready` → 200
- [ ] `GET /metrics` → 200 mit `pp_`-Namespace
- [ ] Login erfolgreich (kein `totp_invalid`, kein `rate_limit_*`)
- [ ] `POST /api/v1/belege/upload` → **201** mit `beleg_id`
- [ ] Beleg erreicht Status **`extracted`** innerhalb des OCR-Timeouts (Default 180 s)
- [ ] `POST /api/v1/belege/:id/categorize` → Status **`categorized`**
- [ ] ⚠️ **Nicht** `requires_review` mit `confidence = 0` — das wäre der stille Fallback aus T097 (kein `CLAUDE_API_KEY` wirksam)
- [ ] Ausgegebene Kategorie + SKR-Konto sind **plausibel** für den Testbeleg (kurz mit menschlichem Auge prüfen — ein grüner Exit-Code beweist nur, dass *irgendetwas* zurückkam)
- [ ] Ergebnis dokumentiert: Datum, Beleg, Kategorie, Confidence, SKR-Konto
- [ ] `MANUELLE_AUFGABEN.md`: Eintrag „Pilot-Smoke-Test gegen Staging/Prod fahren (T050 — F4-Tor)" auf **teilweise erledigt** aktualisiert (Export steht noch aus → T099)

---

## Wenn es fehlschlägt — wo zuerst schauen

| Symptom | Wahrscheinliche Ursache |
|---|---|
| `/ready` → nicht 200 | Migrations nicht angewendet, oder DB/Redis nicht erreichbar → zurück zu T096 |
| Upload → 5xx | Bucket `prozesspilot-raw` fehlt, **oder** `MINIO_*` ≠ `PP_S3_*` (der Fallstrick aus T096) |
| Beleg bleibt in `uploaded`, wird nie `extracted` | OCR-Worker läuft nicht, oder Vision-Credentials greifen nicht |
| Status `ocr_failed` | `GOOGLE_VISION_KEY_FILE` falscher Pfad/Rechte, oder Vision-API nicht aktiviert / kein Billing |
| Backend startet gar nicht | `VISION_API_ENDPOINT` ohne `eu-`-Präfix → DSGVO-Hard-Fail (`config.ts:255`) |
| `requires_review`, `confidence = 0` | `CLAUDE_API_KEY` nicht wirksam → T097, Falle 1 |
| Login `totp_invalid` | Code älter als 30 s |
| Login `rate_limit_*` | 15 Minuten warten |

---

## Spec-Referenzen

- `scripts/qa-smoke.README.md` — vollständige Beschreibung des F4-Tors
- `.claude/CLAUDE.md` §3.7 — Tor pro Bau-Schritt: Smoke-Test grün, bevor der nächste Schritt startet
- `tasks/MANUELLE_AUFGABEN.md` — Eintrag T050

---

## Notes

**Was dieser Lauf beweist — und was nicht.**
Er beweist, dass Upload, Speicherung, OCR und KI-Kategorisierung in Produktion mit
echten Diensten funktionieren. Er beweist **nicht**, dass die Übergabe an die
Steuerberaterin funktioniert — das ist T099.

**Was dieser Lauf wert ist.**
Bis heute (Stand 2026-08-07) hat das System **keinen einzigen echten Beleg** verarbeitet.
Ein grüner Lauf sagt mehr über den tatsächlichen Projektstand als jede Test-Suite:
1.233 grüne Unit-Tests beweisen, dass der Code *in sich* stimmt — nicht, dass er
gegen die reale Welt läuft.

---

## Offene Fragen (während der Bearbeitung)

<keine>

---

## Lessons Learned (nach Abschluss)

<nach Abschluss ausfüllen>
