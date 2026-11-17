# Token Radar — token-radar-01

A pre-token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols,
finds the ones that record no token and are not a wrapped, staked or bridged product
of a token that already trades, ranks them by an implied launch value, and hands in
a static dashboard with the board, a detail view per protocol and a farm plan each.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22.18+ (or 24), standard library only, no install step. In the grader's
container it reads `/input/snapshot.json` and writes to `/output`. The program is
deterministic: two runs write the same bytes.

## What it writes

- `board.json` — 198 rows: the whole 40-protocol watchlist plus 158 early finds
  below the $50M floor, ranked by implied value, each with a 7-step farm plan.
- `data.js` — the dashboard's dataset, beside the page.
- `dashboard/` — `index.html`, `app.css`, `app.js`; a static page, no network.
- `screenshots/` — the board, a protocol detail view, a filtered view (1440x900).
- `dossier.json` — built by `vendor/makefun-board.ts` (the kit's library, copied
  byte for byte).

## The model (radar-2)

`implied = round( tvl_usd x category_multiple x growth x maturity x breadth )`

- **Category multiple**: the median market-cap-per-dollar-of-TVL of the live
  protocols in the same category, calibrated from the snapshot itself. A category
  with fewer than 5 live comparables has its median pulled halfway toward the
  global median (0.214x); fewer than 2 uses the global median outright. Multiples
  are clamped to 0.05–1.50.
- **Growth**: `1 + clamp(change_7d, -60, 120) / 100 x 0.5`.
- **Maturity**: `0.6 + min(age_days, 1095) / 1095 x 0.4` — how long the protocol
  has run with no token (unknown age: 365 days).
- **Breadth**: `1 + min(chains - 1, 5) x 0.015`.

No protocol name is special-cased. The dashboard recomputes every row from the
same figures and shows every factor, the comparables table, and the farm plan the
page regenerates from the same derivation as `board.json`.

## Top 5 by implied value (snapshot 2026-11-14)

| Rank | Protocol | Implied value |
| ---: | --- | ---: |
| 1 | Steakhouse Financial | $499.8M |
| 2 | Sentora Curator (early find, not on the watchlist) | $466.7M |
| 3 | Gauntlet | $297.7M |
| 4 | Veda | $176.6M |
| 5 | USDD | $168.8M |

Total implied value of the board: $3.75B. Implied values are this radar's own
estimates, not prices, and never proof a token is coming.

## Files

- `main.ts` — entrypoint: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the model, the rankable rule, the farm-plan derivation.
- `vendor/makefun-board.ts` — the kit's dossier library, copied as-is.
- `dashboard/` — the static page.
- `screenshots/` — the three screenshots.
- `check-gate.mjs` — a local replica of the gate's seven rows (verification
  helper, not part of the graded entry).
- `LICENSE` — MIT.
