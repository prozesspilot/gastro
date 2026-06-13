/**
 * Unit-Tests für den Google-Vision-Adapter — CLAUDE.md §5.4 EU-Region (DSGVO).
 *
 * Verifiziert, dass der M01-Vision-Adapter den ImageAnnotatorClient mit
 * `apiEndpoint` initialisiert, sodass Vision-API-Calls in der EU bleiben.
 * Default: 'eu-vision.googleapis.com' (europe-west3, Frankfurt).
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

// JPEG-Magic-Bytes → Adapter geht in den Bild-Pfad (documentTextDetection).
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

async function loadAdapter() {
  vi.resetModules();
  const mod = await import('../../src/core/adapters/ocr/google-vision.adapter');
  mod.__resetVisionClientForTests();
  return mod;
}

beforeEach(() => {
  constructorCalls.length = 0;
});

afterEach(() => {
  vi.resetModules();
  Reflect.deleteProperty(process.env, 'VISION_API_ENDPOINT');
});

describe('Google-Vision-Adapter — EU-Region Pflicht (CLAUDE.md §5.4)', () => {
  it('übergibt den Default-EU-Endpoint an den ImageAnnotatorClient', async () => {
    process.env.GOOGLE_VISION_KEY_FILE = '/tmp/fake-key.json';
    Reflect.deleteProperty(process.env, 'VISION_API_ENDPOINT');

    const { GoogleVisionAdapter } = await loadAdapter();
    await new GoogleVisionAdapter().extract(JPEG);

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]).toEqual({
      keyFilename: '/tmp/fake-key.json',
      apiEndpoint: 'eu-vision.googleapis.com',
    });
  });

  it('respektiert einen VISION_API_ENDPOINT-Override (Test/Local-Dev)', async () => {
    process.env.GOOGLE_VISION_KEY_FILE = '/tmp/fake-key.json';
    process.env.VISION_API_ENDPOINT = 'vision-mock.example.test';

    const { GoogleVisionAdapter } = await loadAdapter();
    await new GoogleVisionAdapter().extract(JPEG);

    expect(constructorCalls[0]?.apiEndpoint).toBe('vision-mock.example.test');
  });

  it('setzt den EU-Endpoint auch ohne GOOGLE_VISION_KEY_FILE (Default-Auth)', async () => {
    Reflect.deleteProperty(process.env, 'GOOGLE_VISION_KEY_FILE');
    Reflect.deleteProperty(process.env, 'VISION_API_ENDPOINT');

    const { GoogleVisionAdapter } = await loadAdapter();
    await new GoogleVisionAdapter().extract(JPEG);

    expect(constructorCalls[0]?.apiEndpoint).toBe('eu-vision.googleapis.com');
    expect(constructorCalls[0]?.keyFilename).toBeUndefined();
  });

  it('setzt den EU-Endpoint auch auf dem PDF-Pfad (batchAnnotateFiles)', async () => {
    process.env.GOOGLE_VISION_KEY_FILE = '/tmp/fake-key.json';
    Reflect.deleteProperty(process.env, 'VISION_API_ENDPOINT');

    const { GoogleVisionAdapter } = await loadAdapter();
    // %PDF-Magic-Bytes → Adapter geht in den PDF-Pfad (batchAnnotateFiles).
    await new GoogleVisionAdapter().extract(Buffer.from([0x25, 0x50, 0x44, 0x46]));

    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]?.apiEndpoint).toBe('eu-vision.googleapis.com');
  });

  it('fällt bei leerem VISION_API_ENDPOINT auf den EU-Default zurück', async () => {
    process.env.GOOGLE_VISION_KEY_FILE = '/tmp/fake-key.json';
    process.env.VISION_API_ENDPOINT = '';

    const { GoogleVisionAdapter } = await loadAdapter();
    await new GoogleVisionAdapter().extract(JPEG);

    expect(constructorCalls[0]?.apiEndpoint).toBe('eu-vision.googleapis.com');
  });
});
