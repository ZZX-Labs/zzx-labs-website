#!/usr/bin/env python3
import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "bitcoin" / "bpi" / "api" / "deadopop.json"

INTERVAL_SECONDS = 3600
PER_PAGE = 250
MAX_PAGES = 10


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8"
    )


def fetch_json(url, timeout=30):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ZZX-Labs-DeadOPop/2.0",
            "Accept": "application/json"
        }
    )

    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def coingecko_markets_page(page):
    params = urllib.parse.urlencode({
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": PER_PAGE,
        "page": page,
        "sparkline": "false",
        "price_change_percentage": "24h"
    })

    return fetch_json(
        "https://api.coingecko.com/api/v3/coins/markets?" + params
    )


def build_once():
    alive_market_cap = 0.0
    alive_volume_24h = 0.0
    asset_count = 0

    top_assets = []

    for page in range(1, MAX_PAGES + 1):
        try:
            data = coingecko_markets_page(page)
        except Exception as e:
            print("CoinGecko page failed:", page, e)
            break

        if not isinstance(data, list) or not data:
            break

        for coin in data:
            coin_id = str(coin.get("id", "")).lower()
            symbol = str(coin.get("symbol", "")).lower()

            if coin_id == "bitcoin" or symbol == "btc":
                continue

            market_cap = float(coin.get("market_cap") or 0)
            volume_24h = float(coin.get("total_volume") or 0)

            if market_cap <= 0:
                continue

            alive_market_cap += market_cap
            alive_volume_24h += volume_24h
            asset_count += 1

            if len(top_assets) < 50:
                top_assets.append({
                    "rank": coin.get("market_cap_rank"),
                    "id": coin.get("id"),
                    "symbol": coin.get("symbol"),
                    "name": coin.get("name"),
                    "market_cap_usd": market_cap,
                    "volume_24h_usd": volume_24h,
                    "price_usd": float(coin.get("current_price") or 0),
                    "price_change_24h_percent": coin.get("price_change_percentage_24h")
                })

        time.sleep(1.2)

    out = {
        "updated_at": now_iso(),
        "source": "coingecko_current_markets",
        "scope": "non_bitcoin_cryptoassets_currently_listed",
        "pages_scanned": MAX_PAGES,
        "per_page": PER_PAGE,
        "non_bitcoin_assets_count": asset_count,
        "alive_non_bitcoin_market_cap_usd": alive_market_cap,
        "alive_non_bitcoin_volume_24h_usd": alive_volume_24h,
        "dead_or_inactive_market_cap_usd": None,
        "total_non_bitcoin_market_cap_usd": alive_market_cap,
        "bitcoin_excluded": True,
        "top_non_bitcoin_assets": top_assets,
        "note": (
            "This file measures currently listed non-Bitcoin cryptoasset market cap. "
            "Dead/inactive historical market cap requires a separate archival dataset. "
            "CoinGecko free market data does not provide reliable historical dead-coin loss accounting."
        )
    }

    write_json(OUT, out)

    print(
        "deadopop updated:",
        asset_count,
        "assets;",
        "market_cap_usd=",
        round(alive_market_cap, 2)
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--interval", type=float, default=INTERVAL_SECONDS)
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
