# FreedomGewseCEX

`/projects/software/freedomgewse/freedomgewsecex/`

FreedomGewseCEX is the Canada CEX implementation in the FreedomX family.

- Cryptocurrency: Bitcoin only
- Pair: BTC/CAD
- Custody: noncustodial
- User private keys held by exchange: never
- Exchange customer withdrawal wallet: none
- Web build: functional research/reference lab; no real funds
- Version: 0.3.2-alpha
- License classification: source-available

## Original research functionality retained

The original FreedomGretzkyCEX files supplied during this rebuild contained `cex-research-core.js`, synthetic order-book generation, market execution simulation, seeded DCA/dip/momentum backtesting, and position stress testing. Those functions are preserved in this renamed FreedomGewse/FreedomKobra architecture.

## Exchange model

CEX centralizes order admission, price-time sequencing, matching, market surveillance, and policy coordination while keeping Bitcoin settlement outside exchange custody.

A match or route produces a noncustodial settlement plan. User wallets sign outside the exchange. The browser page and included reference server reject wallet-secret fields and do not broadcast Bitcoin transactions.

## Included implementation

The browser application contains:

- Bitcoin-only pair enforcement;
- centralized price-time order matching;
- synthetic order book + execution simulator + seeded backtester + risk stress model;
- settlement state machine;
- 3-of-5 operator quorum demonstration;
- audit/event log;
- national meme overlay;
- full state export.

The `server/` directory adds an inspectable Flask/SQLAlchemy reference backend with market endpoints, explicit forbidden-secret validation, settlement-plan generation, persistence models, and unit-test examples. It remains deliberately noncustodial and broadcast-disabled.

## Security documentation

- `attack.md` — defensive NoBitEx / Predatory Sparrow case study and verification queue
- `defense.md` — FreedomX defense architecture
- `threat-model.md` — adversaries, assets, catastrophic events, invariants
- `architecture.md` — CEX/DEX architecture and settlement boundary
- `api.md` — safe API contract; forbidden secret fields
- `licensing.md` — FreedomX national branding and commercial waiver policy

## NoBitEx research status

The project brief uses the NoBitEx/Predatory Sparrow incident as a design catalyst. No NoBitEx source tree was provided with these files, and live web research is disabled in this environment. Therefore this repository does not claim source-level NoBitEx parity. Incident-specific claims that still require independent sourcing remain marked accordingly in `attack.md`.

## Deploy

Extract the project ZIP directly into:

`/projects/software/freedomgewse/freedomgewsecex/`

`logo.png` is intentionally not included so existing final artwork is not overwritten.
