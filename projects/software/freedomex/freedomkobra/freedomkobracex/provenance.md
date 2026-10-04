# FreedomKobraCEX Source Provenance

## Original supplied source

This directory preserves the original FreedomKobraCEX browser research package supplied during the FreedomX rebuild.

Original identity:

- slug: `freedomkobracex`
- version: `0.1.0-alpha`
- original route: `/projects/software/freedomkobracex/`
- original model: United States CEX research simulator
- original security boundary: simulation only; no exchange credentials, wallet keys, custody, deposits, withdrawals, or live orders

## Preserved original functionality

The original source implemented:

1. seeded synthetic bid/ask order-book generation;
2. fee-aware synthetic market execution;
3. deterministic DCA, buy-dip, and momentum backtesting;
4. BTC position stress testing;
5. JSON research export.

The exact uploaded `cex-research-core.js` is also the active research engine in the integrated FreedomKobraCEX build.

## FreedomX additions

The current FreedomKobraCEX keeps the original research functionality and adds:

- Bitcoin-only `BTC/USD` enforcement;
- centralized price-time matching;
- noncustodial settlement planning;
- client-intent hashes;
- no exchange customer withdrawal wallet;
- no user private-key handling;
- 3-of-5 operator quorum model;
- append-only browser audit events;
- Flask/SQLAlchemy reference backend;
- security, threat-model, attack, defense, API, and licensing documentation;
- U.S. FreedomKobra meme/branding layer.

## Why retain the original snapshot

The snapshot makes it possible to audit what belonged to the original simulator versus what was added by the FreedomX rebuild. It also prevents future refactors from erasing the earlier research implementation.
