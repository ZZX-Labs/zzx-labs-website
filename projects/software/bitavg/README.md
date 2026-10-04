# BitAvg

Global Bitcoin volume-weighted price index.

**Version:** 0.2.0-beta  
**License:** MIT

The browser port includes Kraken, Bitstamp, and Binance-style public adapters, quote-volume weighting, optional volatility adjustment, 250 ms cached index recomputation, history visualization, CSV export, and custom provider hooks.

Network polling is intentionally slower than the 250 ms index clock to avoid hammering public APIs.

Deploy directly into `/projects/software/bitavg/`. `logo.png` is intentionally not bundled.
