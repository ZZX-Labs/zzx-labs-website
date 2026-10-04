# FreedomKobraDEX

`/projects/software/freedomkobra/freedomkobradex/`

FreedomKobraDEX is the United States DEX implementation in the FreedomX family.

- Cryptocurrency: Bitcoin only
- Pair: BTC/USD
- Custody: noncustodial
- User private keys held by exchange: never
- Exchange customer withdrawal wallet: none
- Web build: functional research/reference lab; no real funds
- Version: 0.3.2-alpha
- License classification: source-available

## Original research functionality retained

The DEX edition now has a parallel research engine for synthetic peer liquidity, best-price route construction, routing Monte Carlo under peer failure, and counterparty concentration/HHI analysis.

## Exchange model

DEX distributes peer offers through relays and lets clients construct routes across counterparties; relays discover and coordinate but never hold Bitcoin.

A match or route produces a noncustodial settlement plan. User wallets sign outside the exchange. The browser page and included reference server reject wallet-secret fields and do not broadcast Bitcoin transactions.

## Included implementation

The browser application contains:

- Bitcoin-only pair enforcement;
- peer offer relay and route construction;
- synthetic peer-liquidity generator + routing Monte Carlo + counterparty concentration model;
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

`/projects/software/freedomkobra/freedomkobradex/`

`logo.png` is intentionally not included so existing final artwork is not overwritten.


## Original FreedomGretzkyDEX AMM research preserved

The supplied original DEX implementation used a constant-product `x*y=k` research pool with synthetic BTC/USD reserves, fee-aware swap quotes, pre/post-swap pool prices, average execution price, three-pool route comparison, slippage measurement, and proportional liquidity-add calculations.

Those functions remain in `dex-research-core.js` without being replaced by the later FreedomX peer-offer model.

The current DEX therefore exposes two separate research layers:

1. AMM/liquidity mathematics preserved from the original FreedomGretzkyDEX.
2. FreedomX peer-offer relays, best-price routes, peer-failure Monte Carlo, and counterparty concentration analysis.

The AMM layer is a research instrument. The FreedomX production architecture remains Bitcoin-only and noncustodial; it does not claim sovereign fiat is an on-chain token or that FreedomX holds a fiat/BTC AMM pool.
