# Python-first widget data plane

The production contract is server-side Python for acquisition, normalization, index calculation, storage, aggregation and historical resolution selection. HTML provides semantic structure, CSS provides appearance, and browser JavaScript is limited to loading JSON, wiring controls and drawing/DOM updates that cannot be performed server-side.

For BPI charts, `tools/bpi/history_store.py` is the authoritative OHLCV/resolution engine and `tools/bpi/history_api.py` is the browser-facing read API. The browser must not reconstruct candles, invent missing samples, forward-fill market gaps or reinterpret rolling 24-hour volume as candle volume. `interval_volume_btc` is actual BTC traded inside a returned bar; `volume_24h_btc` is the upstream rolling statistic.

Native BPI and Global BPI are separate populations. Native BPI uses exchange-registry geography (`native_bpi.regions` in `bpi_index_policy.json`; US by default). Global BPI uses all eligible exchanges. BitAvg chooses weighted versus arithmetic-unweighted calculation inside the selected population; weighting does not change population membership.

The source-budget target is Python 65–80% of counted source bytes and JavaScript below 5% where practical, with 12% as a transitional ceiling. `python tools/site/source_budget.py --root .` reports the real tree. The current legacy tree is not yet within that target; do not enable enforcement until widgets are migrated. New critical BPI runtime code must remain Python-standard-library-only and is checked by `tools/site/runtime_dependency_audit.py`.

Historical evidence belongs outside the deploy tree at `/var/lib/zzx-bpi/backfill/incoming/<exchange-id>/` on production. Deployment and purge operations preserve it. Missing historical archives remain explicit gaps; they are never filled with synthetic prices.
