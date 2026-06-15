# T057 — Generischer Mail-Service (core/mail) + DSGVO-Migration

**ID:** T057
**Verantwortlich:** Steve
**Priorität:** P1 (Build-out Phase A — Fundament, entriegelt Wizard/M09/M08/M11)
**Branch:** `steve/T057-core-mail-service`
**Geschätzt:** 1 Tag
**Dependencies:** keine (nodemailer 8.0.7 + SMTP-Config bereits vorhanden)
**Ziel-Meilenstein:** Build-out Phase A
**Anker:** `00_Buildout_Roadmap.md` §A1 · generalisiert `modules/dsgvo/services/email.service.ts`

---

## Was zu tun ist

Den einzigen vorhandenen Mail-Code (`backend/src/modules/dsgvo/services/email.service.ts`) zu einem
generischen, modul-unabhängigen Service unter `backend/src/core/mail/` verallgemeinern. DSGVO danach
als dünnen Wrapper darauf umstellen (generalisieren statt duplizieren — sonst zwei Mail-Services = Drift).

### Neue Dateien `backend/src/core/mail/`
1. `mail.types.ts` — `Attachment`, `MailMessage`, `MailResult`, `MailTransport` (DI-Interface).
2. `mail.transport.ts` — SMTP via Lazy-`import('nodemailer')` + Cache; `secure = SMTP_PORT === 465`; **einzige** nodemailer-Stelle.
3. `mail.service.ts` — `sendMail`/`sendTemplate` (Best-Effort, wirft NIE), `isDryRun`, `hashEmailForLog`; Transport per `opts.transport` injizierbar.
4. `templates/types.ts` — `MailTemplate<Vars>`.
5. `templates/magic-link.template.ts` + `templates/index.ts` — Referenz-Template (Plain-Text).
6. `mail.service.test.ts` — Vitest (Mock-Transport, Dry-Run, Fehlerpfad, PII-Log, sendTemplate).
7. `README.md` — API, ENV, Dry-Run, **EU-SMTP-Pflicht** (DSGVO §5.4).

### Änderungen
- `backend/src/core/logger.ts` — Redaction-Pfade `'*.pass'`, `'*.SMTP_PASS'` ergänzen (defense-in-depth).
- `backend/src/modules/dsgvo/services/email.service.ts` — interne `sendMail`/`getNodemailer`/`isDryRun`/`hashEmail` löschen; die zwei Public-Funktionen als Wrapper auf `core/mail`.`sendMail`. **Signaturen unverändert** (`Promise<boolean>`).

### Bewusst NICHT in diesem PR (Folge-Tasks)
Bounce-Handling (M11) · Retry/Queue (BullMQ) · `mail_events`-Tabelle/Idempotenz · HTML-Template-Engine · Mailhog-CI.

---

## Akzeptanz-Kriterien
- [ ] `backend/src/core/mail/` mit den 7 Dateien; `npm run build` + `npm test` grün
- [ ] `sendMail` Best-Effort: wirft nie, gibt `{ ok, ... }`; Transport-Fehler ⇒ `{ ok: false, error }`
- [ ] Dry-Run (SMTP_HOST leer): Transport NICHT aufgerufen, `{ ok: true, dryRun: true }`, Log `[mail] DRY-RUN`
- [ ] PII-Test: volle Mail-Adresse erscheint NIE im Log, nur `to_hash` (12 Hex)
- [ ] DI-Test: Mock-`MailTransport`, Args (to/subject/from/attachments) korrekt durchgereicht
- [ ] `sendTemplate` rendert `subject`/`text` aus Vars; `html` durchgereicht
- [ ] DSGVO-Wrapper rufen `core/mail`.`sendMail`; DSGVO-Tests bleiben OHNE Änderung grün
- [ ] Keine zweite `createTransport`-Stelle (`git grep createTransport` = nur `core/mail/mail.transport.ts`)
- [ ] `biome check` auf allen geänderten Files sauber

## Offene Fragen (GF — blockieren PR NICHT, nur Prod-Versand ab Phase B)
1. EU-SMTP-Anbieter: IONOS-Mail vs. Mailjet EU (besseres Bounce-API). Vor Wizard-Prod-Versand.
2. Absender: zentral `noreply@prozesspilot.net` (Annahme für PR 1) vs. pro-Tenant (eigene SPF/DKIM-Task).

## Spec-Referenzen
- `Modulkonzept/Konzeptentwicklung/00_Buildout_Roadmap.md` §A1
- `.claude/CLAUDE.md` §5.4 (EU-Hosting), §6.6 (keine Secrets/PII in Logs)
- Vorlage: `backend/src/modules/dsgvo/services/email.service.ts`
