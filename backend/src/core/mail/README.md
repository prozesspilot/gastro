# core/mail — Generischer Mail-Service (T057, Build-out A1)

Der **eine** Mail-Service für das ganze Backend (Onboarding-Wizard, M09, M08, M11, DSGVO …).
Kein Modul baut seinen eigenen — neue Mail = neues **Template**, kein zweiter Service.

## API

```ts
import { sendMail, sendTemplate } from '@/core/mail/mail.service';

// 1) Direkt
const r = await sendMail({ to, subject, text, html?, attachments? });
if (!r.ok) logger.warn(r.error);          // Best-Effort: wirft NIE

// 2) Aus Template (typsicher)
import { magicLinkTemplate } from '@/core/mail/templates';
await sendTemplate(magicLinkTemplate, { magicLinkUrl, ttlMinutes: 30 }, to);
```

`sendMail`/`sendTemplate` werfen **nie** — sie liefern `MailResult` (`{ ok:true, dryRun, messageId? }`
oder `{ ok:false, error }`). Ein Mail-Fehler darf nie einen Request abbrechen.

## ENV (Schema in `core/config.ts`)

| Var | Default | Zweck |
|---|---|---|
| `SMTP_HOST` | `''` | leer ⇒ **Dry-Run** (nur Log, kein Versand) |
| `SMTP_PORT` | `587` | 587 = STARTTLS, 465 = TLS |
| `SMTP_USER` | `''` | leer ⇒ Dry-Run |
| `SMTP_PASS` | `''` | (redacted im Log) |
| `SMTP_FROM` | `noreply@prozesspilot.net` | Absender |

**Dry-Run** (Dev/Test/CI): ohne `SMTP_HOST`/`SMTP_USER` wird nichts versendet, nur PII-sicher geloggt.

## ⚠️ EU-Hosting (DSGVO §5.4)

Der SMTP-Anbieter **muss EU-gehostet** sein (IONOS-Mail oder Mailjet EU, jeweils mit AVV).
**Kein** SendGrid/SES/Postmark (US-Hosting). Das wird im Code nicht erzwungen — es ist eine
Betriebs-/Vertragsentscheidung (siehe `tasks/MANUELLE_AUFGABEN.md`, T010).

## Nicht enthalten (Folge-Tasks)

Bounce-Handling (M11) · Retry/Queue (BullMQ) · `mail_events`-Tabelle/Idempotenz · HTML-Template-Engine.

## Templates

Pro Mail-Typ ein `MailTemplate<Vars>` (`subject`/`text`/optional `html`). Modul-spezifische
Templates liegen **beim Modul**; nur generische (z. B. `magic-link`) hier unter `templates/`.
