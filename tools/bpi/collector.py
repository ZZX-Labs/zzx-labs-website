#!/usr/bin/env python3
"""
ZZX BPI master collector.

- Serialized 2.5 second exchange-price cycle.
- Concurrent due-provider polling inside each cycle.
- Finite-value validation for every quote and volume.
- BTC/XBT-to-fiat only.
- USD normalization using 1 USD = rates[CODE] CODE.
- Atomic JSON snapshot writes.
- HTTP 429 Retry-After cooldown.
- Operator-configured HTTP(S) proxy support.
- No overlapping polling cycles.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import io
import json
import math
import os
import signal
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from history_store import HistoryStore

CYCLE_MS = 2500
FX_MS = 60_000
COMMODITY_MS = 60_000
DEBT_MS = 30 * 60_000
MAX_WORKERS = 32

STOP = False


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def finite(value: Any) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return math.nan
    return n if math.isfinite(n) else math.nan


def positive(value: Any) -> float:
    n = finite(value)
    return n if math.isfinite(n) and n > 0 else math.nan


def nonnegative(value: Any) -> float:
    n = finite(value)
    return n if math.isfinite(n) and n >= 0 else math.nan


def atomic_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
    finally:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass


def load_json(path: Path, default: Any) -> Any:
    try:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return default


@dataclass
class FetchResult:
    provider_id: str
    ok: bool
    payload: Any = None
    error: str | None = None
    status: int | None = None
    retry_after: float | None = None
    elapsed_ms: float = 0.0


class HttpClient:
    def __init__(self, proxy_url: str | None = None, timeout: float = 8.0):
        handlers: list[Any] = []
        if proxy_url:
            handlers.append(urllib.request.ProxyHandler({
                "http": proxy_url,
                "https": proxy_url,
            }))
        else:
            # Uses HTTP_PROXY / HTTPS_PROXY / NO_PROXY from the environment.
            handlers.append(urllib.request.ProxyHandler())
        self.opener = urllib.request.build_opener(*handlers)
        self.timeout = timeout
        self.user_agent = "ZZX-Labs-BPI/5.3 (+local-mirror)"

    def get(self, provider_id: str, url: str) -> FetchResult:
        started = time.monotonic()
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "application/json,text/plain,*/*",
                "Cache-Control": "no-cache",
            },
            method="GET",
        )
        try:
            with self.opener.open(req, timeout=self.timeout) as response:
                status = int(getattr(response, "status", 200))
                content_type = str(response.headers.get("Content-Type", ""))
                raw = response.read()
                if "json" in content_type or raw.lstrip().startswith((b"{", b"[")):
                    payload = json.loads(raw.decode("utf-8", "replace"))
                else:
                    payload = raw.decode("utf-8", "replace")
                return FetchResult(
                    provider_id=provider_id,
                    ok=True,
                    payload=payload,
                    status=status,
                    elapsed_ms=(time.monotonic() - started) * 1000,
                )
        except urllib.error.HTTPError as exc:
            retry = exc.headers.get("Retry-After") if exc.headers else None
            retry_after = finite(retry)
            return FetchResult(
                provider_id=provider_id,
                ok=False,
                error=f"HTTP {exc.code}",
                status=exc.code,
                retry_after=retry_after if math.isfinite(retry_after) else None,
                elapsed_ms=(time.monotonic() - started) * 1000,
            )
        except Exception as exc:
            return FetchResult(
                provider_id=provider_id,
                ok=False,
                error=str(exc),
                elapsed_ms=(time.monotonic() - started) * 1000,
            )


def first_value(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in mapping and mapping[key] not in (None, ""):
            return mapping[key]
    return None


def market(
    provider_id: str,
    label: str,
    quote: str,
    native_price: Any,
    volume_btc: Any,
    high: Any = None,
    low: Any = None,
) -> dict[str, Any]:
    p = positive(native_price)
    v = nonnegative(volume_btc)
    if not math.isfinite(p):
        raise ValueError("non-finite/non-positive price")
    if not math.isfinite(v):
        raise ValueError("non-finite/negative BTC volume")
    return {
        "exchange": provider_id,
        "label": label,
        "base": "BTC",
        "quote": str(quote).upper(),
        "pair": f"BTC/{str(quote).upper()}",
        "native_price": p,
        "volume_24h_btc": v,
        "high_24h_native": positive(high),
        "low_24h_native": positive(low),
    }


def parse_market(provider: dict[str, Any], payload: Any) -> dict[str, Any]:
    pid = provider["id"]
    label = provider.get("label", pid)
    quote = provider.get("quote") or "USD"
    adapter = provider.get("adapter")

    if adapter == "coinbase_exchange":
        return market(pid, label, quote, payload["price"], payload["volume"])

    if adapter == "kraken":
        result = payload.get("result") or {}
        row = next(iter(result.values()))
        return market(pid, label, quote, row["c"][0], row["v"][1], row["h"][1], row["l"][1])

    if adapter == "gemini":
        vol = payload.get("volume") or {}
        return market(pid, label, quote, payload["last"], vol.get("BTC") or vol.get("btc") or payload.get("volume"))

    if adapter == "bitstamp":
        return market(pid, label, quote, payload["last"], payload["volume"], payload.get("high"), payload.get("low"))

    if adapter == "bitfinex":
        # [BID,BID_SIZE,ASK,ASK_SIZE,DAILY_CHANGE,DAILY_CHANGE_RELATIVE,LAST_PRICE,VOLUME,HIGH,LOW]
        return market(pid, label, quote, payload[6], payload[7], payload[8], payload[9])

    if adapter == "binance_24h":
        return market(pid, label, quote, payload["lastPrice"], payload["volume"], payload.get("highPrice"), payload.get("lowPrice"))

    if adapter == "bitflyer":
        return market(pid, label, quote, payload["ltp"], payload["volume_by_product"])

    if adapter == "coincheck":
        return market(pid, label, quote, payload["last"], payload["volume"])

    if adapter == "upbit":
        row = payload[0]
        return market(pid, label, quote, row["trade_price"], row["acc_trade_volume_24h"], row.get("high_price"), row.get("low_price"))

    if adapter == "bithumb":
        row = payload.get("data") or {}
        return market(pid, label, quote, row["closing_price"], row["units_traded_24H"], row.get("max_price"), row.get("min_price"))

    if adapter == "btcmarkets":
        return market(pid, label, quote, payload["lastPrice"], payload["volume24h"], payload.get("high24h"), payload.get("low24h"))

    if adapter == "independent_reserve":
        return market(pid, label, quote, payload["LastPrice"], payload["DayVolumeXbt"], payload.get("DayHighestPrice"), payload.get("DayLowestPrice"))

    if adapter == "bitso":
        row = payload.get("payload") or {}
        return market(pid, label, quote, row["last"], row["volume"], row.get("high"), row.get("low"))

    if adapter == "btcturk":
        rows = payload.get("data") or []
        row = rows[0]
        return market(pid, label, quote, row["last"], row["volume"], row.get("high"), row.get("low"))

    if adapter == "bitkub":
        row = next(iter(payload.values()))
        return market(pid, label, quote, row["last"], row["baseVolume"], row.get("high24hr"), row.get("low24hr"))

    if adapter == "indodax":
        row = payload.get("ticker") or {}
        return market(pid, label, quote, row["last"], row["vol_btc"], row.get("high"), row.get("low"))

    if adapter == "luno":
        return market(pid, label, quote, payload["last_trade"], payload["rolling_24_hour_volume"])

    if adapter == "valr":
        return market(pid, label, quote, payload["lastTradedPrice"], payload["baseVolume"], payload.get("highPrice"), payload.get("lowPrice"))

    if adapter == "cexio":
        return market(pid, label, quote, payload["last"], payload["volume"], payload.get("high"), payload.get("low"))

    if adapter == "mercado_bitcoin":
        row = payload.get("ticker") or {}
        return market(pid, label, quote, row["last"], row["vol"], row.get("high"), row.get("low"))

    if adapter == "whitebit":
        row = next(iter(payload.values())) if isinstance(payload, dict) else payload
        return market(pid, label, quote, row["last_price"], row.get("base_volume") or row.get("volume"), row.get("high"), row.get("low"))

    if adapter == "bitbank":
        row = payload.get("data") or payload
        return market(pid, label, quote, row.get("last"), row.get("vol"), row.get("high"), row.get("low"))

    if adapter == "zaif":
        return market(pid, label, quote, payload.get("last"), payload.get("volume"), payload.get("high"), payload.get("low"))

    if adapter == "gmo_coin":
        rows = payload.get("data") or []
        row = rows[0] if isinstance(rows, list) and rows else {}
        return market(pid, label, quote, row.get("last"), row.get("volume"), row.get("high"), row.get("low"))

    if adapter == "coinone":
        rows = payload.get("tickers") or payload.get("ticker") or payload.get("data") or []
        row = rows[0] if isinstance(rows, list) and rows else rows if isinstance(rows, dict) else {}
        return market(
            pid, label, quote,
            first_value(row, "last", "last_price", "close"),
            first_value(row, "target_volume", "volume", "yesterday_last_volume"),
            first_value(row, "high", "high_price"),
            first_value(row, "low", "low_price"),
        )

    if adapter == "korbit":
        return market(pid, label, quote, payload.get("last"), payload.get("volume"), payload.get("high"), payload.get("low"))

    if adapter == "buda":
        row = payload.get("ticker") or {}
        last = row.get("last_price")
        volume = row.get("volume")
        if isinstance(last, list):
            last = last[0] if last else None
        if isinstance(volume, list):
            volume = volume[0] if volume else None
        return market(pid, label, quote, last, volume)

    if adapter == "bitvavo":
        row = payload[0] if isinstance(payload, list) and payload else payload
        return market(pid, label, quote, row.get("last"), row.get("volume"), row.get("high"), row.get("low"))

    if adapter == "paymium":
        return market(pid, label, quote, first_value(payload, "price", "last", "midpoint", "vwap"), payload.get("volume"), payload.get("high"), payload.get("low"))

    if adapter == "max_exchange":
        row = payload.get("ticker") or payload
        return market(pid, label, quote, row.get("last"), row.get("volume"), row.get("high"), row.get("low"))

    if adapter == "bitopro":
        row = payload.get("data") or payload
        return market(
            pid, label, quote,
            first_value(row, "lastPrice", "last_price", "last"),
            first_value(row, "volume24hr", "volume24h", "volume"),
            first_value(row, "high24hr", "high24h", "high"),
            first_value(row, "low24hr", "low24h", "low"),
        )

    if adapter == "novadax":
        rows = payload.get("data") or []
        row = next((x for x in rows if str(x.get("symbol") or "").upper() in ("BTC_BRL", "BTCBRL")), rows[0] if rows else {})
        return market(
            pid, label, quote,
            first_value(row, "lastPrice", "last_price", "last"),
            first_value(row, "amount24h", "baseVolume", "volume"),
            first_value(row, "high24h", "high"),
            first_value(row, "low24h", "low"),
        )

    if adapter == "coindcx":
        rows = payload if isinstance(payload, list) else payload.get("data") or []
        row = next((x for x in rows if str(x.get("market") or x.get("symbol") or "").replace("_", "").upper() == "BTCINR"), {})
        return market(
            pid, label, quote,
            first_value(row, "last_price", "lastPrice", "last"),
            first_value(row, "volume", "base_volume", "baseVolume"),
            first_value(row, "high", "high24h"),
            first_value(row, "low", "low24h"),
        )

    if adapter == "coins_ph":
        return market(
            pid, label, quote,
            first_value(payload, "lastPrice", "last_price", "last"),
            first_value(payload, "volume", "baseVolume", "base_volume"),
            first_value(payload, "highPrice", "high24h", "high"),
            first_value(payload, "lowPrice", "low24h", "low"),
        )

    raise ValueError(f"unsupported adapter {adapter!r}")


def parse_fx(adapter: str, payload: Any) -> dict[str, float]:
    out: dict[str, float] = {"USD": 1.0}

    if adapter == "frankfurter":
        source = payload.get("rates") or {}
        for code, value in source.items():
            n = positive(value)
            if math.isfinite(n):
                out[str(code).upper()] = n
        return out

    if adapter == "er_api":
        source = payload.get("rates") or {}
        for code, value in source.items():
            n = positive(value)
            if math.isfinite(n):
                out[str(code).upper()] = n
        return out

    if adapter == "floatrates":
        for code, row in payload.items():
            n = positive((row or {}).get("rate"))
            if math.isfinite(n):
                out[str(code).upper()] = n
        return out

    return out


def normalize_usd(native_price: float, quote: str, fx_rates: dict[str, float]) -> float:
    q = str(quote).upper()
    if q == "USD":
        return native_price
    per_usd = positive(fx_rates.get(q))
    if not math.isfinite(per_usd):
        return math.nan
    value = native_price / per_usd
    return value if math.isfinite(value) and value > 0 else math.nan


def calculate_index(markets: list[dict[str, Any]]) -> tuple[float, float]:
    weighted = [m for m in markets if positive(m.get("price_usd")) > 0 and positive(m.get("volume_24h_btc")) > 0]
    total_volume = sum(float(m["volume_24h_btc"]) for m in weighted)
    if not weighted or total_volume <= 0:
        return math.nan, 0.0

    price = sum(float(m["price_usd"]) * float(m["volume_24h_btc"]) for m in weighted) / total_volume
    for row in markets:
        v = nonnegative(row.get("volume_24h_btc"))
        row["weight"] = (v / total_volume) if math.isfinite(v) and v > 0 else 0.0
        row["deviation_pct"] = ((float(row["price_usd"]) - price) / price * 100.0) if positive(row.get("price_usd")) > 0 else None
    return price, total_volume


def weighted_metric(markets: list[dict[str, Any]], key: str, fallback_key: str = "price_usd") -> float:
    weighted = [m for m in markets if positive(m.get("volume_24h_btc")) > 0 and positive(m.get(key) or m.get(fallback_key)) > 0]
    total = sum(float(m["volume_24h_btc"]) for m in weighted)
    if weighted and total > 0:
        return sum(float(m.get(key) or m.get(fallback_key)) * float(m["volume_24h_btc"]) for m in weighted) / total
    values = [positive(m.get(key) or m.get(fallback_key)) for m in markets]
    values = [v for v in values if math.isfinite(v)]
    return sum(values) / len(values) if values else math.nan


class Collector:
    def __init__(self, root: Path, proxy_url: str | None = None):
        self.root = root
        self.api = root / "bitcoin/bpi/api"
        self.client = HttpClient(proxy_url=proxy_url)
        self.providers = load_json(self.api / "provider_urls.json", {}).get("providers", {})
        self.exchange_registry = load_json(self.api / "exchanges.json", {})
        self.fx_source_cfg = load_json(self.api / "fx_source_urls.json", {})
        self.commodity_cfg = load_json(self.api / "commodity_source_urls.json", {})
        self.fx_rates = {"USD": 1.0}
        self.next_fx = 0.0
        self.next_commodity = 0.0
        self.next_discovery = 0.0
        self.market_configs: list[dict[str, Any]] = []
        self.provider_due: dict[str, float] = {}
        self.health: dict[str, Any] = {}
        self.history = HistoryStore(root / "bitcoin/bpi/history.sqlite3")
        self.static_history_path = self.api / "history-live.json"
        previous_static = load_json(self.static_history_path, {})
        self.static_history: dict[str, list[dict[str, Any]]] = (
            previous_static.get("series", {})
            if isinstance(previous_static, dict) and isinstance(previous_static.get("series"), dict)
            else {}
        )

    def refresh_fx(self, now: float) -> None:
        if now < self.next_fx:
            return

        merged = {"USD": 1.0}
        providers = []
        for source in sorted(self.fx_source_cfg.get("sources", []), key=lambda x: x.get("priority", 999)):
            if not source.get("enabled", True):
                continue
            result = self.client.get(source["id"], source["url"])
            if not result.ok:
                continue
            try:
                rates = parse_fx(source["adapter"], result.payload)
            except Exception:
                continue
            for code, rate in rates.items():
                if code not in merged and positive(rate) > 0:
                    merged[code] = float(rate)
            providers.append({
                "id": source["id"],
                "url": source["url"],
                "rates": len(rates),
            })

        if len(merged) > 1:
            self.fx_rates = merged
            atomic_json(self.api / "exchange_rates.json", {
                "schema": "zzx-bpi-exchange-rates-v5-master",
                "base": "USD",
                "updated_at": utcnow(),
                "rates": merged,
                "providers": providers,
                "convention": "1 USD = rates[CODE] CODE",
            })

        self.next_fx = now + FX_MS / 1000.0


    def discover_provider(self, cfg: dict[str, Any]) -> list[dict[str, Any]]:
        """Return every discoverable BTC/XBT-to-fiat market for one provider."""
        url = cfg.get("discovery_url")
        adapter = cfg.get("adapter")

        if not url:
            one = dict(cfg)
            one["market_key"] = cfg["id"] + "::" + str(cfg.get("quote") or "USD")
            return [one]

        result = self.client.get(cfg["id"] + ":discovery", url)
        if not result.ok:
            one = dict(cfg)
            one["market_key"] = cfg["id"] + "::" + str(cfg.get("quote") or "USD")
            return [one]

        payload = result.payload
        out: list[dict[str, Any]] = []
        fiat = set(self.fx_rates)

        def add(quote: str, market_id: str, price_url: str) -> None:
            q = str(quote or "").upper()
            if q not in fiat:
                return
            row = dict(cfg)
            row["quote"] = q
            row["price_volume_url"] = price_url
            row["market_id"] = market_id
            row["market_key"] = f"{cfg['id']}::{market_id}"
            out.append(row)

        try:
            if adapter == "coinbase_exchange" and isinstance(payload, list):
                for row in payload:
                    base = str(row.get("base_currency") or "").upper()
                    quote = str(row.get("quote_currency") or "").upper()
                    product = str(row.get("id") or "")
                    if base == "BTC" and quote in fiat and product:
                        add(quote, product, f"https://api.exchange.coinbase.com/products/{product}/ticker")

            elif adapter == "kraken" and isinstance(payload, dict):
                for row in (payload.get("result") or {}).values():
                    wsname = str(row.get("wsname") or "")
                    altname = str(row.get("altname") or "")
                    parts = wsname.split("/")
                    if len(parts) == 2 and parts[0].upper() in ("XBT", "BTC") and parts[1].upper() in fiat and altname:
                        add(parts[1].upper(), altname, "https://api.kraken.com/0/public/Ticker?pair=" + urllib.parse.quote(altname))

            elif adapter == "gemini" and isinstance(payload, list):
                for symbol in payload:
                    raw = str(symbol).lower()
                    if raw.startswith("btc") and len(raw) >= 6:
                        quote = raw[3:].upper()
                        if quote in fiat:
                            add(quote, raw, f"https://api.gemini.com/v1/pubticker/{raw}")

            elif adapter == "bitstamp" and isinstance(payload, list):
                for row in payload:
                    base = str(row.get("base_currency") or row.get("base_currency_code") or "").upper()
                    quote = str(row.get("counter_currency") or row.get("quote_currency") or row.get("counter_currency_code") or "").upper()
                    symbol = str(row.get("market_symbol") or row.get("url_symbol") or "").lower()
                    if base == "BTC" and quote in fiat and symbol:
                        add(quote, symbol, f"https://www.bitstamp.net/api/v2/ticker/{symbol}/")

            elif adapter == "binance_24h" and isinstance(payload, dict):
                for row in payload.get("symbols") or []:
                    base = str(row.get("baseAsset") or "").upper()
                    quote = str(row.get("quoteAsset") or "").upper()
                    symbol = str(row.get("symbol") or "")
                    if base == "BTC" and quote in fiat and symbol:
                        add(quote, symbol, "https://api.binance.us/api/v3/ticker/24hr?symbol=" + urllib.parse.quote(symbol))

            elif adapter == "upbit" and isinstance(payload, list):
                for row in payload:
                    market_id = str(row.get("market") or "")
                    parts = market_id.split("-")
                    if len(parts) == 2 and parts[1].upper() == "BTC" and parts[0].upper() in fiat:
                        add(parts[0].upper(), market_id, "https://api.upbit.com/v1/ticker?markets=" + urllib.parse.quote(market_id))

            elif adapter == "bitflyer" and isinstance(payload, list):
                for row in payload:
                    product = str(row.get("product_code") or "")
                    parts = product.split("_")
                    if len(parts) == 2 and parts[0].upper() == "BTC" and parts[1].upper() in fiat:
                        add(parts[1].upper(), product, "https://api.bitflyer.com/v1/ticker?product_code=" + urllib.parse.quote(product))

            elif adapter == "btcmarkets" and isinstance(payload, list):
                for row in payload:
                    market_id = str(row.get("marketId") or row.get("market_id") or "")
                    base = str(row.get("baseAssetName") or row.get("base_asset") or "").upper()
                    quote = str(row.get("quoteAssetName") or row.get("quote_asset") or "").upper()
                    if base == "BTC" and quote in fiat and market_id:
                        add(quote, market_id, "https://api.btcmarkets.net/v3/markets/" + urllib.parse.quote(market_id) + "/ticker")
        except Exception:
            out = []

        if not out:
            one = dict(cfg)
            one["market_key"] = cfg["id"] + "::" + str(cfg.get("quote") or "USD")
            return [one]

        # Stable deterministic order + no duplicate market URLs.
        unique = {}
        for row in out:
            unique[row["market_key"]] = row
        return [unique[k] for k in sorted(unique)]

    def refresh_discovery(self, now: float) -> None:
        if self.market_configs and now < self.next_discovery:
            return

        markets: list[dict[str, Any]] = []
        for cfg in self.providers.values():
            if not cfg.get("enabled_poll") or not cfg.get("adapter") or not cfg.get("price_volume_url"):
                continue
            markets.extend(self.discover_provider(cfg))

        self.market_configs = markets
        self.next_discovery = now + 30 * 60

    def fetch_due_markets(self, now: float) -> list[dict[str, Any]]:
        self.refresh_discovery(now)
        due: list[dict[str, Any]] = []

        for cfg in self.market_configs:
            pid = cfg["id"]
            key = cfg.get("market_key") or pid
            url = cfg.get("price_volume_url")
            if not url or not cfg.get("adapter"):
                continue
            if now < self.provider_due.get(key, 0.0):
                continue
            due.append(cfg)

        if not due:
            latest = load_json(self.api / "markets.json", {}).get("markets", [])
            return [m for m in latest if isinstance(m, dict)]

        fresh: list[dict[str, Any]] = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(MAX_WORKERS, max(1, len(due)))) as pool:
            jobs = {pool.submit(self.client.get, cfg["id"], cfg["price_volume_url"]): cfg for cfg in due}
            for future in concurrent.futures.as_completed(jobs):
                cfg = jobs[future]
                pid = cfg["id"]
                key = cfg.get("market_key") or pid
                result = future.result()

                interval = max(2500, int(cfg.get("poll_interval_ms") or CYCLE_MS)) / 1000.0
                if result.retry_after:
                    interval = max(interval, float(result.retry_after))

                self.provider_due[key] = time.monotonic() + interval

                if not result.ok:
                    self.health[key] = {
                        "ok": False,
                        "error": result.error,
                        "status": result.status,
                        "elapsed_ms": result.elapsed_ms,
                        "updated_at": utcnow(),
                    }
                    continue

                try:
                    row = parse_market(cfg, result.payload)
                    usd = normalize_usd(float(row["native_price"]), row["quote"], self.fx_rates)
                    if not math.isfinite(usd):
                        raise ValueError(f"missing/invalid USD FX normalization for {row['quote']}")

                    row["price_usd"] = usd
                    hi_native = positive(row.get("high_24h_native"))
                    lo_native = positive(row.get("low_24h_native"))
                    row["high_24h_usd"] = normalize_usd(float(hi_native), row["quote"], self.fx_rates) if math.isfinite(hi_native) else usd
                    row["low_24h_usd"] = normalize_usd(float(lo_native), row["quote"], self.fx_rates) if math.isfinite(lo_native) else usd
                    if cfg.get("market_id"):
                        row["pair"] = str(cfg["market_id"])
                    row["market_key"] = key
                    row["source_url"] = cfg["price_volume_url"]
                    row["transport"] = "direct-or-operator-proxy"
                    row["updated_at"] = utcnow()
                    fresh.append(row)

                    self.health[key] = {
                        "ok": True,
                        "quote": row["quote"],
                        "price_usd": usd,
                        "volume_24h_btc": row["volume_24h_btc"],
                        "elapsed_ms": result.elapsed_ms,
                        "updated_at": utcnow(),
                    }
                except Exception as exc:
                    self.health[key] = {
                        "ok": False,
                        "error": str(exc),
                        "elapsed_ms": result.elapsed_ms,
                        "updated_at": utcnow(),
                    }

        # Retain still-valid rows from providers not due this cycle.
        prior = load_json(self.api / "markets.json", {}).get("markets", [])
        by_market = {
            str(m.get("market_key") or (str(m.get("exchange")) + "::" + str(m.get("pair")))): m
            for m in prior
            if isinstance(m, dict)
        }
        for row in fresh:
            by_market[str(row.get("market_key") or (str(row.get("exchange")) + "::" + str(row.get("pair"))))] = row

        return list(by_market.values())

    def append_static_history(self, source: str, price: float, volume: float | None, ts_ms: int) -> None:
        p = positive(price)
        if not math.isfinite(p):
            return

        bucket = (int(ts_ms) // 60_000) * 60_000
        rows = self.static_history.setdefault(str(source), [])
        v = nonnegative(volume)
        volume_value = float(v) if math.isfinite(v) else None

        if rows and int(rows[-1].get("t") or -1) == bucket:
            row = rows[-1]
            row["high"] = max(float(row.get("high") or p), p)
            row["low"] = min(float(row.get("low") or p), p)
            previous_close = float(row.get("close") or p)
            row["close"] = p
            row["price"] = p
            row["volume_24h_btc"] = volume_value
            row["change"] = p - previous_close
            row["change_pct"] = ((p - previous_close) / previous_close * 100.0) if previous_close else None
        else:
            previous_close = float(rows[-1].get("close") or p) if rows else None
            change = (p - previous_close) if previous_close is not None else None
            rows.append({
                "t": bucket,
                "open": p,
                "high": p,
                "low": p,
                "close": p,
                "price": p,
                "volume_24h_btc": volume_value,
                "change": change,
                "change_pct": (change / previous_close * 100.0) if previous_close not in (None, 0) else None,
            })

        if len(rows) > 1_440:
            del rows[:-1_440]

    def write_static_history(self, ts_ms: int, core_bpi: float, core_volume: float, global_bpi: float, total_volume: float, exchanges: dict[str, Any]) -> None:
        if math.isfinite(core_bpi):
            self.append_static_history("bpi", core_bpi, core_volume, ts_ms)
        if math.isfinite(global_bpi):
            self.append_static_history("global-bpi", global_bpi, total_volume, ts_ms)

        for exchange_id, row in exchanges.items():
            p = positive(row.get("price_usd"))
            if math.isfinite(p):
                self.append_static_history(exchange_id, p, row.get("volume_24h_btc"), ts_ms)

        atomic_json(self.static_history_path, {
            "schema": "zzx-bpi-history-live-v1",
            "updated_at": utcnow(),
            "resolution": "1m-live-close",
            "series": self.static_history,
        })

    def write_price_snapshots(self, markets: list[dict[str, Any]]) -> None:
        # Remove invalid/non-finite values before JSON serialization.
        valid = []
        for row in markets:
            price = positive(row.get("price_usd"))
            volume = nonnegative(row.get("volume_24h_btc"))
            if not math.isfinite(price) or not math.isfinite(volume):
                continue
            clean = dict(row)
            for key in ("high_24h_native", "low_24h_native", "deviation_pct"):
                if key in clean and not math.isfinite(finite(clean[key])):
                    clean[key] = None
            valid.append(clean)

        global_bpi, total_volume = calculate_index(valid)

        registry_sources = self.exchange_registry.get("sources", {})
        core_markets = [
            m for m in valid
            if (registry_sources.get(m.get("exchange")) or {}).get("include_in_bpi") is True
        ]
        core_bpi, core_volume = calculate_index(core_markets)

        if not math.isfinite(core_bpi):
            core_bpi = global_bpi
            core_volume = total_volume

        global_high = weighted_metric(valid, "high_24h_usd")
        global_low = weighted_metric(valid, "low_24h_usd")
        core_high = weighted_metric(core_markets or valid, "high_24h_usd")
        core_low = weighted_metric(core_markets or valid, "low_24h_usd")

        exchanges = {}
        grouped: dict[str, list[dict[str, Any]]] = {}
        for m in valid:
            grouped.setdefault(str(m["exchange"]), []).append(m)

        for exchange_id, rows in grouped.items():
            volume = sum(float(r["volume_24h_btc"]) for r in rows if positive(r.get("volume_24h_btc")) > 0)
            if volume > 0:
                price = sum(float(r["price_usd"]) * float(r["volume_24h_btc"]) for r in rows if positive(r.get("volume_24h_btc")) > 0) / volume
            else:
                price = sum(float(r["price_usd"]) for r in rows) / len(rows)

            exchanges[exchange_id] = {
                "label": rows[0].get("label", exchange_id),
                "price_usd": price,
                "quote": "MULTI" if len({r.get("quote") for r in rows}) > 1 else rows[0].get("quote"),
                "fiat_quotes": sorted({str(r.get("quote")) for r in rows}),
                "market_count": len(rows),
                "volume_24h_btc": volume,
                "high_24h": weighted_metric(rows, "high_24h_usd"),
                "low_24h": weighted_metric(rows, "low_24h_usd"),
                "weight": sum(float(r.get("weight") or 0.0) for r in rows),
                "updated_at": max((str(r.get("updated_at") or "") for r in rows), default=None),
                "mode": "exchange-volume-weighted-btc-fiat",
            }

        now = utcnow()
        atomic_json(self.api / "markets.json", {
            "schema": "zzx-bpi-markets-v5-master",
            "updated_at": now,
            "markets": valid,
            "eligible_market_count": len(valid),
        })

        atomic_json(self.api / "latest.json", {
            "schema": "zzx-bpi-latest-v5-master",
            "updated_at": now,
            "price_usd": core_bpi if math.isfinite(core_bpi) else None,
            "bpi_usd": core_bpi if math.isfinite(core_bpi) else None,
            "volume_24h_btc": core_volume,
            "high_24h": core_high if math.isfinite(core_high) else None,
            "low_24h": core_low if math.isfinite(core_low) else None,
            "bpi_exchange_count": len(core_markets) if core_markets else len(valid),
            "global_bpi": {
                "price_usd": global_bpi if math.isfinite(global_bpi) else None,
                "volume_24h_btc": total_volume,
                "high_24h": global_high if math.isfinite(global_high) else None,
                "low_24h": global_low if math.isfinite(global_low) else None,
                "market_count": len(valid),
                "method": "volume_weighted_all_btc_fiat_markets",
            },
            "global_bpi_usd": global_bpi if math.isfinite(global_bpi) else None,
            "exchanges": exchanges,
        })

        atomic_json(self.api / "provider_health.json", {
            "schema": "zzx-bpi-provider-health-v1",
            "updated_at": now,
            "providers": self.health,
        })

        ts_ms = int(time.time() * 1000)
        for row in valid:
            self.history.append_market(ts_ms, row)
        if math.isfinite(core_bpi):
            self.history.append_index(ts_ms, "bpi", core_bpi, core_volume)
        if math.isfinite(global_bpi):
            self.history.append_index(ts_ms, "global-bpi", global_bpi, total_volume)
        self.history.commit()
        self.write_static_history(ts_ms, core_bpi, core_volume, global_bpi, total_volume, exchanges)

    def run_once(self) -> None:
        now = time.monotonic()
        self.refresh_fx(now)
        markets = self.fetch_due_markets(now)
        self.write_price_snapshots(markets)

    def run(self) -> None:
        global STOP
        while not STOP:
            started = time.monotonic()
            self.run_once()
            elapsed = time.monotonic() - started
            remaining = max(0.0, CYCLE_MS / 1000.0 - elapsed)
            if remaining:
                time.sleep(remaining)


def handle_signal(_signum: int, _frame: Any) -> None:
    global STOP
    STOP = True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--once", action="store_true")
    parser.add_argument(
        "--proxy",
        default=os.environ.get("ZZX_BPI_PROXY"),
        help="Optional operator-configured HTTP/HTTPS proxy URL. HTTP_PROXY/HTTPS_PROXY are otherwise honored.",
    )
    args = parser.parse_args()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    collector = Collector(Path(args.root).resolve(), proxy_url=args.proxy)
    if args.once:
        collector.run_once()
    else:
        collector.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
