/**
 * M01 — OCR-Adapter-Factory (M01 §8)
 *
 * Single-Entry für die Modul-Schicht: gibt für eine Provider-ID den passenden
 * Adapter zurück. So kann der Provider pro Customer (über
 * `customer_profile.integrations.ocr.provider`) ausgetauscht werden, ohne
 * dass der Caller Kenntnis der konkreten Implementation braucht.
 */

import type { OcrAdapter, OcrProviderId } from './adapter.interface';
import { GoogleVisionAdapter } from './google-vision.adapter';
import { MindeeAdapter } from './mindee.adapter';

export interface OcrAdapterFactory {
  for(provider: OcrProviderId): OcrAdapter;
}

let cachedGoogle: GoogleVisionAdapter | null = null;
let cachedMindee: MindeeAdapter | null = null;

export const adapterFactory: OcrAdapterFactory = {
  for(provider: OcrProviderId): OcrAdapter {
    switch (provider) {
      case 'google_vision':
        cachedGoogle ??= new GoogleVisionAdapter();
        return cachedGoogle;
      case 'mindee':
        cachedMindee ??= new MindeeAdapter();
        return cachedMindee;
      default: {
        const exhaustiveCheck: never = provider;
        throw new Error(`Unbekannter OCR-Provider: ${exhaustiveCheck as string}`);
      }
    }
  },
};

export type { OcrAdapter, OcrProviderId, OcrResult, OcrBlock, OcrWord, BBox } from './adapter.interface';
