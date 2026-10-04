# ZZX BPI historical backfill

Place raw exchange archives under `incoming/<exchange-id>/`, where `<exchange-id>` is the canonical key from `bitcoin/bpi/api/exchanges.json` (for example `incoming/coinbase/`). Accepted inputs are CSV, JSON, JSONL/NDJSON and gzip-compressed variants.

The importer preserves provenance and never interpolates missing market history. `interval_volume_btc` means BTC actually traded inside a source candle/bar; `volume_24h_btc` means an upstream rolling 24-hour statistic. They are never substituted for one another.

Non-USD source rows must contain explicit `price_usd`/`close_usd` and USD-normalized OHLC fields if OHLC is to be retained. This prevents non-USD prices from being silently treated as dollars. FX conversion should be performed in an auditable preprocessing step with historical FX evidence.

Run `python tools/bpi/backtest_all_exchanges.py --root . --index-resolution 1h` to import all available archives and rebuild native BPI plus Global BPI. Exchanges with no archive remain explicit gaps in `backtest-report.json`, including defunct exchanges listed by the registry; no synthetic prices are created.

On the resident production host, keep large/raw archives under `/var/lib/zzx-bpi/backfill/incoming/<exchange-id>/`. The deployment workflow deliberately excludes this directory from `rsync --delete`, and the purge workflow never removes it.
