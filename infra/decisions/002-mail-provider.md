# ADR-002: Mail-Provider für M08/M09

**Status:** Vorgeschlagen  
**Datum:** 2026-05-04  
**Entscheider:** Solo-Agent (autonom/solo)

## Kontext

M08 (Monatsreporting) und M09 (Lieferanten-Kommunikation) müssen E-Mails versenden.

## Optionen

| Provider | Pro | Con | Kosten |
|----------|-----|-----|--------|
| **Resend** | Modernes TypeScript SDK, einfache API, 100 E-Mails/Tag kostenlos | Neueres Produkt, kleinere Community | 20$/Monat für 50k E-Mails |
| **Brevo (Sendinblue)** | Bewährt, Template-Management, Multi-Channel | Ältere API, stärker limitiert in Free-Tier | 25$/Monat für 20k E-Mails |
| **Nodemailer + SMTP** | Open Source, kein Lock-in, überall einsetzbar | Kein Delivery-Tracking, SPAM-Risiko, SMTP-Setup nötig | SMTP-Server-Kosten |

## Entscheidung

**Resend** als primärer Provider.

**Begründung:**
1. Exzellentes TypeScript SDK (`@resend/resend`)
2. React-Email-Integration (HTML-Templates mit React-Komponenten)
3. 100 E-Mails/Tag im Free-Tier reichen für Phase 1 und 2
4. DSGVO-konform (EU-Server wählbar)

**Fallback:** Nodemailer + SMTP (konfigurierbar über ENV) als Plan B.

## Konsequenzen

- `RESEND_API_KEY` als ENV-Variable
- `backend/src/core/mail/` enthält abstrakte `MailService`-Klasse mit `ResendAdapter` und `SmtpAdapter`
- Test: Recorded-Fixtures mit `nock` (kein echter API-Call in CI)

## Implementierungs-Hinweis

```typescript
// backend/src/core/mail/mail.service.ts
export interface MailService {
  send(opts: { to: string; subject: string; html: string; from?: string }): Promise<void>;
}

export class ResendMailService implements MailService {
  constructor(private apiKey: string) {}
  async send(opts: Parameters<MailService['send']>[0]): Promise<void> {
    const { Resend } = await import('resend');
    const resend = new Resend(this.apiKey);
    await resend.emails.send({
      from: opts.from ?? 'ProzessPilot <noreply@prozesspilot.de>',
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  }
}
```
