# M03 — Kategorisierung & Buchungsvorbereitung

Vollständige Implementierung von M03 nach `Modulkonzept/Konzeptentwicklung/modules/M03_Kategorisierung.md`.

## Endpoint

```
POST /api/v1/receipts/:receipt_id/categorize
```

Body (JSON):

```json
{
  "customer_profile": { "...vollständiges Profil..." },
  "trace_id": "trc_..."
}
```

Akzeptiert nur Receipts mit `status='extracted'`. Bei anderem Status: 422 `INVALID_STATUS`.

## Logik (Strategie-Reihenfolge)

1. **Override** (`profile.custom.supplier_overrides[supplier_name]`) — exact + fuzzy (Levenshtein ≤ 2 nach Normalisierung). Bei Treffer: confidence=1.0, engine='override'.
2. **Master-Data** (`suppliers_global` per VAT-ID / Name / Alias). Match-basierte implizite Confidence; Schwelle ≥ 0.9. Bei Treffer: engine='master_data'.
3. **Claude** via Anthropic SDK Tool-Use. System-Prompt aus `prompts/categorize.system.md`, Tool-Schema mit allen 14 Standardkategorien.
   - **Caching**: Redis (`pp:cat:cache:{sha256(prompt)}`) → DB-Fallback (`categorization_cache`). TTL 30 Tage.
   - **Retry**: 5xx/Timeout 2× (200ms, 800ms), dann Fallback `sonstige_aufwand` mit confidence=0.5.
   - **Re-Prompt**: bei ungültigem Tool-Use 1× erneut, dann Fallback.

## Cost-Center-Logik

Nach erfolgreicher Kategorisierung wird `cost_center` aus `profile.custom.branch_rules[receipt.meta.branch]` gesetzt, sofern noch nicht gesetzt.

## Confidence-Threshold

`profile.routing.low_confidence_threshold ?? 0.75`. Unter Schwelle → `status='requires_review'`, Event `pp.receipt.requires_review`.

## ENV-Variablen

| Variable | Zweck | Default |
|----------|-------|---------|
| `CLAUDE_API_KEY` | Anthropic API-Key | – (Fallback ohne Client) |
| `CLAUDE_MODEL` | Modell-ID | `claude-sonnet-4-6` |
| `M03_CACHE_TTL_DAYS` | Cache-Lebensdauer | `30` |

## Hooks

- `before_categorization` — vor Strategie-Auswahl
- `after_categorization` — nach finaler Patch-Berechnung, vor DB-Update

## Tests

```
npm test -- m03-categorization
```

Abgedeckt:
- `override-resolver.test.ts` (Exact + Fuzzy + leerer Block)
- `skr-mapper.test.ts` (SKR03/04 + Customer-Override + Tax-Key-Map)
- `claude-categorizer.test.ts` (Tool-Use, Cache, Retry, Fallback)
- `categorize.handler.test.ts` (alle 8 Akzeptanz-Tests inkl. Status-Branch)
