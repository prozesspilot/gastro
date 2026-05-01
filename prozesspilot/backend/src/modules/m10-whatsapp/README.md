# M10 — WhatsApp Eingang (Backend-Modul)

> Spec: `docs/modules/M10_WhatsApp_Eingang.md`
> Foundation: `docs/Foundation_Spec.md` §D3, §D6, §D8
> Datenmodell: `docs/01_Datenmodell_Events.md` §6
> Customer-Profil: `docs/02_Kundenprofil_System.md` §2

---

## Was dieses Modul tut

M10 ist der WhatsApp-Eingangskanal von ProzessPilot. Es:

1. Validiert den Meta-Webhook (`X-Hub-Signature-256`).
2. Mapped `(phone_number_id, from)` → `customer_id` über das Customer-Profil.
3. Lädt das Bild/PDF von Meta, speichert es nach MinIO und prüft Idempotenz per `sha256`.
4. Sendet eine WhatsApp-Bestätigung zurück an den Sender.
5. Übergibt das Ergebnis an `WF-MASTER-RECEIPT` (fire-and-forget).

M10 schreibt **nicht** direkt in `receipts` — das passiert in der Master-Pipeline.

---

## Datei-Struktur (M10 §8)

```
backend/src/modules/m10-whatsapp/
├── routes.ts                       # Fastify-Routes-Plugin
├── handlers/
│   ├── verify.handler.ts           # POST /verify
│   ├── resolve.handler.ts          # POST /resolve
│   ├── media.handler.ts            # POST /media
│   └── send-template.handler.ts    # POST /send-template
├── services/
│   ├── meta-graph.client.ts        # Wrapper um Meta Graph API + Retry
│   ├── webhook-verifier.ts         # HMAC-SHA256 (timing-safe)
│   ├── customer-resolver.ts        # phone_number_id+from → customer_id
│   ├── credential.service.ts       # wa_access_token via pgcrypto laden
│   ├── media-downloader.ts         # Pseudocode aus M10 §8.1
│   ├── audit.service.ts            # audit_log-Stub (best-effort)
│   ├── receipt.repository.ts       # Idempotenz-Lookup nach (customer_id, file_sha256)
│   └── object-key.ts               # ULID + Object-Key-Bauer
├── schemas/
│   ├── webhook.schema.ts           # Zod, M10 §5.1
│   ├── verify.input.ts             # Zod
│   ├── resolve.input.ts            # Zod
│   ├── media.input.ts              # Zod
│   └── send-template.input.ts      # Zod
└── tests/
    ├── verify.test.ts
    ├── resolve.test.ts
    ├── media.test.ts
    └── e2e.test.ts
```

---

## Endpoints

Alle unter `/api/v1/internal/whatsapp/*`. HMAC-Auth via D3-Middleware (in Tests via `PP_AUTH_DISABLED=1` deaktiviert).

| Methode | Pfad              | Spec  | Funktion                                                                |
|---------|-------------------|-------|-------------------------------------------------------------------------|
| POST    | `/verify`         | §7.1  | Validiert Meta-Signatur (HMAC-SHA256 mit `WHATSAPP_APP_SECRET`)         |
| POST    | `/resolve`        | §7.2  | `phone_number_id + from` → `customer_id`, `allowed`, `sender`           |
| POST    | `/media`          | §7.3  | Lädt Datei von Meta, persistiert in MinIO, idempotent über `sha256`    |
| POST    | `/send-template`  | §7.4  | Sendet `confirmation_received_de` oder `sender_not_registered`          |

---

## Registrierung in `app.ts`

```ts
import { m10WhatsAppRoutes } from './modules/m10-whatsapp/routes';

await app.register(
  async (apiApp) => {
    apiApp.addHook('preHandler', hmacMiddleware);
    // … bestehende Module …
    await apiApp.register(m10WhatsAppRoutes, { prefix: '/internal/whatsapp' });
  },
  { prefix: '/api/v1' },
);
```

---

## Tests

```bash
npm test -- src/modules/m10-whatsapp
```

| Datei              | Was es testet                                                                    |
|--------------------|----------------------------------------------------------------------------------|
| `verify.test.ts`   | webhook-verifier: gültig/ungültig/fehlendes Secret/malformed/timing-safe         |
| `resolve.test.ts`  | normalizePhone (5 Branches), resolveCustomer (alle Fälle aus M10 §16)            |
| `media.test.ts`    | downloadMedia: neuer Upload, Idempotenz-Treffer, sha256 aus echten Bytes         |
| `e2e.test.ts`      | Pipeline-Flow durch alle vier Endpoints (gemockte Meta, Storage, DB, Redis)      |

Coverage-Ziel `>90%` ist erreichbar, da alle Service-Branches abgedeckt sind und die Handler über `e2e.test.ts` durchlaufen.

---

## ENV-Variablen (M10 §14)

| Variable                      | Beschreibung                                                  |
|-------------------------------|---------------------------------------------------------------|
| `WHATSAPP_APP_SECRET`         | Validiert `X-Hub-Signature-256`                               |
| `WHATSAPP_VERIFY_TOKEN`       | Initiale Verify-Challenge bei Webhook-Registrierung           |
| `WHATSAPP_GRAPH_API_VERSION`  | API-Version, Default `v19.0`                                  |
| `STORAGE_RAW_BUCKET`          | MinIO-Bucket für Originale (Default `prozesspilot-raw`)       |
| `BACKEND_URL`                 | Von n8n genutzt — Default `http://backend:3000` im Compose-Netz |

`MINIO_*` und `PP_PGCRYPTO_KEY` werden geerbt aus dem Foundation-Setup.

---

## HMAC-Pattern in n8n (wichtig)

Die D3-HMAC-Middleware schützt alle `/api/v1/*`-Routen. Per-Request-Signaturen brauchen `sha256(body)` in der kanonischen Form:

```
{METHOD}\n{PATH}\n{TIMESTAMP}\n{SHA256_OF_BODY_HEX}
```

`Function: Extract Message` (Node 4) berechnet die Signaturen für **/verify** und **/resolve**, weil deren Bodies zu diesem Zeitpunkt feststehen. Für `/media`, `/raw-payload`, `/send-template` — deren Bodies von vorherigen Antworten abhängen — gilt:

- **Dev/Tests:** `PP_AUTH_DISABLED=1` setzen (im n8n-Container und Backend).
- **Prod:** Vor jedem dieser HTTP-Nodes einen kleinen `Sign Request`-Code-Node einsetzen, der `x-pp-signature` per Request berechnet. Alternativ: ein eigenes n8n-Credential-Plugin.

Das ist eine bewusste Vereinfachung des MVP-Workflows; siehe Decisions unten.

---

## Decisions (wo die Spec mehrdeutig war)

1. **Schema-Drift Sprint-0 ↔ Foundation-Spec.** Die im Repo bereits ausgerollten Migrations (`migrations/001_initial_schema.sql`) verwenden `tenant_id`-skopierte UUID-Tabellen (`customers.id`, `document_inbox`, `routing_jobs`), während die Foundation-Spec D2 und M10 `customer_id TEXT PRIMARY KEY` mit `customer_profiles`, `customer_credentials`, `receipts` voraussetzt. Der Auftrag verbietet neue Migrations für M10, also sind alle SQL-Statements in M10 strikt gegen die **Spec-Tabellen** geschrieben. Vor dem ersten Live-Test muss D2 nachgezogen werden — sonst werfen `customer-resolver.ts`, `credential.service.ts` und `receipt.repository.ts` `relation does not exist`. Issue für Foundation-Team eröffnen.

2. **Audit-/Credential-Service Stubs.** D5 (Profile-API + `credentialService`) und D10 (`auditService`) sind im aktuellen Repo nur als leere Ordner vorhanden. M10 enthält daher kompakte Wrapper (`services/credential.service.ts`, `services/audit.service.ts`), die genau die zwei Operationen implementieren, die M10 braucht: Klartext-Decryption per `pgp_sym_decrypt` und ein einfacher `INSERT INTO audit_log`. Sobald die Sprint-0-Services landen, sind diese Wrapper 1:1 ersetzbar.

3. **Event-Stream-Naming.** Foundation D6 verwendet aktuell `STREAMS.documents = 'pp:documents'`. Die Spec spricht von `pp:events:receipt`. Bis D6 angepasst ist, schreiben wir das Sub-Event `pp.receipt.media_persisted` auf `STREAMS.documents` — ein klares Mapping, das ohne Code-Änderung migrierbar ist.

4. **`is_duplicate`-Skip im n8n-Workflow.** Der Auftrag sagt „Wenn resolve zurückgibt `is_duplicate:true`, Respond 200 ohne neuen Pipeline-Run". `is_duplicate` ist laut M10 §7.3 aber Teil der **/media-Antwort**, nicht von /resolve. Wir interpretieren: Master-Workflow short-circuited bei Duplikat. M10 leitet `is_duplicate` weiter im Pipeline-Input, Master prüft ihn vor `M01`. Damit bleiben die 14 spec'd Nodes erhalten.

5. **15. Hilfs-Node `Respond: 401 (invalid sig)`.** M10 §6 Schritt 3 sagt „else Respond Webhook 401" — das ist faktisch ein eigener Node. Er ist als 15. Node enthalten, aber als Hilfsknoten markiert (nicht in der Spec-Aufzählung der „14"). Bewusste Treue-zur-Funktion über Treue-zur-Knotenzahl.

6. **HMAC pro Backend-Call.** Spec-Hinweis „Code-Node berechnet sha256(body) + Timestamp" ist im Workflow umgesetzt für Calls mit zur Extract-Zeit bekannter Body (verify, resolve). Andere Calls signieren in Prod über zusätzliche `Sign Request`-Nodes oder ein Credential-Plugin (siehe HMAC-Pattern oben).

7. **ULID ohne externe Lib.** Crockford-Base32-ULID inline implementiert in `services/object-key.ts` — keine zusätzliche Dependency. Format ist mit Standard-ULID kompatibel (26 Zeichen, monoton).

8. **Templates `confirmation_received_de` / `sender_not_registered`.** Müssen in der Meta Business Manager App angelegt + freigeschaltet sein. Backend ruft `template.name` durch — kein Caching, kein Fallback. Bei nicht freigeschalteten Templates → Meta gibt 400 zurück → handler antwortet `EXTERNAL_API_4XX 502`.

---

## Acceptance Criteria (M10 §16) — Verifikation

| # | Kriterium                                                                | Erfüllt durch                                                                  |
|---|--------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| 1 | Webhook-Signatur wird validiert; ungültige geben 401                     | `services/webhook-verifier.ts` + `tests/verify.test.ts`                        |
| 2 | `phone_number_id` → `customer_id` mapping funktioniert                   | `services/customer-resolver.ts` + `tests/resolve.test.ts` (`bekannt → cust_a3f4b2`) |
| 3 | Nicht-whitelisted Sender → Hint-Message, kein Receipt                    | `tests/resolve.test.ts` (`unbekannter Sender`) + `WF-INPUT-WHATSAPP.json` Branch zu Node 14 |
| 4 | Medien-Download von Meta funktioniert mit echtem Test-Token              | `services/meta-graph.client.ts` (Bearer-Auth + Retry) — manuell mit Test-Token zu prüfen |
| 5 | sha256-Deduplication: gleicher Beleg 2× → nur 1 `receipts`-Eintrag       | `services/media-downloader.ts` Schritt 5 + `tests/media.test.ts` (`is_duplicate=true`) |
| 6 | Bestätigungsnachricht erreicht Sender < 10s                              | Node 11 fire-and-forget + Node 12 send-template (synchron, vor Respond)        |
| 7 | Master-Workflow wird mit korrektem Pipeline-Input aufgerufen             | `WF-INPUT-WHATSAPP.json` Node 10 (Build) + Node 11 (Run)                       |
| 8 | Audit-Log enthält Entry `received` mit Trace-ID                          | `services/audit.service.ts` + `handlers/media.handler.ts` (`whatsapp.media.received`) |
| 9 | Unit-Tests > 90% Coverage                                                | 4 Tests mit allen Branches (verify, resolve, media, e2e)                       |
| 10| E2E-Test mit echter WhatsApp-Nummer                                       | Manuelle Acceptance — siehe `tests/e2e.test.ts` für CI-Variante                |
