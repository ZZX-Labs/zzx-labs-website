# ZZX-CEX

`/projects/software/zzxcex/`

CentralizedExchange research clone environment for Bitcoin-only transactional data analysis, used for internal ZZX financial simulations and model testing.

The web workbench provides seeded synthetic order-book generation, simulated market/limit fills, portfolio accounting, depth visualization, price-shock stress testing, and JSON research-state export. It performs no live trading, custody, signing, broadcasting, or credential collection.

A loopback-only Flask/SQLAlchemy research registry is included under `native/`.

Version: `0.1.0-alpha`
License: `Proprietary`
