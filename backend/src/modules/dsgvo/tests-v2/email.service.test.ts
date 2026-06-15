/**
 * T057 — DSGVO-Mail-Wrapper auf core/mail.
 *
 * Kein Mock: läuft gegen das echte core/mail im Dry-Run (SMTP nicht konfiguriert
 * in Test-Env). Beweist, dass die Wrapper `MailResult.ok` korrekt auf `boolean`
 * mappen — der Regressionsanker für die T057-Migration (sonst mocken alle
 * DSGVO-Tests den Mail-Service komplett weg).
 */

import { describe, expect, it, vi } from 'vitest';

// Deterministischer Dry-Run: config (von core/mail gelesen) ohne SMTP → kein
// echter Versand, unabhängig von der Test-Umgebung.
vi.mock('../../../core/config', () => ({
  config: {
    SMTP_HOST: '',
    SMTP_PORT: 587,
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_FROM: 'noreply@prozesspilot.net',
  },
}));

import { sendAuskunftReadyMail, sendLoeschungConfirmMail } from '../services/email.service';

describe('DSGVO email.service — Wrapper auf core/mail (Dry-Run → true)', () => {
  it('sendAuskunftReadyMail mappt Dry-Run-Erfolg auf true', async () => {
    const ok = await sendAuskunftReadyMail({
      to: 'wirt@example.com',
      downloadUrl: 'https://prozesspilot.net/d/abc',
      zipPassword: 'pw',
      ttlDays: 7,
    });
    expect(ok).toBe(true);
  });

  it('sendLoeschungConfirmMail mappt Dry-Run-Erfolg auf true', async () => {
    const ok = await sendLoeschungConfirmMail({
      to: 'wirt@example.com',
      confirmUrl: 'https://prozesspilot.net/c/abc',
      ttlMinutes: 30,
    });
    expect(ok).toBe(true);
  });
});
