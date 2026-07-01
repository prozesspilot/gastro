# T092 — M08-Aggregator: soft-gelöschte Belege ausschließen (`deleted_at IS NULL`)

**ID:** T092
**Verantwortlich:** (offen)
**Priorität:** P2 (GoBD/Korrektheit — soft-gelöschte Belege fließen in den Steuerberater-Report)
**Branch:** `<owner>/T092-m08-deleted-at`
**Geschätzt:** 0,25 Tag
**Herkunft:** code-reviewer-Befund auf PR #234 (M07-CSV-Export) — M07 wurde gefixt, M08 hat denselben Mangel.

---

## Problem

Der M08-Monats-Aggregator (`backend/src/modules/m08-reporting/services/aggregator.ts`,
`computeMonthlyAggregates`) filtert in seinen Queries **nicht** `deleted_at IS NULL`. Ein vom
Mitarbeiter soft-gelöschter Beleg (`delete.handler.ts` setzt `deleted_at`, lässt `status` aber auf
z. B. `categorized`/`exported`) fällt weiterhin in `BOOKED_STATUS` und fließt damit in:
- `totals` (receipts_count, gross_sum, largest_single),
- `by_category`, `top_suppliers`,
- den **USt-Split** (`ust-split.ts`-Query, derselbe Filter),
- den Vormonats-Vergleich.

→ Der Monats-**Report-PDF** und die **Steuerberater-Übergabe-Mail** (T089/T090) enthalten Geld-
Aggregate, die gelöschte Belege mitzählen. Gleiche Bug-Klasse wie der in M07 (#234) gefixte CSV-Leak.

Die gesamte restliche Codebasis filtert Lese-Pfade konsequent mit `deleted_at IS NULL`
(`beleg.repository.ts:275,435,499,571`). M07 ist seit #234 konsistent; M08 muss nachziehen, damit
beide dieselbe (korrekte) Beleg-Menge sehen.

## Was zu tun ist

- In ALLEN Beleg-Queries von `computeMonthlyAggregates` (totals, by_category, top_suppliers,
  Vormonat, no-date) **`AND deleted_at IS NULL`** ergänzen.
- Die USt-Split-Query (`ust-split.ts` bzw. die `ustRowsRes`-Query im Aggregator) ebenso.
- Integrationstest erweitern: ein soft-gelöschter Beleg im Monat darf NICHT in den Aggregaten
  auftauchen (Σ unverändert).

## Akzeptanz-Kriterien
- [x] Alle Aggregat-Queries filtern `deleted_at IS NULL`. (6/6 Queries in `computeMonthlyAggregates`: totals, by_category, top_suppliers, Vormonat, no-date, USt-Rows)
- [x] USt-Split rechnet ohne gelöschte Belege (Σ-Reconcile bleibt gültig). (USt-Rows-Query filtert `deleted_at IS NULL`; Test prüft Σ(Split)+unassignable == totals.gross_sum)
- [x] Integrationstest: soft-gelöschter Beleg → nicht in totals/by_category/ust_split. (`aggregator.integration.test.ts` — 777-€-Beleg soft-gelöscht, Σ bleibt 180 €)
- [x] CI grün. (lokal: typecheck + biome + build + 982 Tests grün; DB-Integrationstest verifiziert CI — lokal kein Postgres/Docker)

## Spec-Referenzen
- `backend/src/modules/m08-reporting/services/aggregator.ts` (`computeMonthlyAggregates`)
- `backend/src/modules/m08-reporting/services/ust-split.ts`
- Vorbild-Fix: PR #234 (`belege-export.repository.ts` — `AND deleted_at IS NULL`)
