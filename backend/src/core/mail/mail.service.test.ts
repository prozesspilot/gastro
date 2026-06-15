/**
 * T057/A1 — Tests für den generischen Mail-Service.
 *
 * Kein echter SMTP: Transport wird per DI gemockt; config + logger gemockt.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mutierbare config — pro Test SMTP an/aus schalten (sendMail liest zur Laufzeit).
vi.mock('../config', () => ({
  config: {
    SMTP_HOST: '',
    SMTP_PORT: 587,
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_FROM: 'noreply@prozesspilot.net',
  },
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { config } from '../config';
import { logger } from '../logger';
import { hashEmailForLog, isDryRun, sendMail, sendTemplate } from './mail.service';
import type { MailTransport } from './mail.types';
import type { MailTemplate } from './templates/types';

function configureSmtp() {
  config.SMTP_HOST = 'smtp.eu.test';
  config.SMTP_USER = 'user';
}

beforeEach(() => {
  vi.clearAllMocks();
  config.SMTP_HOST = '';
  config.SMTP_PORT = 587;
  config.SMTP_USER = '';
  config.SMTP_PASS = '';
  config.SMTP_FROM = 'noreply@prozesspilot.net';
});

describe('mail.service', () => {
  it('Dry-Run ohne SMTP: Transport wird NICHT aufgerufen', async () => {
    const send = vi.fn();
    const r = await sendMail(
      { to: 'wirt@example.com', subject: 'Hi', text: 'Body' },
      { transport: { send } },
    );
    expect(isDryRun()).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, dryRun: true });
  });

  it('verschickt über den Transport, wenn SMTP konfiguriert', async () => {
    configureSmtp();
    const send = vi.fn(async () => ({ messageId: 'msg-1' }));
    const transport: MailTransport = { send };
    const r = await sendMail(
      { to: 'wirt@example.com', subject: 'Hi', text: 'Body' },
      { transport },
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@prozesspilot.net',
        to: 'wirt@example.com',
        subject: 'Hi',
        text: 'Body',
      }),
    );
    expect(r).toEqual({ ok: true, dryRun: false, messageId: 'msg-1' });
  });

  it('reicht from/replyTo/attachments durch', async () => {
    configureSmtp();
    const send = vi.fn(async () => ({ messageId: 'm' }));
    await sendMail(
      {
        to: 'a@b.de',
        subject: 's',
        text: 't',
        from: 'custom@x.de',
        replyTo: 'r@x.de',
        attachments: [
          { filename: 'f.pdf', content: Buffer.from('x'), contentType: 'application/pdf' },
        ],
      },
      { transport: { send } },
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'custom@x.de',
        replyTo: 'r@x.de',
        attachments: [expect.objectContaining({ filename: 'f.pdf' })],
      }),
    );
  });

  it('Best-Effort: Transport-Fehler → { ok:false }, wirft nicht', async () => {
    configureSmtp();
    const send = vi.fn(async () => {
      throw new Error('smtp down');
    });
    const r = await sendMail({ to: 'a@b.de', subject: 's', text: 't' }, { transport: { send } });
    expect(r).toEqual({ ok: false, error: 'smtp down' });
  });

  it('PII: volle Mail-Adresse landet NIE im Log, nur to_hash', async () => {
    configureSmtp();
    const send = vi.fn(async () => ({ messageId: 'm' }));
    await sendMail({ to: 'geheim@wirt.de', subject: 's', text: 't' }, { transport: { send } });
    const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(logged).not.toContain('geheim@wirt.de');
    expect(logged).toContain(hashEmailForLog('geheim@wirt.de'));
  });

  it('hashEmailForLog ist deterministisch + case-insensitive', () => {
    expect(hashEmailForLog('A@B.de')).toBe(hashEmailForLog('a@b.de '));
    expect(hashEmailForLog('a@b.de')).toMatch(/^[0-9a-f]{12}$/);
  });

  it('sendTemplate rendert subject/text/html aus Vars', async () => {
    configureSmtp();
    const send = vi.fn(async () => ({ messageId: 'm' }));
    const tpl: MailTemplate<{ name: string }> = {
      name: 't',
      subject: (v) => `Hi ${v.name}`,
      text: (v) => `Body ${v.name}`,
      html: (v) => `<p>${v.name}</p>`,
    };
    await sendTemplate(tpl, { name: 'Almaz' }, 'a@b.de', { transport: { send } });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Hi Almaz',
        text: 'Body Almaz',
        html: '<p>Almaz</p>',
      }),
    );
  });

  it('sendTemplate: werfender Renderer → { ok:false }, wirft nicht (Best-Effort)', async () => {
    configureSmtp();
    const send = vi.fn(async () => ({ messageId: 'm' }));
    const tpl: MailTemplate<{ x: string }> = {
      name: 'boom',
      subject: () => {
        throw new Error('render kaputt');
      },
      text: () => 'irrelevant',
    };
    const r = await sendTemplate(tpl, { x: 'y' }, 'a@b.de', { transport: { send } });
    expect(r).toEqual({ ok: false, error: 'render kaputt' });
    expect(send).not.toHaveBeenCalled();
  });

  it('Dry-Run loggt KEINEN Body-Inhalt — nur Länge (kein Token-Leak)', async () => {
    const r = await sendMail({ to: 'a@b.de', subject: 's', text: 'GEHEIM_TOKEN_xyz' });
    const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(logged).not.toContain('GEHEIM_TOKEN_xyz');
    expect(logged).toContain('body_len');
    expect(r).toEqual({ ok: true, dryRun: true });
  });
});
