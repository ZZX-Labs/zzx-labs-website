#!/usr/bin/env python3
import argparse
import json
import math
import os
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "bitcoin" / "bpi" / "api" / "deadopop.json"

INTERVAL_SECONDS = 3600
PER_PAGE = 250
HTTP_ATTEMPTS = 4
TOP_ASSET_LIMIT = 50
COINGECKO_REQUEST_GAP_SECONDS = 4.0


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, indent=2, ensure_ascii=False) + "\n"

    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".",
        suffix=".tmp",
        dir=str(path.parent),
        text=True,
    )

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())

        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def finite_number(value, default=None):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return default

    if not math.isfinite(number):
        return default

    return number


def nonnegative_number(value, default=0.0):
    number = finite_number(value)

    if number is None or number < 0:
        return default

    return number


def fetch_json(url, timeout=30, attempts=HTTP_ATTEMPTS):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ZZX-Labs-DeadOPop/2.1",
            "Accept": "application/json"
        }
    )

    last_error = None

    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))

        except urllib.error.HTTPError as exc:
            last_error = exc

            if exc.code not in {408, 425, 429, 500, 502, 503, 504}:
                raise

            retry_after = exc.headers.get("Retry-After")
            try:
                delay = min(max(float(retry_after), 1.0), 60.0)
            except (TypeError, ValueError):
                delay = min(2.0 ** attempt, 20.0)

        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            delay = min(2.0 ** attempt, 20.0)

        if attempt < attempts:
            print(
                f"CoinGecko request attempt {attempt}/{attempts} failed; "
                f"retrying in {delay:g}s:",
                last_error
            )
            time.sleep(delay)

    raise RuntimeError(
        f"CoinGecko request failed after {attempts} attempts: {last_error}"
    )


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


def coingecko_global():
    return fetch_json(
        "https://api.coingecko.com/api/v3/global"
    )


def normalized_top_asset(coin, market_cap, volume_24h):
    price = nonnegative_number(coin.get("current_price"))
    change = finite_number(coin.get("price_change_percentage_24h"))

    return {
        "rank": coin.get("market_cap_rank"),
        "id": coin.get("id"),
        "symbol": coin.get("symbol"),
        "name": coin.get("name"),
        "market_cap_usd": market_cap,
        "volume_24h_usd": volume_24h,
        "price_usd": price,
        "price_change_24h_percent": change
    }


def validate_output(out):
    count = int(out.get("non_bitcoin_assets_count") or 0)
    pages = int(out.get("pages_scanned") or 0)
    market_cap = finite_number(
        out.get("alive_non_bitcoin_market_cap_usd")
    )
    total_cap = finite_number(
        out.get("total_non_bitcoin_market_cap_usd")
    )
    volume = finite_number(
        out.get("alive_non_bitcoin_volume_24h_usd")
    )
    top_assets = out.get("top_non_bitcoin_assets")

    if pages < 1:
        raise RuntimeError(
            "refusing to overwrite DeadOPop output with zero scanned pages"
        )

    if count < 1:
        raise RuntimeError(
            "refusing to overwrite DeadOPop output with zero assets"
        )

    if market_cap is None or market_cap <= 0:
        raise RuntimeError(
            "refusing to overwrite DeadOPop output with invalid market cap"
        )

    if total_cap is None or total_cap <= 0:
        raise RuntimeError(
            "refusing to overwrite DeadOPop output with invalid total market cap"
        )

    if volume is None or volume < 0:
        raise RuntimeError(
            "refusing to overwrite DeadOPop output with invalid volume"
        )

    if not isinstance(top_assets, list) or not top_assets:
        raise RuntimeError(
            "refusing to overwrite DeadOPop output with empty top-assets list"
        )

    if out.get("bitcoin_excluded") is not True:
        raise RuntimeError(
            "refusing DeadOPop output that does not explicitly exclude Bitcoin"
        )


def build_once():
    # One global request gives the aggregate market size and active-asset
    # count. One markets request gives Bitcoin's own market/volume values and
    # enough ranked assets to build the top-50 non-Bitcoin list. This replaces
    # the old 10-page crawl and greatly reduces CoinGecko rate-limit pressure.
    try:
        global_payload = coingecko_global()
    except Exception as exc:
        raise RuntimeError(
            "CoinGecko global endpoint failed; refusing DeadOPop publish"
        ) from exc

    global_data = (
        global_payload.get("data")
        if isinstance(global_payload, dict)
        else None
    )

    if not isinstance(global_data, dict):
        raise RuntimeError(
            "CoinGecko global endpoint returned an invalid payload"
        )

    total_market_caps = global_data.get("total_market_cap")
    total_volumes = global_data.get("total_volume")

    if not isinstance(total_market_caps, dict):
        raise RuntimeError(
            "CoinGecko global payload has no total_market_cap object"
        )

    if not isinstance(total_volumes, dict):
        raise RuntimeError(
            "CoinGecko global payload has no total_volume object"
        )

    total_market_cap = finite_number(total_market_caps.get("usd"))
    total_volume_24h = nonnegative_number(total_volumes.get("usd"))
    active_cryptoassets = int(global_data.get("active_cryptocurrencies") or 0)

    if total_market_cap is None or total_market_cap <= 0:
        raise RuntimeError(
            "CoinGecko global payload has invalid USD market cap"
        )

    if active_cryptoassets < 2:
        raise RuntimeError(
            "CoinGecko global payload has invalid active cryptocurrency count"
        )

    # Give the free endpoint breathing room between the only two requests.
    time.sleep(COINGECKO_REQUEST_GAP_SECONDS)

    try:
        markets = coingecko_markets_page(1)
    except Exception as exc:
        raise RuntimeError(
            "CoinGecko markets page failed; refusing DeadOPop publish"
        ) from exc

    if not isinstance(markets, list) or not markets:
        raise RuntimeError(
            "CoinGecko markets page returned an empty or invalid payload"
        )

    bitcoin_market_cap = None
    bitcoin_volume_24h = 0.0
    top_assets = []
    seen_ids = set()

    for coin in markets:
        if not isinstance(coin, dict):
            continue

        coin_id = str(coin.get("id") or "").strip().lower()
        symbol = str(coin.get("symbol") or "").strip().lower()

        if not coin_id:
            continue

        market_cap = finite_number(coin.get("market_cap"))
        volume_24h = nonnegative_number(coin.get("total_volume"))

        if coin_id == "bitcoin" or symbol == "btc":
            if market_cap is not None and market_cap > 0:
                bitcoin_market_cap = market_cap
                bitcoin_volume_24h = volume_24h
            continue

        if coin_id in seen_ids:
            continue

        if market_cap is None or market_cap <= 0:
            continue

        seen_ids.add(coin_id)

        if len(top_assets) < TOP_ASSET_LIMIT:
            top_assets.append(
                normalized_top_asset(
                    coin,
                    market_cap,
                    volume_24h
                )
            )

    if bitcoin_market_cap is None or bitcoin_market_cap <= 0:
        # Fallback to CoinGecko's global BTC market-cap percentage only if the
        # first markets page unexpectedly omitted Bitcoin.
        percentages = global_data.get("market_cap_percentage")
        btc_percentage = None

        if isinstance(percentages, dict):
            btc_percentage = finite_number(percentages.get("btc"))

        if btc_percentage is None or not (0 < btc_percentage < 100):
            raise RuntimeError(
                "unable to determine Bitcoin market cap for exclusion"
            )

        bitcoin_market_cap = total_market_cap * (btc_percentage / 100.0)

    alive_market_cap = total_market_cap - bitcoin_market_cap

    if alive_market_cap <= 0:
        raise RuntimeError(
            "computed non-Bitcoin market cap is not positive"
        )

    alive_volume_24h = max(
        0.0,
        total_volume_24h - bitcoin_volume_24h
    )

    # CoinGecko's active_cryptocurrencies is the closest aggregate count for
    # the scope of this file. Subtract one for Bitcoin itself.
    asset_count = max(0, active_cryptoassets - 1)

    out = {
        "updated_at": now_iso(),
        "source": "coingecko_global_and_current_markets",
        "scope": "non_bitcoin_cryptoassets_currently_listed",
        "pages_scanned": 1,
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
            "Aggregate market cap is derived from CoinGecko global market data with "
            "Bitcoin market cap excluded; ranked asset detail comes from the current "
            "markets endpoint. Dead/inactive historical market cap requires a separate "
            "archival dataset."
        )
    }

    validate_output(out)
    write_json(OUT, out)

    print(
        "deadopop updated:",
        asset_count,
        "assets;",
        "pages_scanned=1;",
        "coingecko_requests=2;",
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
