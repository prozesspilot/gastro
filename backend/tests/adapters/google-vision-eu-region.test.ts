/**
 * Unit-Tests für den Vision-Adapter — CLAUDE.md §5.4 EU-Region.
 *
 * Verifiziert, dass beide Vision-Clients (M01 BullMQ-Adapter und M03 Inline-Handler)
 * mit `apiEndpoint` initialisiert werden, sodass Vision-API-Calls in EU bleiben.
 * Default ist 'eu-vision.googleapis.com' (europe-west3, Frankfurt).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const constructorCalls: Array<{ keyFilename?: string; apiEndpoint?: string }> = [];

class FakeImageAnnotatorClient {
  constructor(opts: { keyFilename?: string; apiEndpoint?: string }) {
    constructorCalls.push(opts);
  }
  async documentTextDetection(_req: unknown): Promise<unknown[]> {
    return [{ fullTextAnnotation: { text: '', pages: [] } }];
  }
  async batchAnnotateFiles(_req: unknown): Promise<unknown[]> {
    return [{ responses: [{ responses: [{ fullTextAnnotation: { text: '', pages: [] } }] }] }];
  }
  async close(): Promise<void> {}
}

vi.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: FakeImageAnnotatorClient,
}));

beforeEach(() => {
  constructorCalls.length = 0;
});

afterEach(() => {
  vi.resetModules();
});

describe('Google-Vision Adapter — EU-Region Pflicht (CLAUDE.md §5.4)', () => {
  it('M01 BullMQ-Adapter übergibt Default-EU-Endpoint an ImageAnnotatorClient', async () => {
    process.env.GOOGLE_VISION_KEY_FILE = '/tmp/fake-key.json';
    Reflect.deleteProperty(process.env, 'VISION_API_ENDPOINT');

    vi.resetModules();
    const { GoogleVisionAdapter, __resetVisionClientForTests } = await import(
      '../../src/core/adapters/ocr/google-vision.adapter'
    );
    __resetVisionClientForTests();

    const adapter = new GoogleVisionAdapter();
    await adapter.extract(Buffer.from([0xff, 0xd8, 0xff, 0xe0]) /* JPEG-Header */);

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toEqual({
      keyFilename: '/tmp/fake-key.json',
      apiEndpoint: 'eu-vision.googleapis.com',
    });
  });

  it('M01 Adapter respektiert VISION_API_ENDPOINT-Override (Test/Local-Dev)', async () => {
    process.env.GOOGLE_VISION_KEY_FILE = '/tmp/fake-key.json';
    process.env.VISION_API_ENDPOINT = 'vision-mock.example.test';

    vi.resetModules();
    const { GoogleVisionAdapter, __resetVisionClientForTests } = await import(
      '../../src/core/adapters/ocr/google-vision.adapter'
    );
    __resetVisionClientForTests();

    const adapter = new GoogleVisionAdapter();
    await adapter.extract(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

    expect(constructorCalls[0]?.apiEndpoint).toBe('vision-mock.example.test');
  });

  it('M03 Inline-Handler übergibt Default-EU-Endpoint an ImageAnnotatorClient', async () => {
    process.env.GOOGLE_VISION_KEY_FILE = '/tmp/fake-key.json';
    Reflect.deleteProperty(process.env, 'VISION_API_ENDPOINT');

    vi.resetModules();
    const m03 = await import('../../src/modules/m03-ocr/ocr.handler');
    m03.__resetM03VisionClientForTests();

    await m03.__triggerM03VisionClientForTests();

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toEqual({
      keyFilename: '/tmp/fake-key.json',
      apiEndpoint: 'eu-vision.googleapis.com',
    });
  });
});
