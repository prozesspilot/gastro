# T097 — OCR + KI-Kategorisierung scharf schalten (Schritt 2 von 4)

**ID:** T097
**Verantwortlich:** Steve (externe Konten) — Andreas unterstützt bei ENV/Deploy
**Priorität:** **P0** — ohne diese Zugänge verarbeitet das System keinen Beleg sinnvoll
**Branch:** `server/T097-ocr-ki-credentials`
**Geschätzt:** 0,5–1 Tag (überwiegend Konten anlegen, wenig Code)
**Dependencies:** **T096** muss erledigt sein (Instanz muss `/ready` → 200 liefern)
**Ziel-Meilenstein:** F4-Tor (Pilot-Smoke-Test)
**Discord-Channel:** #dev-coordination

---

## Was zu tun ist

Zwei externe Zugänge besorgen und eintragen: **Google Cloud Vision** (OCR) und
**Anthropic Claude** (Kategorisierung). Beide sind die einzigen echten Blocker
zwischen „Beleg wird hochgeladen" und „Beleg ist ausgelesen und kategorisiert".

Schritt **2 von 4**: T096 → **T097 (diese)** → T098 (Teil-Smoke) → T099 (Lexware).

---

## ⚠️ Zwei Fallen, die man nur einmal erlebt

### 1. Ohne `CLAUDE_API_KEY` scheitert nichts — es wird nur still nutzlos

`belege-categorizer.ts:234` prüft den Key. Fehlt er, wird **kein** Fehler geworfen:
Der Beleg bekommt `sonstige_aufwand`, `confidence = 0` und landet in
**`requires_review`**. Kein Absturz, keine rote Meldung, kein Log-Alarm.

Aus Betreiber-Sicht sieht das aus wie „die KI ist unsicher" — tatsächlich läuft
gar keine KI. **Wenn im Smoke-Test alle Belege in `requires_review` landen, ist
das der erste Verdacht.**

### 2. Ein Nicht-EU-Vision-Endpoint verhindert den Start komplett

`core/config.ts:255` bricht in `NODE_ENV=production` **hart ab**, wenn
`VISION_API_ENDPOINT` nicht mit `eu-` beginnt:

```
FATAL: VISION_API_ENDPOINT "…" ist kein EU-Endpoint (DSGVO §5.4).
```

Das ist Absicht (CLAUDE.md §5.4: Beleg-Bilder enthalten PII und dürfen die EU nicht
verlassen). Wer den Default überschreibt, legt das Backend lahm — was hier die
**richtige** Reaktion ist.

---

## Schritte

### A. Google Cloud Vision (OCR)

Die Detailschritte stehen bereits in `tasks/MANUELLE_AUFGABEN.md` unter
„Google Cloud Vision API — Projekt + Service-Account einrichten (T007)" — dort
abarbeiten. Kurzfassung:

1. GCP-Projekt `prozesspilot-prod`, Region **`europe-west3`**
2. Billing verknüpfen (~1,50 EUR bei 1000 Calls/Monat)
3. Vision API aktivieren
4. Service-Account + JSON-Key
5. Key auf den Server: `/etc/prozesspilot/gcp-vision.json`, `chown gastro:gastro`, `chmod 600`

ENV in `.env.prod`:
```
GOOGLE_VISION_KEY_FILE=/etc/prozesspilot/gcp-vision.json
VISION_API_ENDPOINT=eu-vision.googleapis.com    # NICHT ändern (DSGVO-Hard-Fail)
```

### B. Anthropic Claude (Kategorisierung)

1. API-Key aus der Anthropic Console holen
2. In `.env.prod` **und** in die GitHub-Secrets eintragen:
```
CLAUDE_API_KEY=<key>
CLAUDE_MODEL=<siehe offene Frage unten>
```

### C. Neu erzeugen, nicht neu starten

```bash
docker compose up -d --force-recreate
```
`.env.prod`-Änderungen greifen **nicht** über `restart` (Memory `prod-env-change-recreate`).

---

## Akzeptanz-Kriterien

- [ ] GCP-Projekt in `europe-west3`, Vision API aktiv, Billing verknüpft
- [ ] JSON-Key auf dem Server, `chmod 600`, Eigentümer `gastro` — **nicht** im Repo
- [ ] `GOOGLE_VISION_KEY_FILE` gesetzt und lesbar
- [ ] `VISION_API_ENDPOINT` beginnt mit `eu-` (Backend startet → Beweis, dass der Guard zufrieden ist)
- [ ] `CLAUDE_API_KEY` in `.env.prod` **und** GitHub-Secrets
- [ ] Container via `up -d --force-recreate` neu erzeugt
- [ ] **Funktionsnachweis OCR:** ein Testbeleg erreicht Status `extracted` (nicht `ocr_failed`)
- [ ] **Funktionsnachweis KI:** derselbe Beleg erreicht `categorized` — **nicht** `requires_review` mit `confidence = 0` (das wäre der stille Fallback aus Falle 1)
- [ ] Keine Secrets in Logs (§6.6), kein Key im Repo
- [ ] `MANUELLE_AUFGABEN.md`: T007-Punkt abgehakt, `CLAUDE_API_KEY` als **eigener** Punkt geführt (steht bisher nur versteckt im Sammel-Eintrag „GitHub-Secrets pflegen")

---

## Spec-Referenzen

- `.claude/CLAUDE.md` §5.4 — EU-Hosting, Vision in `europe-west3`, Anthropic via SCCs
- `.claude/CLAUDE.md` §6.6 — Secrets nie im Code / nie in Logs
- `backend/src/modules/m03-categorization/README.md` — Verhalten ohne `CLAUDE_API_KEY`
- `tasks/MANUELLE_AUFGABEN.md` — Eintrag T007 (GCP-Detailschritte)

---

## Offene Fragen (während der Bearbeitung)

**Welches Claude-Modell soll `CLAUDE_MODEL` verwenden?**
Der Default in `core/config.ts:38` ist `claude-sonnet-4-6` — eine ältere Generation.
Aktuell verfügbar sind die Claude-5-Modelle (z. B. `claude-sonnet-5`) sowie Haiku 4.5.
Ein neueres Modell dürfte bei der Beleg-Kategorisierung genauer sein, kostet aber
möglicherweise anders. **Vor dem Setzen mit dem GF klären und die Entscheidung hier
dokumentieren — nicht raten (§7.4).** Wenn gewechselt wird: den Default in `config.ts`
mitziehen, damit Code und Betrieb nicht auseinanderlaufen.

---

## Lessons Learned (nach Abschluss)

<nach Abschluss ausfüllen>
