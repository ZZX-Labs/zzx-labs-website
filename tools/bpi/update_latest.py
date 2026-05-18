#!/usr/bin/env python3
import argparse
import json
import time
import urllib.request
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
API_DIR = ROOT / "bitcoin" / "bpi" / "api"

EXCHANGES = API_DIR / "exchanges.json"
LATEST = API_DIR / "latest.json"
CHANGES = API_DIR / "changes.json"
HISTORY = API_DIR / "history.json"


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8"
    )


def fetch_json(url, timeout=20):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ZZX-Labs-BPI/2.0",
            "Accept": "application/json"
        }
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def n(value):
    try:
        x = float(value)
        return x if x == x else 0.0
    except Exception:
        return 0.0


def mined_supply_btc():
    halvings = [
        (210000, 50.0),
        (210000, 25.0),
        (210000, 12.5),
        (210000, 6.25),
        (210000, 3.125),
    ]

    total = 0.0

    for blocks, reward in halvings:
        total += blocks * reward

    return total


def parse(parser, data):
    if parser == "coinbase_stats":
        return {
            "price_usd": n(data.get("last")),
            "volume_24h_btc": n(data.get("volume")),
            "high_24h": n(data.get("high")),
            "low_24h": n(data.get("low"))
        }

    if parser == "coinbase_spot":
        return {
            "price_usd": n(data.get("data", {}).get("amount")),
            "volume_24h_btc": 0,
            "high_24h": 0,
            "low_24h": 0
        }

    if parser == "kraken_ticker":
        result = data.get("result", {})
        ticker = (
            result.get("XXBTZUSD")
            or result.get("XBTUSD")
            or result.get("BTCUSD")
            or (list(result.values())[0] if result else {})
        )

        return {
            "price_usd": n((ticker.get("c") or [0])[0]),
            "volume_24h_btc": n((ticker.get("v") or [0, 0])[1]),
            "high_24h": n((ticker.get("h") or [0, 0])[1]),
            "low_24h": n((ticker.get("l") or [0, 0])[1])
        }

    if parser == "gemini_pubticker":
        volume = data.get("volume", {})
        return {
            "price_usd": n(data.get("last")),
            "volume_24h_btc": n(volume.get("BTC")),
            "volume_24h_usd": n(volume.get("USD")),
            "high_24h": 0,
            "low_24h": 0
        }

    if parser == "bitstamp_ticker":
        return {
            "price_usd": n(data.get("last")),
            "volume_24h_btc": n(data.get("volume")),
            "high_24h": n(data.get("high")),
            "low_24h": n(data.get("low"))
        }

    if parser == "bitfinex_v2_ticker" and isinstance(data, list):
        return {
            "price_usd": n(data[6]),
            "volume_24h_btc": n(data[7]),
            "high_24h": n(data[8]),
            "low_24h": n(data[9])
        }

    if parser == "okx_ticker":
        ticker = (data.get("data") or [{}])[0]
        price = n(ticker.get("last"))
        volume_btc = n(ticker.get("volCcy24h") or ticker.get("vol24h"))
        volume_usd = n(ticker.get("vol24h"))

        return {
            "price_usd": price,
            "volume_24h_btc": volume_btc,
            "volume_24h_usd": volume_usd or (volume_btc * price if price and volume_btc else 0),
            "high_24h": n(ticker.get("high24h")),
            "low_24h": n(ticker.get("low24h"))
        }

    if parser == "crypto_com_ticker":
        ticker = (data.get("result", {}).get("data") or [{}])[0]
        return {
            "price_usd": n(ticker.get("a") or ticker.get("last") or ticker.get("price")),
            "volume_24h_btc": n(ticker.get("v") or ticker.get("volume")),
            "high_24h": n(ticker.get("h") or ticker.get("high")),
            "low_24h": n(ticker.get("l") or ticker.get("low"))
        }

    if parser == "kucoin_stats":
        ticker = data.get("data", {})
        return {
            "price_usd": n(ticker.get("last")),
            "volume_24h_btc": n(ticker.get("vol")),
            "volume_24h_usd": n(ticker.get("volValue")),
            "high_24h": n(ticker.get("high")),
            "low_24h": n(ticker.get("low"))
        }

    if parser == "gateio_ticker":
        ticker = data[0] if isinstance(data, list) and data else data
        return {
            "price_usd": n(ticker.get("last")),
            "volume_24h_btc": n(ticker.get("base_volume")),
            "volume_24h_usd": n(ticker.get("quote_volume")),
            "high_24h": n(ticker.get("high_24h")),
            "low_24h": n(ticker.get("low_24h"))
        }

    if parser == "bitget_ticker":
        rows = data.get("data") or [{}]
        ticker = rows[0] if isinstance(rows, list) else rows
        return {
            "price_usd": n(ticker.get("lastPr") or ticker.get("close") or ticker.get("last")),
            "volume_24h_btc": n(ticker.get("baseVolume") or ticker.get("baseVol")),
            "volume_24h_usd": n(ticker.get("quoteVolume") or ticker.get("usdtVolume")),
            "high_24h": n(ticker.get("high24h") or ticker.get("high")),
            "low_24h": n(ticker.get("low24h") or ticker.get("low"))
        }

    if parser in ("mexc_24hr", "binance_24hr"):
        return {
            "price_usd": n(data.get("lastPrice")),
            "volume_24h_btc": n(data.get("volume")),
            "volume_24h_usd": n(data.get("quoteVolume")),
            "high_24h": n(data.get("highPrice")),
            "low_24h": n(data.get("lowPrice"))
        }

    if parser == "htx_merged":
        ticker = data.get("tick", {})
        return {
            "price_usd": n(ticker.get("close")),
            "volume_24h_btc": n(ticker.get("amount")),
            "volume_24h_usd": n(ticker.get("vol")),
            "high_24h": n(ticker.get("high")),
            "low_24h": n(ticker.get("low"))
        }

    if parser == "okcoin_ticker":
        return {
            "price_usd": n(data.get("last")),
            "volume_24h_btc": n(data.get("base_volume_24h")),
            "volume_24h_usd": n(data.get("quote_volume_24h")),
            "high_24h": n(data.get("high_24h")),
            "low_24h": n(data.get("low_24h"))
        }

    return {
        "price_usd": 0,
        "volume_24h_btc": 0,
        "volume_24h_usd": 0,
        "high_24h": 0,
        "low_24h": 0
    }


def fetch_coingecko_exchange_fallback(exchange_key, cfg):
    exchange_ids = (
        cfg.get("coingecko_exchange_ids", {})
        .get(exchange_key, [])
    )

    for exchange_id in exchange_ids:
        try:
            url = (
                "https://api.coingecko.com/api/v3/exchanges/"
                + exchange_id
                + "/tickers?coin_ids=bitcoin"
            )

            data = fetch_json(url)
            rows = []

            for ticker in data.get("tickers", []):
                base = str(ticker.get("base", "")).upper()
                target = str(ticker.get("target", "")).upper()

                if base not in ("BTC", "XBT"):
                    continue

                if target not in ("USD", "USDT", "USDC"):
                    continue

                price = n((ticker.get("converted_last") or {}).get("usd"))
                volume_usd = n((ticker.get("converted_volume") or {}).get("usd"))

                if price <= 0:
                    continue

                volume_btc = volume_usd / price if volume_usd > 0 else 0

                rows.append({
                    "price_usd": price,
                    "volume_24h_btc": volume_btc,
                    "volume_24h_usd": volume_usd
                })

            weighted = [
                row for row in rows
                if row["volume_24h_btc"] > 0
            ]

            if weighted:
                total_volume = sum(
                    row["volume_24h_btc"]
                    for row in weighted
                )

                weighted_price = sum(
                    row["price_usd"] * row["volume_24h_btc"]
                    for row in weighted
                ) / total_volume

                return {
                    "price_usd": weighted_price,
                    "volume_24h_btc": total_volume,
                    "volume_24h_usd": sum(
                        row["volume_24h_usd"]
                        for row in weighted
                    ),
                    "high_24h": max(row["price_usd"] for row in weighted),
                    "low_24h": min(row["price_usd"] for row in weighted)
                }

        except Exception:
            continue

    return None


def fetch_source(exchange_key, source, cfg):
    try:
        parsed = parse(source["parser"], fetch_json(source["url"]))

        if parsed.get("price_usd", 0) <= 0:
            raise RuntimeError("bad direct price")

        return parsed, "direct"

    except Exception as direct_error:
        if source.get("fallback") == "coingecko_exchange":
            fallback = fetch_coingecko_exchange_fallback(exchange_key, cfg)

            if fallback and fallback.get("price_usd", 0) > 0:
                return fallback, "coingecko_exchange_fallback"

        raise direct_error


def build_once():
    cfg = read_json(EXCHANGES, {})
    sources = cfg.get("sources", {})
    supply = mined_supply_btc()
    updated_at = now_iso()

    rows = {}
    valid_rows = []

    for exchange_key in cfg.get("order", list(sources.keys())):
        if exchange_key == "zzx":
            continue

        source = sources.get(exchange_key)
        if not source or source.get("kind") == "computed":
            continue

        try:
            parsed, mode = fetch_source(exchange_key, source, cfg)

            price = n(parsed.get("price_usd"))
            volume_btc = n(parsed.get("volume_24h_btc"))
            volume_usd = n(parsed.get("volume_24h_usd")) or (
                price * volume_btc
                if price and volume_btc else 0
            )

            high = n(parsed.get("high_24h")) or price
            low = n(parsed.get("low_24h")) or price

            if price <= 0:
                continue

            row = {
                "label": source.get("label", exchange_key),
                "source": exchange_key,
                "mode": mode,
                "pair": source.get("pair", "BTC-USD"),
                "price_usd": price,
                "volume_24h_btc": volume_btc,
                "volume_24h_usd": volume_usd,
                "high_24h": high,
                "low_24h": low,
                "supply_ratio": (
                    volume_btc / supply
                    if supply > 0 else 0
                ),
                "updated_at": updated_at
            }

            rows[exchange_key] = row
            valid_rows.append(row)

        except Exception as e:
            rows[exchange_key] = {
                "label": source.get("label", exchange_key),
                "source": exchange_key,
                "error": str(e),
                "updated_at": updated_at
            }

    weighted_rows = [
        row for row in valid_rows
        if row["price_usd"] > 0 and row["volume_24h_btc"] > 0
    ]

    total_supply_ratio = sum(
        row["supply_ratio"]
        for row in weighted_rows
    )

    if weighted_rows and total_supply_ratio > 0:
        for row in weighted_rows:
            row["weight"] = row["supply_ratio"] / total_supply_ratio

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

    elif valid_rows:
        weight = 1 / len(valid_rows)

        for row in valid_rows:
            row["weight"] = weight

        price = sum(
            row["price_usd"] * row["weight"]
            for row in valid_rows
        )

        high = max(row["high_24h"] for row in valid_rows)
        low = min(row["low_24h"] for row in valid_rows)

    else:
        price = 0
        high = 0
        low = 0

    total_volume_btc = sum(
        row.get("volume_24h_btc", 0)
        for row in valid_rows
    )

    total_volume_usd = sum(
        row.get("volume_24h_usd", 0)
        for row in valid_rows
    )

    latest = {
        "source": "zzx-global-bpi",
        "mode": "generated",
        "base": "USD",
        "updated_at": updated_at,
        "mined_supply_btc": supply,
        "price_usd": price,
        "btc_usd": price,
        "vwap_usd": price,
        "bpi_usd": price,
        "volume_24h_btc": total_volume_btc,
        "volume_24h_usd": total_volume_usd,
        "high_24h": high,
        "low_24h": low,
        "exchange_count": len(valid_rows),
        "weighted_average": {
            "method": "supply_ratio_normalized_24h_exchange_volume_weighted_average",
            "sources": len(weighted_rows),
            "price_usd": price,
            "vwap_usd": price,
            "formula": (
                "weight_i=(volume_24h_btc_i/mined_supply_btc)"
                "/sum(volume_24h_btc/mined_supply_btc);"
                " bpi=sum(price_i*weight_i)"
            ),
            "coingecko_policy": (
                "CoinGecko is allowed only as per-exchange fallback; "
                "no global aggregate source is counted."
            )
        },
        "global_bpi": {
            "price_usd": price,
            "vwap_usd": price
        },
        "exchanges": rows
    }

    previous = read_json(LATEST, {})
    write_json(LATEST, latest)

    if previous.get("price_usd") != latest.get("price_usd"):
        changes = read_json(CHANGES, [])
        if not isinstance(changes, list):
            changes = []

        changes.append({
            "updated_at": updated_at,
            "old_price_usd": previous.get("price_usd"),
            "new_price_usd": latest.get("price_usd")
        })

        write_json(CHANGES, changes[-2000:])

    history = read_json(HISTORY, [])
    if not isinstance(history, list):
        history = []

    history.append({
        "updated_at": updated_at,
        "price_usd": price,
        "volume_24h_btc": total_volume_btc,
        "exchange_count": len(valid_rows)
    })

    write_json(HISTORY, history[-10000:])

    print(
        f"BPI updated ${price:,.2f}; "
        f"exchanges={len(valid_rows)}; "
        f"weighted={len(weighted_rows)}; "
        f"mined_supply={supply:,.8f} BTC"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args()

    if args.loop:
        while True:
            try:
                build_once()
            except Exception as e:
                print("ERROR:", e)

            time.sleep(args.interval)
    else:
        build_once()


if __name__ == "__main__":
    main()
