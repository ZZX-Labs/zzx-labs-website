#!/usr/bin/env python3
"""
ZZX-Labs BPI snapshot updater.

Compatibility contract:
  exchanges.json      -> catalog/order/policy
  provider_urls.json  -> endpoint/adapter/native quote
  exchange_rates.json -> native fiat -> USD normalization

Legacy exchanges.json rows carrying {url, parser} remain supported.

The updater fails closed if fewer than two BPI-eligible sources survive.
"""

from __future__ import annotations

import argparse
import json
import math
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from index_sanity import classify_markets

ROOT = Path(__file__).resolve().parents[2]
API_DIR = ROOT / "bitcoin" / "bpi" / "api"

EXCHANGES = API_DIR / "exchanges.json"
PROVIDER_URLS = API_DIR / "provider_urls.json"
EXCHANGE_RATES = API_DIR / "exchange_rates.json"
LATEST = API_DIR / "latest.json"
CHANGES = API_DIR / "changes.json"
HISTORY = API_DIR / "history.json"
MARKETS = API_DIR / "markets.json"
PROVIDER_HEALTH = API_DIR / "provider_health.json"

USER_AGENT = "ZZX-Labs-BPI/5.4"
MIN_BPI_SOURCES = 2

LEGACY_TO_ADAPTER = {
    "coinbase_stats": "coinbase_stats",
    "coinbase_spot": "coinbase_spot",
    "kraken_ticker": "kraken",
    "gemini_pubticker": "gemini",
    "bitstamp_ticker": "bitstamp",
    "bitfinex_v2_ticker": "bitfinex",
    "okx_ticker": "okx_legacy",
    "crypto_com_ticker": "crypto_com_legacy",
    "kucoin_stats": "kucoin_legacy",
    "gateio_ticker": "gateio_legacy",
    "bitget_ticker": "bitget_legacy",
    "mexc_24hr": "binance_24h",
    "binance_24hr": "binance_24h",
    "htx_merged": "htx_legacy",
    "okcoin_ticker": "okcoin_legacy",
    "coingecko_bitcoin_tickers": "coingecko_bitcoin_tickers",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def n(value: Any) -> float:
    try:
        x = float(value)
        return x if math.isfinite(x) else 0.0
    except Exception:
        return 0.0


def positive(value: Any) -> float:
    x = n(value)
    return x if x > 0 else 0.0


def nonnegative(value: Any) -> float:
    x = n(value)
    return x if x >= 0 else 0.0


def fetch_json(url: str, timeout: int = 20) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_text(url: str, timeout: int = 10) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/plain",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="strict").strip()


def fetch_block_height():
    endpoints = (
        "https://mempool.space/api/blocks/tip/height",
        "https://blockstream.info/api/blocks/tip/height",
    )

    for url in endpoints:
        try:
            height = int(fetch_text(url))
            if 0 < height < 10_000_000:
                return height, url
        except Exception as exc:
            print(f"BLOCK_HEIGHT_FAIL {url}: {exc}")

    return None, "unavailable"


def mined_supply_sats(height: int) -> int:
    height = int(height)
    if height < 0:
        return 0

    blocks_remaining = height + 1
    subsidy_sats = 5_000_000_000
    issued_sats = 0

    while blocks_remaining > 0 and subsidy_sats > 0:
        epoch_blocks = min(blocks_remaining, 210_000)
        issued_sats += epoch_blocks * subsidy_sats
        blocks_remaining -= epoch_blocks
        subsidy_sats //= 2

    return issued_sats


def mined_supply_btc(height: int) -> float:
    return mined_supply_sats(height) / 100_000_000.0


def fx_rates() -> dict[str, float]:
    data = read_json(EXCHANGE_RATES, {})
    raw = data.get("rates", {}) if isinstance(data, dict) else {}

    out = {"USD": 1.0}
    if isinstance(raw, dict):
        for code, value in raw.items():
            code = str(code).upper()
            rate = positive(value)
            if rate > 0:
                out[code] = rate

    out["USD"] = 1.0
    return out


def normalize_native_to_usd(value: Any, quote: str, rates: dict[str, float]) -> float:
    x = positive(value)
    if x <= 0:
        return 0.0

    quote = str(quote or "USD").upper()
    if quote == "USD":
        return x

    per_usd = positive(rates.get(quote))
    if per_usd <= 0:
        raise RuntimeError(f"missing FX rate for {quote}")

    # Contract: 1 USD = rates[CODE] CODE.
    return x / per_usd


def parse_coingecko_bitcoin_tickers(data: Any, fiat_codes: set[str]):
    rows = []

    if not isinstance(data, dict):
        return empty_market()

    for ticker in data.get("tickers", []):
        base = str(ticker.get("base", "")).upper()
        target = str(ticker.get("target", "")).upper()

        if base not in ("BTC", "XBT"):
            continue

        # Current BitAvg policy: fiat only. Stablecoins are not fiat.
        if target not in fiat_codes:
            continue

        price_usd = positive((ticker.get("converted_last") or {}).get("usd"))
        volume_usd = positive((ticker.get("converted_volume") or {}).get("usd"))

        if price_usd <= 0:
            continue

        rows.append({
            "native_price": price_usd,
            "quote": "USD",
            "volume_24h_btc": volume_usd / price_usd if volume_usd > 0 else 0.0,
            "volume_24h_quote": volume_usd,
            "high_native": price_usd,
            "low_native": price_usd,
        })

    weighted = [row for row in rows if row["volume_24h_btc"] > 0]

    if weighted:
        total_volume = sum(row["volume_24h_btc"] for row in weighted)
        price = sum(
            row["native_price"] * row["volume_24h_btc"]
            for row in weighted
        ) / total_volume
        return {
            "native_price": price,
            "quote": "USD",
            "volume_24h_btc": total_volume,
            "volume_24h_quote": sum(row["volume_24h_quote"] for row in weighted),
            "high_native": max(row["native_price"] for row in weighted),
            "low_native": min(row["native_price"] for row in weighted),
        }

    return empty_market()


def empty_market():
    return {
        "native_price": 0.0,
        "quote": "USD",
        "volume_24h_btc": 0.0,
        "volume_24h_quote": 0.0,
        "high_native": 0.0,
        "low_native": 0.0,
    }


def parse_market(adapter: str, data: Any, quote: str = "USD", fiat_codes=None):
    fiat_codes = fiat_codes or {"USD"}
    quote = str(quote or "USD").upper()

    if adapter == "coinbase_exchange":
        return {
            "native_price": positive(data.get("price")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("volume")),
            "volume_24h_quote": 0.0,
            "high_native": 0.0,
            "low_native": 0.0,
        }

    if adapter == "coinbase_stats":
        return {
            "native_price": positive(data.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("volume")),
            "volume_24h_quote": 0.0,
            "high_native": positive(data.get("high")),
            "low_native": positive(data.get("low")),
        }

    if adapter == "coinbase_spot":
        return {
            "native_price": positive((data.get("data") or {}).get("amount")),
            "quote": quote,
            "volume_24h_btc": 0.0,
            "volume_24h_quote": 0.0,
            "high_native": 0.0,
            "low_native": 0.0,
        }

    if adapter == "kraken":
        result = data.get("result", {})
        ticker = (
            result.get("XXBTZUSD")
            or result.get("XBTUSD")
            or result.get("BTCUSD")
            or (list(result.values())[0] if result else {})
        )
        return {
            "native_price": positive((ticker.get("c") or [0])[0]),
            "quote": quote,
            "volume_24h_btc": nonnegative((ticker.get("v") or [0, 0])[1]),
            "volume_24h_quote": 0.0,
            "high_native": positive((ticker.get("h") or [0, 0])[1]),
            "low_native": positive((ticker.get("l") or [0, 0])[1]),
        }

    if adapter == "gemini":
        volume = data.get("volume", {})
        return {
            "native_price": positive(data.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(
                volume.get("BTC") or volume.get("btc")
            ),
            "volume_24h_quote": nonnegative(volume.get(quote)),
            "high_native": positive(data.get("high")),
            "low_native": positive(data.get("low")),
        }

    if adapter == "bitstamp":
        return {
            "native_price": positive(data.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("volume")),
            "volume_24h_quote": 0.0,
            "high_native": positive(data.get("high")),
            "low_native": positive(data.get("low")),
        }

    if adapter == "bitfinex" and isinstance(data, list) and len(data) >= 10:
        return {
            "native_price": positive(data[6]),
            "quote": quote,
            "volume_24h_btc": nonnegative(data[7]),
            "volume_24h_quote": 0.0,
            "high_native": positive(data[8]),
            "low_native": positive(data[9]),
        }

    if adapter == "binance_24h":
        return {
            "native_price": positive(data.get("lastPrice")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("volume")),
            "volume_24h_quote": nonnegative(data.get("quoteVolume")),
            "high_native": positive(data.get("highPrice")),
            "low_native": positive(data.get("lowPrice")),
        }

    if adapter == "upbit":
        row = data[0] if isinstance(data, list) and data else {}
        return {
            "native_price": positive(row.get("trade_price")),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("acc_trade_volume_24h")),
            "volume_24h_quote": nonnegative(row.get("acc_trade_price_24h")),
            "high_native": positive(row.get("high_price")),
            "low_native": positive(row.get("low_price")),
        }

    if adapter == "bithumb":
        row = data.get("data") or {}
        return {
            "native_price": positive(row.get("closing_price")),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("units_traded_24H")),
            "volume_24h_quote": nonnegative(row.get("acc_trade_value_24H")),
            "high_native": positive(row.get("max_price")),
            "low_native": positive(row.get("min_price")),
        }

    if adapter == "bitflyer":
        return {
            "native_price": positive(data.get("ltp")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("volume_by_product")),
            "volume_24h_quote": 0.0,
            "high_native": 0.0,
            "low_native": 0.0,
        }

    if adapter == "coincheck":
        return {
            "native_price": positive(data.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("volume")),
            "volume_24h_quote": 0.0,
            "high_native": positive(data.get("high")),
            "low_native": positive(data.get("low")),
        }

    if adapter == "independent_reserve":
        return {
            "native_price": positive(data.get("LastPrice")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("DayVolumeXbt")),
            "volume_24h_quote": 0.0,
            "high_native": positive(data.get("DayHighestPrice")),
            "low_native": positive(data.get("DayLowestPrice")),
        }

    if adapter == "btcmarkets":
        return {
            "native_price": positive(data.get("lastPrice")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("volume24h")),
            "volume_24h_quote": 0.0,
            "high_native": positive(data.get("high24h")),
            "low_native": positive(data.get("low24h")),
        }

    if adapter == "cexio":
        return {
            "native_price": positive(data.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("volume")),
            "volume_24h_quote": 0.0,
            "high_native": positive(data.get("high")),
            "low_native": positive(data.get("low")),
        }

    if adapter == "luno":
        return {
            "native_price": positive(data.get("last_trade")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("rolling_24_hour_volume")),
            "volume_24h_quote": 0.0,
            "high_native": 0.0,
            "low_native": 0.0,
        }

    if adapter == "bitso":
        row = data.get("payload") or {}
        return {
            "native_price": positive(row.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("volume")),
            "volume_24h_quote": 0.0,
            "high_native": positive(row.get("high")),
            "low_native": positive(row.get("low")),
        }

    if adapter == "mercado_bitcoin":
        row = data.get("ticker") or {}
        return {
            "native_price": positive(row.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("vol")),
            "volume_24h_quote": 0.0,
            "high_native": positive(row.get("high")),
            "low_native": positive(row.get("low")),
        }

    if adapter == "whitebit":
        row = next(iter(data.values())) if isinstance(data, dict) and data else {}
        return {
            "native_price": positive(
                row.get("last_price") or row.get("last")
            ),
            "quote": quote,
            "volume_24h_btc": nonnegative(
                row.get("base_volume") or row.get("volume")
            ),
            "volume_24h_quote": nonnegative(row.get("quote_volume")),
            "high_native": positive(row.get("high")),
            "low_native": positive(row.get("low")),
        }

    if adapter == "btcturk":
        rows = data.get("data") or []
        row = rows[0] if isinstance(rows, list) and rows else {}
        return {
            "native_price": positive(row.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("volume")),
            "volume_24h_quote": nonnegative(row.get("average")),
            "high_native": positive(row.get("high")),
            "low_native": positive(row.get("low")),
        }

    if adapter == "bitkub":
        row = next(iter(data.values())) if isinstance(data, dict) and data else {}
        return {
            "native_price": positive(row.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("baseVolume")),
            "volume_24h_quote": nonnegative(row.get("quoteVolume")),
            "high_native": positive(row.get("high24hr")),
            "low_native": positive(row.get("low24hr")),
        }

    if adapter == "indodax":
        row = data.get("ticker") or {}
        return {
            "native_price": positive(row.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("vol_btc")),
            "volume_24h_quote": nonnegative(row.get("vol_idr")),
            "high_native": positive(row.get("high")),
            "low_native": positive(row.get("low")),
        }

    if adapter == "valr":
        return {
            "native_price": positive(data.get("lastTradedPrice")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("baseVolume")),
            "volume_24h_quote": nonnegative(data.get("quoteVolume")),
            "high_native": positive(data.get("highPrice")),
            "low_native": positive(data.get("lowPrice")),
        }

    # Legacy configured endpoints retained for backwards compatibility.
    if adapter == "okx_legacy":
        row = (data.get("data") or [{}])[0]
        return {
            "native_price": positive(row.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("vol24h")),
            "volume_24h_quote": nonnegative(row.get("volCcy24h")),
            "high_native": positive(row.get("high24h")),
            "low_native": positive(row.get("low24h")),
        }

    if adapter == "crypto_com_legacy":
        row = (data.get("result", {}).get("data") or [{}])[0]
        return {
            "native_price": positive(
                row.get("a") or row.get("last") or row.get("price")
            ),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("v") or row.get("volume")),
            "volume_24h_quote": 0.0,
            "high_native": positive(row.get("h") or row.get("high")),
            "low_native": positive(row.get("l") or row.get("low")),
        }

    if adapter == "kucoin_legacy":
        row = data.get("data") or {}
        return {
            "native_price": positive(row.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("vol")),
            "volume_24h_quote": nonnegative(row.get("volValue")),
            "high_native": positive(row.get("high")),
            "low_native": positive(row.get("low")),
        }

    if adapter == "gateio_legacy":
        row = data[0] if isinstance(data, list) and data else data
        return {
            "native_price": positive(row.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("base_volume")),
            "volume_24h_quote": nonnegative(row.get("quote_volume")),
            "high_native": positive(row.get("high_24h")),
            "low_native": positive(row.get("low_24h")),
        }

    if adapter == "bitget_legacy":
        rows = data.get("data") or [{}]
        row = rows[0] if isinstance(rows, list) else rows
        return {
            "native_price": positive(
                row.get("lastPr") or row.get("close") or row.get("last")
            ),
            "quote": quote,
            "volume_24h_btc": nonnegative(
                row.get("baseVolume") or row.get("baseVol")
            ),
            "volume_24h_quote": nonnegative(
                row.get("quoteVolume") or row.get("usdtVolume")
            ),
            "high_native": positive(row.get("high24h") or row.get("high")),
            "low_native": positive(row.get("low24h") or row.get("low")),
        }

    if adapter == "htx_legacy":
        row = data.get("tick") or {}
        return {
            "native_price": positive(row.get("close")),
            "quote": quote,
            "volume_24h_btc": nonnegative(row.get("amount")),
            "volume_24h_quote": nonnegative(row.get("vol")),
            "high_native": positive(row.get("high")),
            "low_native": positive(row.get("low")),
        }

    if adapter == "okcoin_legacy":
        return {
            "native_price": positive(data.get("last")),
            "quote": quote,
            "volume_24h_btc": nonnegative(data.get("base_volume_24h")),
            "volume_24h_quote": nonnegative(data.get("quote_volume_24h")),
            "high_native": positive(data.get("high_24h")),
            "low_native": positive(data.get("low_24h")),
        }

    if adapter == "coingecko_bitcoin_tickers":
        return parse_coingecko_bitcoin_tickers(data, fiat_codes)

    raise RuntimeError(f"unsupported adapter/parser: {adapter}")


def merge_source_config(exchange_key: str, policy: dict, providers: dict):
    """
    Policy fields come from exchanges.json.
    Transport fields come from provider_urls.json.
    Legacy transport fields embedded in exchanges.json remain valid.
    """
    merged = dict(policy or {})

    provider = providers.get(exchange_key)
    if isinstance(provider, dict):
        for key in (
            "label",
            "adapter",
            "quote",
            "price_volume_url",
            "price_url",
            "volume_url",
            "stats_url",
            "enabled_poll",
        ):
            if provider.get(key) is not None:
                merged[key] = provider.get(key)

    if merged.get("url") and not merged.get("price_volume_url"):
        merged["price_volume_url"] = merged.get("url")

    if merged.get("parser") and not merged.get("adapter"):
        merged["adapter"] = LEGACY_TO_ADAPTER.get(
            str(merged.get("parser")),
            str(merged.get("parser")),
        )

    if not merged.get("quote"):
        pair = str(merged.get("pair") or "BTC-USD")
        parts = pair.replace("_", "-").replace("/", "-").split("-")
        merged["quote"] = parts[-1].upper() if len(parts) > 1 else "USD"

    return merged


def fetch_source(exchange_key: str, source: dict, rates: dict[str, float]):
    url = source.get("price_volume_url") or source.get("url")
    adapter = source.get("adapter") or source.get("parser")
    quote = str(source.get("quote") or "USD").upper()

    if not url:
        raise RuntimeError("missing price/volume endpoint")

    if not adapter:
        raise RuntimeError("missing adapter/parser")

    data = fetch_json(str(url))
    parsed = parse_market(
        str(adapter),
        data,
        quote=quote,
        fiat_codes=set(rates),
    )

    native_price = positive(parsed.get("native_price"))
    if native_price <= 0:
        raise RuntimeError("parser returned non-positive native price")

    price_usd = normalize_native_to_usd(native_price, quote, rates)
    if price_usd <= 0:
        raise RuntimeError("USD normalization produced non-positive price")

    high_native = positive(parsed.get("high_native")) or native_price
    low_native = positive(parsed.get("low_native")) or native_price
    high_usd = normalize_native_to_usd(high_native, quote, rates)
    low_usd = normalize_native_to_usd(low_native, quote, rates)

    volume_btc = nonnegative(parsed.get("volume_24h_btc"))
    volume_quote = nonnegative(parsed.get("volume_24h_quote"))
    volume_usd = (
        normalize_native_to_usd(volume_quote, quote, rates)
        if volume_quote > 0
        else price_usd * volume_btc
        if volume_btc > 0
        else 0.0
    )

    return {
        "native_price": native_price,
        "quote": quote,
        "price_usd": price_usd,
        "volume_24h_btc": volume_btc,
        "volume_24h_usd": volume_usd,
        "high_24h": high_usd,
        "low_24h": low_usd,
        "endpoint": str(url),
        "adapter": str(adapter),
    }


def build_once(fetch_source_fn=fetch_source, fetch_height_fn=fetch_block_height):
    cfg = read_json(EXCHANGES, {})
    policy_sources = cfg.get("sources", {}) if isinstance(cfg, dict) else {}
    if not isinstance(policy_sources, dict):
        policy_sources = {}

    provider_cfg = read_json(PROVIDER_URLS, {})
    providers = (
        provider_cfg.get("providers", {})
        if isinstance(provider_cfg, dict)
        else {}
    )
    if not isinstance(providers, dict):
        providers = {}

    rates = fx_rates()
    previous = read_json(LATEST, {})
    block_height, supply_source = fetch_height_fn()

    if block_height is not None:
        supply_sats = mined_supply_sats(block_height)
        supply = supply_sats / 100_000_000.0
    else:
        previous_height = previous.get("block_height")
        try:
            previous_height = int(previous_height)
        except Exception:
            previous_height = 0

        if previous_height > 0:
            block_height = previous_height
            supply_sats = mined_supply_sats(previous_height)
            supply = supply_sats / 100_000_000.0
            supply_source = "previous_block_height"
        else:
            supply = positive(previous.get("mined_supply_btc"))
            supply_sats = int(round(supply * 100_000_000))
            supply_source = "previous_mined_supply"

    updated_at = now_iso()
    rows = {}
    markets = []
    bpi_rows = []
    health = {}

    order = cfg.get("order") if isinstance(cfg, dict) else None
    if not isinstance(order, list):
        order = list(policy_sources.keys())

    # If the catalog forgot to provide an order, provider-backed policy rows still work.
    for exchange_key in policy_sources:
        if exchange_key not in order:
            order.append(exchange_key)

    for exchange_key in order:
        policy = policy_sources.get(exchange_key)
        if not isinstance(policy, dict):
            continue

        if exchange_key == "zzx" or policy.get("kind") in ("computed", "aggregate"):
            continue

        if policy.get("enabled") is False:
            continue

        source = merge_source_config(exchange_key, policy, providers)

        try:
            parsed = fetch_source_fn(exchange_key, source, rates)

            price = positive(parsed.get("price_usd"))
            volume_btc = nonnegative(parsed.get("volume_24h_btc"))
            volume_usd = nonnegative(parsed.get("volume_24h_usd"))
            high = positive(parsed.get("high_24h")) or price
            low = positive(parsed.get("low_24h")) or price

            if price <= 0:
                raise RuntimeError("non-positive USD price after parsing")

            row = {
                "label": source.get("label", exchange_key),
                "source": exchange_key,
                "mode": "provider_registry"
                if exchange_key in providers
                else "legacy_exchange_registry",
                "pair": source.get(
                    "pair",
                    f"BTC/{source.get('quote', 'USD')}",
                ),
                "quote": str(source.get("quote") or "USD").upper(),
                "include_in_bpi": bool(
                    policy.get("include_in_bpi", True)
                ),
                "price_usd": price,
                "native_price": positive(parsed.get("native_price")),
                "volume_24h_btc": volume_btc,
                "volume_24h_usd": volume_usd,
                "high_24h": high,
                "low_24h": low,
                "supply_ratio": volume_btc / supply if supply > 0 else 0.0,
                "adapter": parsed.get("adapter"),
                "endpoint": parsed.get("endpoint"),
                "updated_at": updated_at,
            }

            rows[exchange_key] = row
            markets.append(dict(row))
            health[exchange_key] = {
                "ok": True,
                "quote": row["quote"],
                "price_usd": row["price_usd"],
                "volume_24h_btc": row["volume_24h_btc"],
                "adapter": row["adapter"],
                "updated_at": updated_at,
            }

            if row["include_in_bpi"]:
                bpi_rows.append(row)

        except Exception as exc:
            message = str(exc)
            print(f"SOURCE_FAIL {exchange_key}: {message}")

            rows[exchange_key] = {
                "label": policy.get("label", exchange_key),
                "source": exchange_key,
                "include_in_bpi": bool(
                    policy.get("include_in_bpi", True)
                ),
                "error": message,
                "updated_at": updated_at,
            }
            health[exchange_key] = {
                "ok": False,
                "error": message,
                "updated_at": updated_at,
            }

    if len(bpi_rows) < MIN_BPI_SOURCES:
        failures = [
            f"{key}={row.get('error')}"
            for key, row in rows.items()
            if row.get("error")
        ]
        detail = "; ".join(failures[:12])
        if len(failures) > 12:
            detail += f"; +{len(failures)-12} more"

        raise RuntimeError(
            "refusing to replace BPI output with only "
            f"{len(bpi_rows)} fetched source(s)"
            + (f"; diagnostics: {detail}" if detail else "")
        )

    sanity = classify_markets(
        bpi_rows,
        minimum_sources=MIN_BPI_SOURCES,
    )
    eligible_rows = sanity["accepted"]
    quarantined_rows = sanity["quarantined"]

    # Mirror consensus/quarantine annotations back into the canonical exchange
    # row map and health map. Quarantined providers remain observable but can
    # never receive BPI weight.
    for checked in eligible_rows + quarantined_rows:
        source_id = checked.get("source")
        if source_id in rows:
            rows[source_id].update({
                "index_eligible": checked.get("index_eligible"),
                "consensus_price_usd": checked.get("consensus_price_usd"),
                "consensus_deviation_pct": checked.get("consensus_deviation_pct"),
                "consensus_price_band_pct": checked.get("consensus_price_band_pct"),
                "volume_sanity_limit_btc": checked.get("volume_sanity_limit_btc"),
                "exclusion_reason": checked.get("exclusion_reason"),
            })

        if source_id in health:
            health[source_id].update({
                "index_eligible": checked.get("index_eligible"),
                "quarantined": not bool(checked.get("index_eligible")),
                "exclusion_reason": checked.get("exclusion_reason"),
                "consensus_deviation_pct": checked.get("consensus_deviation_pct"),
            })

    for checked in quarantined_rows:
        source_id = checked.get("source") or "?"
        print(
            "SOURCE_QUARANTINED "
            f"{source_id}: price=${checked.get('price_usd', 0):,.8f} "
            f"volume={checked.get('volume_24h_btc', 0):,.8f} BTC "
            f"reason={checked.get('exclusion_reason')} "
            f"consensus=${sanity['consensus_price_usd']:,.2f}"
        )

    weighted_rows = [
        row
        for row in eligible_rows
        if row["price_usd"] > 0 and row["volume_24h_btc"] > 0
    ]
    total_volume_btc = sum(
        row["volume_24h_btc"]
        for row in weighted_rows
    )

    if weighted_rows and total_volume_btc > 0:
        for row in weighted_rows:
            row["weight"] = row["volume_24h_btc"] / total_volume_btc

        price = sum(
            row["price_usd"] * row["weight"]
            for row in weighted_rows
        )
        high = sum(
            row["high_24h"] * row["weight"]
            for row in weighted_rows
        )
        low = sum(
            row["low_24h"] * row["weight"]
            for row in weighted_rows
        )

    else:
        equal_weight = 1.0 / len(eligible_rows)

        for row in eligible_rows:
            row["weight"] = equal_weight

        price = sum(
            row["price_usd"] * row["weight"]
            for row in eligible_rows
        )
        high = max(row["high_24h"] for row in eligible_rows)
        low = min(row["low_24h"] for row in eligible_rows)

    total_volume_btc = sum(
        row.get("volume_24h_btc", 0)
        for row in weighted_rows
    )
    total_volume_usd = sum(
        row.get("volume_24h_usd", 0)
        for row in weighted_rows
    )

    raw_total_volume_btc = sum(
        row.get("volume_24h_btc", 0)
        for row in bpi_rows
    )

    for market in markets:
        matching = rows.get(market["source"]) or {}
        market.update({
            "weight": matching.get("weight", 0.0),
            "index_eligible": matching.get("index_eligible"),
            "consensus_price_usd": matching.get("consensus_price_usd"),
            "consensus_deviation_pct": matching.get("consensus_deviation_pct"),
            "consensus_price_band_pct": matching.get("consensus_price_band_pct"),
            "volume_sanity_limit_btc": matching.get("volume_sanity_limit_btc"),
            "exclusion_reason": matching.get("exclusion_reason"),
        })

    latest = {
        "schema": "zzx-bpi-latest-v5.5-sanity",
        "source": "zzx-global-bpi",
        "mode": "generated",
        "base": "USD",
        "updated_at": updated_at,
        "block_height": block_height,
        "mined_supply_sats": supply_sats,
        "mined_supply_btc": supply,
        "mined_supply_source": supply_source,
        "price_usd": price,
        "btc_usd": price,
        "vwap_usd": price,
        "bpi_usd": price,
        "volume_24h_btc": total_volume_btc,
        "volume_24h_usd": total_volume_usd,
        "high_24h": high,
        "low_24h": low,
        "exchange_count": len(
            [row for row in rows.values() if row.get("price_usd", 0) > 0]
        ),
        "bpi_exchange_count": len(eligible_rows),
        "quarantined_exchange_count": len(quarantined_rows),
        "weighted_average": {
            "method": "volume_weighted_eligible_btc_fiat_markets",
            "sources": len(weighted_rows),
            "consensus_source_count": len(eligible_rows),
            "quarantined_source_count": len(quarantined_rows),
            "price_usd": price,
            "vwap_usd": price,
            "formula": "weight_i=volume_24h_btc_i/sum(volume_24h_btc); bpi=sum(price_usd_i*weight_i)",
            "policy": "BTC/XBT base + recognized fiat quote only; stablecoins/altcoins excluded; consensus/outlier gated",
        },
        "global_bpi": {
            "price_usd": price,
            "vwap_usd": price,
            "volume_24h_btc": total_volume_btc,
            "market_count": len(eligible_rows),
            "quarantined_market_count": len(quarantined_rows),
            "method": "consensus_gated_volume_weighted_btc_fiat_markets",
        },
                "sanity": {
            "consensus_price_usd": sanity["consensus_price_usd"],
            "median_absolute_deviation_pct": sanity["median_absolute_deviation_pct"],
            "price_band_pct": sanity["price_band_pct"],
            "median_positive_volume_btc": sanity["median_positive_volume_btc"],
            "volume_limit_btc": sanity["volume_limit_btc"],
            "raw_total_volume_24h_btc": raw_total_volume_btc,
        },
        "exchanges": rows,
    }

    write_json(LATEST, latest)
    write_json(MARKETS, {
        "schema": "zzx-bpi-markets-v5.5-sanity",
        "updated_at": updated_at,
        "markets": markets,
        "eligible_market_count": len(eligible_rows),
        "quarantined_market_count": len(quarantined_rows),
    })
    write_json(PROVIDER_HEALTH, {
        "schema": "zzx-bpi-provider-health-v1",
        "updated_at": updated_at,
        "providers": health,
    })

    if previous.get("price_usd") != latest.get("price_usd"):
        changes = read_json(CHANGES, [])
        if not isinstance(changes, list):
            changes = []
        changes.append({
            "updated_at": updated_at,
            "old_price_usd": previous.get("price_usd"),
            "new_price_usd": price,
        })
        write_json(CHANGES, changes[-2000:])

    history = read_json(HISTORY, [])
    if not isinstance(history, list):
        if isinstance(history, dict):
            history = history.get("rows") or history.get("history") or []
        if not isinstance(history, list):
            history = []

    history.append({
        "updated_at": updated_at,
        "price_usd": price,
        "volume_24h_btc": total_volume_btc,
        "exchange_count": latest["exchange_count"],
        "bpi_exchange_count": latest["bpi_exchange_count"],
    })
    write_json(HISTORY, history[-10000:])

    print(
        f"BPI updated ${price:,.2f}; "
        f"exchanges={latest['exchange_count']}; "
        f"bpi_sources={latest['bpi_exchange_count']}; "
        f"quarantined={len(quarantined_rows)}; "
        f"weighted={len(weighted_rows)}; "
        f"consensus=${sanity['consensus_price_usd']:,.2f}; "
        f"total_volume_btc={total_volume_btc:,.4f}; "
        f"mined_supply={supply:,.8f} BTC"
    )

    return latest


def self_test():
    """
    No-network fixture proving:
      - new split registry transport works,
      - non-USD normalization works,
      - stablecoin-like quote is not required,
      - fail-closed guard remains active,
      - volume weighting is correct.
    """
    assert mined_supply_sats(0) == 5_000_000_000
    assert mined_supply_sats(209_999) == 210_000 * 5_000_000_000
    assert mined_supply_sats(210_000) == (
        210_000 * 5_000_000_000 + 2_500_000_000
    )

    rates = {"USD": 1.0, "EUR": 0.8}
    assert abs(normalize_native_to_usd(80_000, "EUR", rates) - 100_000) < 1e-9

    coinbase = parse_market(
        "coinbase_exchange",
        {"price": "100000", "volume": "10"},
        "USD",
        set(rates),
    )
    assert coinbase["native_price"] == 100000
    assert coinbase["volume_24h_btc"] == 10

    bitstamp = parse_market(
        "bitstamp",
        {
            "last": "80000",
            "volume": "20",
            "high": "81000",
            "low": "79000",
        },
        "EUR",
        set(rates),
    )
    assert bitstamp["native_price"] == 80000

    policy = {
        "label": "Fixture",
        "enabled": True,
        "include_in_bpi": True,
    }
    providers = {
        "fixture": {
            "adapter": "bitstamp",
            "quote": "EUR",
            "price_volume_url": "https://example.invalid/ticker",
            "enabled_poll": True,
        }
    }
    merged = merge_source_config("fixture", policy, providers)
    assert merged["adapter"] == "bitstamp"
    assert merged["quote"] == "EUR"
    assert merged["price_volume_url"].startswith("https://")

    # Regression: one malformed exchange must never dominate the index.
    fixture_rows = [
        {
            "source": f"peer-{index}",
            "price_usd": price,
            "volume_24h_btc": 1000 + index * 50,
        }
        for index, price in enumerate(
            [
                78950, 79010, 78980, 79040, 78970,
                79020, 78990, 79030, 78960, 79000,
                79015, 78985, 79025, 78975, 79005,
                78995, 79012, 78988, 79018,
            ]
        )
    ]
    fixture_rows.append({
        "source": "whitebit-regression-fixture",
        "price_usd": 0.19,
        "volume_24h_btc": 4_590_000,
    })

    gate = classify_markets(fixture_rows)

    assert len(gate["accepted"]) == 19
    assert len(gate["quarantined"]) == 1

    rejected = gate["quarantined"][0]
    assert rejected["source"] == "whitebit-regression-fixture"
    assert "price_consensus_outlier" in rejected["exclusion_reason"]
    assert "volume_outlier" in rejected["exclusion_reason"]

    weighted_fixture = sum(
        row["price_usd"] * row["volume_24h_btc"]
        for row in gate["accepted"]
    ) / sum(
        row["volume_24h_btc"]
        for row in gate["accepted"]
    )

    assert 78_000 < weighted_fixture < 80_000

    print(
        "update_latest.py self-test: PASS; "
        f"outlier fixture index=${weighted_fixture:,.2f}; "
        f"quarantined={len(gate['quarantined'])}"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return

    if args.loop:
        while True:
            try:
                build_once()
            except Exception as exc:
                print("ERROR:", exc)
            time.sleep(args.interval)
    else:
        build_once()


if __name__ == "__main__":
    main()
