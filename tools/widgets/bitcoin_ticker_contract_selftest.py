#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TICKER = ROOT / "__partials" / "widgets" / "bitcoin-ticker"

REQUIRED_HOOKS = {
    "data-bitcoin-ticker", "data-state-dot", "data-state-text",
    "data-source-select", "data-currency-select", "data-currency-symbol",
    "data-btc", "data-currency-label", "data-source-label", "data-update-age",
    "data-denom-grid", "data-high", "data-low", "data-volume", "data-spread",
    "data-panel-nav", "data-panel", "data-panel-close", "data-fx-search",
    "data-fx-count", "data-fx-grid", "data-exchange-market-rows",
    "data-exchange-market-meta", "data-reference-title",
    "data-reference-description", "data-reference-search",
    "data-reference-page-select", "data-reference-page-nav",
    "data-reference-page-status", "data-comparative-grid",
    "data-comparatives-state", "data-commodity-source", "data-commodity-updated",
    "data-debt-country", "data-debt-total", "data-debt-per-issued",
    "data-debt-per-terminal", "data-issued-supply", "data-terminal-supply",
    "data-issued-per-debt-dollar", "data-terminal-per-debt-dollar",
    "data-debt-source", "data-chain-height", "data-balance-country",
    "data-balance-total", "data-balance-ex-gold", "data-balance-gold",
    "data-balance-per-issued", "data-balance-per-terminal",
    "data-issued-per-balance-dollar", "data-terminal-per-balance-dollar",
    "data-balance-source", "data-balance-proxy-note", "data-balance-chain-height",
    "data-widget-groups", "data-chart-source", "data-chart-timeframe",
    "data-chart-resolution", "data-chart-recipe", "data-chart-refresh",
    "data-chart-reset", "data-chart-status", "data-chart-range",
    "data-chart-canvas", "data-chart-tooltip", "data-provider-detail",
}

REQUIRED_MODULE_GLOBALS = {
    "ZZXBitcoinTickerConstants", "ZZXBitcoinTickerDeps", "ZZXBitcoinTickerFetch",
    "ZZXBitcoinTickerFX", "ZZXBitcoinTickerSelection", "ZZXBitcoinTickerUnits",
    "ZZXBitcoinTickerReferences", "ZZXBitcoinTickerDebts",
    "ZZXBitcoinTickerBalances", "ZZXBitcoinTickerPanels",
    "ZZXBitcoinTickerWidgetBridge", "ZZXBitcoinTickerCharts",
}

REQUIRED_CONSUMERS = {
    "currency-converter": ["ZZXBPISelection", "ZZXSelectedPriceUsd", "zzx:ticker-patch"],
    "price-24h": ["ZZXBPISelection", "ZZXSelectedPriceUsd", "zzx:bpi-selection"],
    "volume-24h": ["ZZXBPISelection", "ZZXSelectedPriceUsd", "zzx:bpi-selection"],
    "high-low-24h": ["ZZXBPISelection", "ZZXSelectedPriceUsd", "zzx:bpi-selection"],
}


def require(ok: bool, message: str) -> None:
    if not ok:
        raise AssertionError(message)


def text(path: Path) -> str:
    require(path.is_file(), f"missing file: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def main() -> int:
    html = text(TICKER / "widget.html")
    css = text(TICKER / "widget.css")
    main_js = text(TICKER / "widget.js")
    selection = text(TICKER / "js" / "selection.js")
    bridge = text(TICKER / "js" / "widget-bridge.js")
    constants = text(TICKER / "js" / "constants.js")

    hooks = set(re.findall(r"data-[A-Za-z0-9_-]+", html))
    missing_hooks = sorted(REQUIRED_HOOKS - hooks)
    require(not missing_hooks, f"ticker DOM contract missing hooks: {missing_hooks}")

    require('data-bitcoin-ticker' in html, "ticker root hook missing")
    require('class="bitcoin-ticker"' in html, "ticker root class missing")
    require('width:100%' in css.replace(" ", ""), "ticker must remain fluid width")

    all_js = "\n".join(text(p) for p in sorted(TICKER.rglob("*.js")))
    for global_name in REQUIRED_MODULE_GLOBALS:
        require(global_name in all_js, f"missing module global {global_name}")
        require(global_name in main_js, f"main loader no longer references {global_name}")

    for token in [
        "ZZXBPISelection", "ZZXSelectedBPI", "zzx:bpi-selection",
        "ZZXBPIRegistry", "priceUsd", "volumeBtc",
        "highUsd", "lowUsd", "timestamp",
    ]:
        require(token in selection, f"selection compatibility token missing: {token}")

    for token in [
        "priceQuote", "fxRate", "fxProvider", "highUsd", "lowUsd",
        "volumeBtc", "timestamp", "mode"
    ]:
        require(token in main_js, f"ticker selection payload lost field: {token}")

    for token in [
        "ZZXSelectedPriceUsd", "ZZXSelectedQuoteCurrency", "ZZXSelectedQuotePrice",
        "zzx:ticker-patch", "zzx:ticker-widget-toggle",
    ]:
        require(token in bridge, f"widget bridge compatibility token missing: {token}")

    require("refreshMs:1000" in constants.replace(" ", ""), "1s UI refresh contract changed")
    require("liveFreshMs" in constants, "live snapshot freshness window missing")
    require("latestFallbackTtlMs" in constants, "static latest fallback throttle missing")
    require("chainRefreshMs" in constants, "chain metadata throttle missing")
    require("lastGoodLatest" in main_js, "last-known-good latest fallback missing")

    integrations = json.loads(text(TICKER / "widget-integrations.json"))
    integration_ids = {str(row.get("id")) for row in integrations.get("widgets", [])}
    manifest = json.loads(text(ROOT / "__partials" / "widgets" / "manifest.json"))
    manifest_ids = {
        str(row.get("id"))
        for row in manifest.get("widgets", [])
        if row.get("enabled", True) and str(row.get("id")) != "bitcoin-ticker"
    }
    require(
        manifest_ids <= integration_ids,
        f"widget integration registry missing manifest widgets: {sorted(manifest_ids - integration_ids)}"
    )
    for widget_id in [
        "currency-converter", "bitavg", "price-24h", "volume-24h",
        "high-low-24h", "bitrng"
    ]:
        require(widget_id in integration_ids, f"integration registry lost {widget_id}")

    for widget_id, tokens in REQUIRED_CONSUMERS.items():
        widget_root = ROOT / "__partials" / "widgets" / widget_id
        require(widget_root.is_dir(), f"missing dependent widget {widget_id}")
        blob = "\n".join(
            p.read_text(encoding="utf-8", errors="ignore")
            for p in widget_root.rglob("*.js")
        )
        for token in tokens:
            require(token in blob, f"{widget_id} no longer contains compatibility token {token}")

    # bitavg is a publisher/peer provider rather than a selection consumer; verify its
    # publication channel remains available to the rest of the BPI widget ecosystem.
    bitavg = "\n".join(
        p.read_text(encoding="utf-8", errors="ignore")
        for p in (ROOT / "__partials" / "widgets" / "bitavg").rglob("*.js")
    )
    require("zzx:bpi:update" in bitavg, "bitavg BPI update publication contract missing")
    require("ZZXBPIRegistry" in bitavg, "bitavg registry publication contract missing")

    shell = text(ROOT / "__partials" / "bitcoin-ticker-widget.css")
    require('data-widget="bitcoin-ticker"' in shell, "HUD shell lost bitcoin-ticker full-width selector")
    require('data-widget-slot="bitcoin-ticker"' in shell, "HUD shell lost historical ticker selector")

    print(
        "bitcoin_ticker_contract_selftest: PASS "
        f"hooks={len(hooks)} integrations={len(integration_ids)} consumers={len(REQUIRED_CONSUMERS)+1}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
