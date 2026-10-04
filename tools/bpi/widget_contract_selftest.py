#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]

ERRORS: list[str] = []
WARNINGS: list[str] = []


def error(message: str) -> None:
    ERRORS.append(message)


def warn(message: str) -> None:
    WARNINGS.append(message)


def require(condition: bool, message: str) -> None:
    if not condition:
        error(message)


def read_text(path: str, *, required: bool = True) -> str:
    p = ROOT / path
    if not p.exists():
        if required:
            error(f"missing required file: {path}")
        else:
            warn(f"optional/runtime file is absent: {path}")
        return ""
    try:
        return p.read_text(encoding="utf-8")
    except Exception as exc:  # pragma: no cover - defensive diagnostics
        if required:
            error(f"cannot read {path}: {exc}")
        else:
            warn(f"cannot read optional/runtime file {path}: {exc}")
        return ""


def load_json(path: str, *, required: bool = True) -> Any:
    raw = read_text(path, required=required)
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception as exc:
        if required:
            error(f"invalid JSON in {path}: {exc}")
        else:
            warn(f"invalid optional/runtime JSON in {path}: {exc}")
        return {}


def number_gt_zero(value: Any) -> bool:
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False


def check_ticker_denominations() -> None:
    units = read_text("__partials/widgets/bitcoin-ticker/js/units.js")
    required = [
        ("kbtc", "KBTC", "1e3"),
        ("btc", "BTC", "1"),
        ("mbtc", "mBTC", "1e-3"),
        ("ksat", "Ksat", "1e-5"),
        ("ubtc", "μBTC", "1e-6"),
        ("sat", "sat", "1e-8"),
        ("msat", "msat", "1e-11"),
        ("usat", "μsat", "1e-14"),
    ]
    positions: list[int] = []
    for ident, label, factor in required:
        needle = f'id:"{ident}"'
        pos = units.find(needle)
        require(pos >= 0, f"missing ticker denomination {ident}")
        if pos < 0:
            continue
        positions.append(pos)
        require(label in units[pos : pos + 180], f"wrong label for ticker denomination {ident}; expected {label}")
        require(factor in units[pos : pos + 220], f"wrong BTC factor for ticker denomination {ident}; expected {factor}")
    if positions:
        require(positions == sorted(positions), "ticker denomination order changed")
    require('id:"nbtc"' not in units, "nBTC must not reappear in canonical ticker ladder")
    require("kBTC" not in units, "lowercase-k kBTC must not reappear; canonical label is KBTC")


def check_purchasing_power_contract() -> None:
    panels = read_text("__partials/widgets/bitcoin-ticker/js/panels.js")
    er = panels.find('label:"Exchange Rates"')
    ex = panels.find('label:"Exchanges"')
    require(er >= 0, "Bitcoin Ticker panel list is missing Exchange Rates")
    require(ex >= 0, "Bitcoin Ticker panel list is missing Exchanges")
    if er >= 0 and ex >= 0:
        require(er < ex, "Exchange Rates must precede Exchanges")

    catalog = load_json("__partials/widgets/bitcoin-ticker/reference-catalog.json")
    pages = catalog.get("pages") if isinstance(catalog, dict) else None
    items = catalog.get("items") if isinstance(catalog, dict) else None
    require(isinstance(pages, list), "reference-catalog.json must contain pages[]")
    require(isinstance(items, list), "reference-catalog.json must contain items[]")
    if not isinstance(pages, list) or not isinstance(items, list):
        return

    try:
        labels = [p["label"] for p in sorted(pages, key=lambda x: x["order"])]
    except Exception as exc:
        error(f"invalid purchasing-power page structure: {exc}")
        labels = []

    expected = [
        "Tobacco", "Alcohol", "Cannabis", "Kief & Hashish", "Concentrates", "Edibles",
        "Drugs", "RX Drugs", "Commodities", "Precious Metals", "Semi Precious Metals",
        "Precious Gem Stones", "Semi Precious Gem Stones", "Collectibles", "Fine Art",
        "Vehicles", "Ships", "Planes", "Water", "Oil", "Fuels", "Power/Energy",
        "Cost per Watt by Energy Form", "Ammo", "Arms", "Military Equipment",
        "Military Vehicles", "Military Heavy Vehicles", "Military Aircraft", "Military Ships",
        "Military Munitions", "Military Air Defense Munitions",
        "Drones, UAVs, FPVs, Fixed Wing", "UMVs, Sub Drones, ROV Drones", "UGVs & Robotics",
    ]
    require(labels == expected, f"purchasing-power order mismatch: {labels!r}")
    require(catalog.get("page_count") == 35, f"purchasing-power page_count must be 35, got {catalog.get('page_count')!r}")
    require(int(catalog.get("item_count") or 0) >= 700, f"purchasing-power item_count must be >=700, got {catalog.get('item_count')!r}")
    require(catalog.get("reference_market") == "US", "purchasing-power reference_market must be US")
    require(catalog.get("reference_currency") == "USD", "purchasing-power reference_currency must be USD")

    page_ids = {p.get("id") for p in pages if isinstance(p, dict) and p.get("id")}
    item_ids = [i.get("id") for i in items if isinstance(i, dict) and i.get("id")]
    require(len(item_ids) == len(items), "every purchasing-power item must have an id")
    require(len(set(item_ids)) == len(item_ids), "duplicate purchasing-power item ids")
    for pid in page_ids:
        require(any(i.get("page") == pid for i in items if isinstance(i, dict)), f"empty purchasing-power page {pid}")
    item_id_set = set(item_ids)
    for item in items:
        if not isinstance(item, dict):
            error("non-object row in purchasing-power items[]")
            continue
        base = item.get("derived_from")
        if base:
            require(base in item_id_set, f"unknown derived base {base} for {item.get('id')}")
            try:
                require(float(item.get("derived_factor") or 0) > 0, f"invalid derived_factor for {item.get('id')}")
            except (TypeError, ValueError):
                error(f"invalid derived_factor for {item.get('id')}")

    registry = load_json("bitcoin/bpi/api/reference_national_source_registry.json")
    require(registry.get("default_country") == "US", "reference source registry default_country must be US")
    require(registry.get("reference_currency") == "USD", "reference source registry reference_currency must be USD")
    require(registry.get("page_count") == 35, f"reference source registry page_count must be 35, got {registry.get('page_count')!r}")
    sources = registry.get("sources") if isinstance(registry.get("sources"), list) else []
    require({row.get("page") for row in sources if isinstance(row, dict)} == page_ids, "reference source registry pages do not match purchasing-power catalog")

    restricted_pages = {
        "drugs", "ammo", "arms", "military-munitions",
        "military-air-defense-munitions",
    }
    for pid in restricted_pages:
        rows = [i for i in items if isinstance(i, dict) and i.get("page") == pid]
        require(bool(rows), f"restricted purchasing-power page {pid} has no rows")
        require(all(i.get("restricted_reference") is True for i in rows), f"restricted-reference policy missing on one or more {pid} rows")

    widget_js = read_text("__partials/widgets/bitcoin-ticker/widget.js")
    panels_js = read_text("__partials/widgets/bitcoin-ticker/js/panels.js")
    purchasing_js = read_text("__partials/widgets/bitcoin-ticker/js/purchasing-power.js")
    require("PurchasingPowerRegistry" not in widget_js, "per-category JS purchasing-power registry must not return")
    require("purchasing-power/registry.js" not in widget_js, "widget still imports obsolete purchasing-power/registry.js")

    expected_top_level = [
        "Exchange Rates",
        "Exchanges",
        "Conversions",
        "National Debts",
        "National Balances",
        "National Imports",
        "National Exports",
        "Widget Modules",
        "Charts",
    ]
    top_level_labels = re.findall(
        r'\{id:"[^"]+",label:"([^"]+)",panel:"[^"]+"\}',
        panels_js,
    )[:9]
    require(
        top_level_labels == expected_top_level,
        f"Bitcoin Ticker top-level panel order mismatch: {top_level_labels!r}",
    )

    require(
        "catalogData?.pages" in purchasing_js and "for(const page of data.pages||[])" in purchasing_js,
        "Conversions subnavigation must be data-driven from catalog pages",
    )
    require("bitcoin-ticker__reference-group" in purchasing_js, "purchasing-power group headings missing")


def check_exchange_and_index_contract() -> None:
    exchanges_doc = load_json("bitcoin/bpi/api/exchanges.json")
    providers_doc = load_json("bitcoin/bpi/api/provider_urls.json")
    exchanges = exchanges_doc.get("sources") if isinstance(exchanges_doc, dict) else {}
    providers = providers_doc.get("providers") if isinstance(providers_doc, dict) else {}
    if not isinstance(exchanges, dict):
        error("exchanges.json sources must be an object")
        exchanges = {}
    if not isinstance(providers, dict):
        error("provider_urls.json providers must be an object")
        providers = {}

    for exchange in ("binance_us", "binance", "bitfinex", "coinbase", "kraken", "gemini"):
        require(exchange in exchanges, f"missing exchange registry row {exchange}")
        require(exchange in providers, f"missing provider row {exchange}")
        if exchange in exchanges:
            require(exchanges[exchange].get("kind") == "exchange", f"registry row {exchange} is not kind=exchange")

    if "binance" in providers:
        require(providers["binance"].get("enabled_poll") is True, "Binance Global polling is disabled")
        require(providers["binance"].get("adapter") == "binance_24h", "Binance Global adapter must be binance_24h")
        require(providers["binance"].get("quote") == "EUR", "Binance Global must use a fiat quote, not a stablecoin")
        require("BTCEUR" in str(providers["binance"].get("price_volume_url") or ""), "Binance Global URL must use BTCEUR")
    if "bitfinex" in providers:
        require(providers["bitfinex"].get("enabled_poll") is True, "Bitfinex polling is disabled")

    policy = load_json("bitcoin/bpi/api/bpi_index_policy.json")
    require(policy.get("default_country") == "US", "BPI policy default_country must be US")
    native = policy.get("native_bpi") if isinstance(policy.get("native_bpi"), dict) else {}
    require("US" in (native.get("regions") or []), "native BPI regions must include US")
    require(native.get("fallback_to_global") is False, "native BPI must not silently fall back to Global BPI")


def check_implementation_contracts() -> None:
    for rel in ("fx.js", "debts.js", "balances.js", "references.js"):
        body = read_text(f"__partials/widgets/bitcoin-ticker/js/{rel}")
        if body:
            require(len(body) < 600, f"{rel} grew back into a duplicate implementation")

    collector = read_text("tools/bpi/collector.py")
    for name, expected in (("CYCLE_MS", "2500"), ("MIN_CYCLE_MS", "2500"), ("MAX_CYCLE_MS", "5000")):
        match = re.search(rf"^\s*{re.escape(name)}\s*=\s*([0-9_]+)", collector, flags=re.MULTILINE)
        require(match is not None, f"collector.py missing {name}")
        if match:
            require(int(match.group(1).replace("_", "")) == int(expected), f"collector.py {name} must be {expected}")
    fx_match = re.search(r"^\s*FX_MS\s*=\s*([0-9_]+)", collector, flags=re.MULTILINE)
    require(fx_match is not None, "collector.py missing FX_MS")
    if fx_match:
        require(int(fx_match.group(1).replace("_", "")) == 60000, "collector.py FX_MS must be 60000")

    reference = read_text("tools/bpi/reference_updater.py")
    require(re.search(r"next_ref\s*=\s*now\s*\+\s*60\b", reference) is not None, "reference_updater.py reference cadence must be 60 seconds")
    require(re.search(r"next_debt\s*=\s*now\s*\+\s*21600\b", reference) is not None, "reference_updater.py sovereign cadence must be 21600 seconds")

    dual = read_text("__partials/widgets/high-low-24h/js/dual-chart.js")
    require("lastVisibleTime-firstVisibleTime" in dual or "lastVisibleTime - firstVisibleTime" in dual, "High/Low renderer must map X coordinates in timestamp space")
    require("gap_before===true" in dual or "gap_before === true" in dual, "High/Low renderer must honor explicit history gaps")
    require("interval_volume_btc" in dual, "High/Low renderer must use interval_volume_btc")



def main() -> int:
    checks = (
        check_ticker_denominations,
        check_purchasing_power_contract,
        check_exchange_and_index_contract,
        check_implementation_contracts,
    )
    for check in checks:
        try:
            check()
        except Exception as exc:  # Never lose the actual failing subsystem.
            error(f"{check.__name__} raised unexpected {type(exc).__name__}: {exc}")

    for message in WARNINGS:
        print(f"::warning title=BPI widget contract diagnostic::{message}")
    for message in ERRORS:
        print(f"::error title=BPI widget contract::{message}")

    if ERRORS:
        print(f"widget_contract_selftest.py: FAIL ({len(ERRORS)} error(s), {len(WARNINGS)} warning(s))")
        return 1

    print(f"widget_contract_selftest.py: PASS ({len(WARNINGS)} warning(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
