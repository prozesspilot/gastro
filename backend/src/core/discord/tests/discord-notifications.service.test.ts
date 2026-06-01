/**
 * T031 — Unit-Tests fuer discord-notifications.service.ts
 *
 * Testet:
 * - sendDiscordWebhook: kein throw bei Netzwerkfehler, korrekter POST-Body,
 *   kein Call wenn webhookUrl leer, Farb-Mapping
 * - notifyAlert: @everyone-Mention, rote Farbe, best-effort
 * - notifyNewTask: korrekte Felder, Prioritaets-Emoji
 * - notifyDeploy: success/failure-Farben, Commit-Hash
 *
 * Sicherheit: keine echten Webhook-URLs in Tests (Mocks ueberschreiben fetch).
 */

import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyAlert,
  notifyDeploy,
  notifyNewTask,
  sendDiscordWebhook,
} from '../discord-notifications.service';

// ---------------------------------------------------------------------------
// Test-Infrastruktur
// ---------------------------------------------------------------------------

const FAKE_WEBHOOK_URL = 'https://discord.com/api/webhooks/FAKE/TOKEN';

function makeLogger(): Logger {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

function makeFetchOk(capturedBodies: unknown[]): typeof fetch {
  return vi.fn(async (_url: string | URL, init?: RequestInit) => {
    if (init?.body) {
      capturedBodies.push(JSON.parse(init.body as string));
    }
    return { ok: true, status: 204, statusText: 'No Content' } as Response;
  }) as unknown as typeof fetch;
}

function makeFetchFail(): typeof fetch {
  return vi.fn(async () => {
    throw new Error('Network error');
  }) as unknown as typeof fetch;
}

function makeFetchHttpError(): typeof fetch {
  return vi.fn(async () => ({
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
  })) as unknown as typeof fetch;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// sendDiscordWebhook
// ---------------------------------------------------------------------------

describe('sendDiscordWebhook', () => {
  it('sendet POST mit JSON-Body an Webhook-URL', async () => {
    const bodies: unknown[] = [];
    const fetchMock = makeFetchOk(bodies);
    const logger = makeLogger();

    await sendDiscordWebhook(FAKE_WEBHOOK_URL, { content: 'Hallo Welt' }, logger, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(FAKE_WEBHOOK_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(bodies[0]).toMatchObject({ content: 'Hallo Welt' });
  });

  it('kein Fetch-Call wenn webhookUrl leer', async () => {
    const fetchMock = vi.fn();
    const logger = makeLogger();

    await sendDiscordWebhook('', { content: 'test' }, logger, fetchMock as unknown as typeof fetch);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('kein throw bei Netzwerkfehler (best-effort)', async () => {
    const logger = makeLogger();

    // Darf keinen Fehler werfen
    await expect(
      sendDiscordWebhook(FAKE_WEBHOOK_URL, { content: 'x' }, logger, makeFetchFail()),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.stringContaining('Network error') }),
      expect.stringContaining('[discord]'),
    );
  });

  it('kein throw bei HTTP-Fehler (best-effort)', async () => {
    const logger = makeLogger();

    await expect(
      sendDiscordWebhook(FAKE_WEBHOOK_URL, { content: 'x' }, logger, makeFetchHttpError()),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 429 }),
      expect.stringContaining('[discord]'),
    );
  });

  it('Farb-Mapping: "error" → 0xE74C3C als Zahl', async () => {
    const bodies: unknown[] = [];
    const fetchMock = makeFetchOk(bodies);
    const logger = makeLogger();

    await sendDiscordWebhook(
      FAKE_WEBHOOK_URL,
      {
        embeds: [{ title: 'Test', color: 'error' }],
      },
      logger,
      fetchMock,
    );

    const body = bodies[0] as { embeds: Array<{ color: number }> };
    expect(body.embeds[0].color).toBe(0xe74c3c);
  });

  it('Farb-Mapping: "success" → 0x2ECC71', async () => {
    const bodies: unknown[] = [];
    await sendDiscordWebhook(
      FAKE_WEBHOOK_URL,
      { embeds: [{ title: 'T', color: 'success' }] },
      makeLogger(),
      makeFetchOk(bodies),
    );
    const body = bodies[0] as { embeds: Array<{ color: number }> };
    expect(body.embeds[0].color).toBe(0x2ecc71);
  });

  it('Date-Objekt als timestamp wird zu ISO-String', async () => {
    const bodies: unknown[] = [];
    const ts = new Date('2026-06-01T12:00:00Z');

    await sendDiscordWebhook(
      FAKE_WEBHOOK_URL,
      { embeds: [{ title: 'T', timestamp: ts }] },
      makeLogger(),
      makeFetchOk(bodies),
    );

    const body = bodies[0] as { embeds: Array<{ timestamp: string }> };
    expect(body.embeds[0].timestamp).toBe('2026-06-01T12:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// notifyAlert
// ---------------------------------------------------------------------------

describe('notifyAlert', () => {
  it('sendet rotes Embed mit @everyone wenn pingEveryone=true', async () => {
    const bodies: unknown[] = [];
    const logger = makeLogger();

    await notifyAlert(
      FAKE_WEBHOOK_URL,
      { title: 'Kritischer Fehler', pingEveryone: true },
      logger,
      makeFetchOk(bodies),
    );

    const body = bodies[0] as {
      content: string;
      allowed_mentions: { parse: string[] };
      embeds: Array<{ title: string; color: number }>;
    };
    expect(body.content).toBe('@everyone');
    expect(body.allowed_mentions.parse).toContain('everyone');
    expect(body.embeds[0].title).toContain('Kritischer Fehler');
    expect(body.embeds[0].color).toBe(0xe74c3c); // error-Rot
  });

  it('kein @everyone wenn pingEveryone nicht gesetzt', async () => {
    const bodies: unknown[] = [];

    await notifyAlert(FAKE_WEBHOOK_URL, { title: 'Warn' }, makeLogger(), makeFetchOk(bodies));

    const body = bodies[0] as { content?: string; allowed_mentions: { parse: string[] } };
    expect(body.content).toBeUndefined();
    expect(body.allowed_mentions.parse).not.toContain('everyone');
  });

  it('best-effort: kein throw bei Netzwerkfehler', async () => {
    await expect(
      notifyAlert(FAKE_WEBHOOK_URL, { title: 'X' }, makeLogger(), makeFetchFail()),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// notifyNewTask
// ---------------------------------------------------------------------------

describe('notifyNewTask', () => {
  it('Kritisch-Task: 🚨-Emoji + rote Farbe', async () => {
    const bodies: unknown[] = [];

    await notifyNewTask(
      FAKE_WEBHOOK_URL,
      {
        id: 'task-1',
        title: 'Test-Task',
        type: 'datev_fehler',
        priority: 'kritisch',
        tenantName: 'Müller-Bistro',
      },
      makeLogger(),
      makeFetchOk(bodies),
    );

    const body = bodies[0] as { embeds: Array<{ title: string; color: number }> };
    expect(body.embeds[0].title).toContain('🚨');
    expect(body.embeds[0].color).toBe(0xe74c3c); // error = rot fuer kritisch
  });

  it('Normal-Task: 📋-Emoji + blaue Farbe', async () => {
    const bodies: unknown[] = [];

    await notifyNewTask(
      FAKE_WEBHOOK_URL,
      { id: 'task-2', title: 'T', type: 'beleg_pruefen', priority: 'normal' },
      makeLogger(),
      makeFetchOk(bodies),
    );

    const body = bodies[0] as { embeds: Array<{ title: string; color: number }> };
    expect(body.embeds[0].title).toContain('📋');
    expect(body.embeds[0].color).toBe(0x3498db); // info = blau
  });

  it('webapp-URL erscheint als Feld wenn gesetzt', async () => {
    const bodies: unknown[] = [];

    await notifyNewTask(
      FAKE_WEBHOOK_URL,
      {
        id: 'task-3',
        title: 'T',
        type: 'onboarding',
        priority: 'normal',
        webappUrl: 'https://admin.prozesspilot.net/tasks/task-3',
      },
      makeLogger(),
      makeFetchOk(bodies),
    );

    const body = bodies[0] as { embeds: Array<{ fields: Array<{ name: string; value: string }> }> };
    const linkField = body.embeds[0].fields.find((f) => f.name === 'Link');
    expect(linkField).toBeDefined();
    expect(linkField?.value).toContain('https://admin.prozesspilot.net/tasks/task-3');
  });
});

// ---------------------------------------------------------------------------
// notifyDeploy
// ---------------------------------------------------------------------------

describe('notifyDeploy', () => {
  it('success: gruenes Embed mit ✅', async () => {
    const bodies: unknown[] = [];

    await notifyDeploy(
      FAKE_WEBHOOK_URL,
      { status: 'success', branch: 'main', commit: 'abc1234567890' },
      makeLogger(),
      makeFetchOk(bodies),
    );

    const body = bodies[0] as { embeds: Array<{ title: string; color: number }> };
    expect(body.embeds[0].title).toContain('✅');
    expect(body.embeds[0].color).toBe(0x2ecc71); // success = gruen
  });

  it('failure: rotes Embed mit ❌', async () => {
    const bodies: unknown[] = [];

    await notifyDeploy(
      FAKE_WEBHOOK_URL,
      { status: 'failure', branch: 'andreas/T031-discord' },
      makeLogger(),
      makeFetchOk(bodies),
    );

    const body = bodies[0] as { embeds: Array<{ title: string; color: number }> };
    expect(body.embeds[0].title).toContain('❌');
    expect(body.embeds[0].color).toBe(0xe74c3c); // error = rot
  });

  it('Commit-Hash wird auf 8 Zeichen gekuerzt', async () => {
    const bodies: unknown[] = [];

    await notifyDeploy(
      FAKE_WEBHOOK_URL,
      { status: 'success', branch: 'main', commit: 'abcdef1234567890' },
      makeLogger(),
      makeFetchOk(bodies),
    );

    const body = bodies[0] as { embeds: Array<{ fields: Array<{ value: string }> }> };
    const commitField = body.embeds[0].fields.find((f) => f.value.includes('abcdef12'));
    expect(commitField).toBeDefined();
    // Kein vollstaendiger Hash sichtbar
    const fullHashField = body.embeds[0].fields.find((f) => f.value.includes('abcdef1234567890'));
    expect(fullHashField).toBeUndefined();
  });
});
