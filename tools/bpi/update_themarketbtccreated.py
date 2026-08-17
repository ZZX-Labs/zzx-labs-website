#!/usr/bin/env python3
"""
TheMarketBTCCreated + DeadOPop appraisal.

Core model:
  TheMarketBTCCreated price
    = current global crypto market cap / circulating BTC

  DeadOPop-adjusted appraised BTC price
    = (current global crypto market cap
       + cumulative DeadOPop estimated destroyed/lost value)
      / circulating BTC

Equivalent decomposition:
  spot BTC market cap
  + current non-BTC ("shitcoin") market cap
  + historical DeadOPop loss
  ------------------------------------------------
                    circulating BTC

This is an appraisal/model output, not a prediction of exchange spot price.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = "ZZX-Labs-TheMarketBTCCreated/2.0 (+https://zzx-labs.io/)"


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_json(url: str, retries: int = 4, timeout: int = 25):
    last = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": UA,
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            if attempt < retries:
                time.sleep(min(12, 2 ** attempt))
    raise RuntimeError(f"market data fetch failed: {url}: {last}")


def finite_positive(value, label):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        raise RuntimeError(f"{label} is not numeric")
    if not math.isfinite(number) or number <= 0:
        raise RuntimeError(f"{label} must be positive and finite")
    return number


def atomic_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".",
        suffix=".tmp",
        dir=str(path.parent),
        text=True,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def load_market_data():
    global_data = fetch_json("https://api.coingecko.com/api/v3/global")
    bitcoin_data = fetch_json(
        "https://api.coingecko.com/api/v3/coins/bitcoin"
        "?localization=false&tickers=false&market_data=true"
        "&community_data=false&developer_data=false&sparkline=false"
    )

    global_cap = finite_positive(
        global_data["data"]["total_market_cap"]["usd"],
        "global crypto market cap",
    )
    market_data = bitcoin_data["market_data"]
    btc_price = finite_positive(
        market_data["current_price"]["usd"],
        "BTC spot price",
    )
    btc_cap = finite_positive(
        market_data["market_cap"]["usd"],
        "BTC market cap",
    )
    btc_supply = finite_positive(
        market_data["circulating_supply"],
        "BTC circulating supply",
    )

    return global_cap, btc_cap, btc_price, btc_supply


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--deadopop", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--global-market-cap-usd", type=float)
    parser.add_argument("--btc-market-cap-usd", type=float)
    parser.add_argument("--btc-price-usd", type=float)
    parser.add_argument("--btc-circulating-supply", type=float)
    args = parser.parse_args()

    deadopop = json.loads(args.deadopop.read_text(encoding="utf-8"))

    if deadopop.get("source") != "zzx_deadcoins_archival_registry":
        raise SystemExit("refusing non-archival DeadOPop input")

    dead_loss = finite_positive(
        deadopop.get("combined_estimated_value_lost_usd"),
        "DeadOPop cumulative loss",
    )

    supplied = (
        args.global_market_cap_usd,
        args.btc_market_cap_usd,
        args.btc_price_usd,
        args.btc_circulating_supply,
    )

    if all(value is not None for value in supplied):
        global_cap = finite_positive(args.global_market_cap_usd, "global market cap")
        btc_cap = finite_positive(args.btc_market_cap_usd, "BTC market cap")
        btc_price = finite_positive(args.btc_price_usd, "BTC price")
        btc_supply = finite_positive(args.btc_circulating_supply, "BTC circulating supply")
        market_source = "explicit_inputs"
    elif any(value is not None for value in supplied):
        raise SystemExit(
            "either provide all four explicit market inputs or none"
        )
    else:
        global_cap, btc_cap, btc_price, btc_supply = load_market_data()
        market_source = "coingecko"

    non_btc_cap = max(0.0, global_cap - btc_cap)

    market_created_price = global_cap / btc_supply
    deadopop_per_btc = dead_loss / btc_supply
    active_non_btc_per_btc = non_btc_cap / btc_supply

    market_plus_dead = global_cap + dead_loss
    appraised_price = market_plus_dead / btc_supply

    capture_percent = min(
        100.0,
        max(0.0, (btc_cap / market_plus_dead) * 100.0),
    )
    inverse_capture_percent = 100.0 - capture_percent

    spot_to_appraised_percent = min(
        100.0,
        max(0.0, (btc_price / appraised_price) * 100.0),
    )
    inverse_spot_to_appraised_percent = 100.0 - spot_to_appraised_percent

    output = {
        "updated_at": now_iso(),
        "source": "zzx_themarketbtccreated_deadopop_v2",
        "market_data_source": market_source,
        "model": {
            "name": "TheMarketBTCCreated + DeadOPop",
            "the_market_btc_created_formula": (
                "current_global_crypto_market_cap_usd / btc_circulating_supply"
            ),
            "deadopop_adjusted_formula": (
                "(current_global_crypto_market_cap_usd + "
                "deadopop_cumulative_estimated_value_lost_usd) / "
                "btc_circulating_supply"
            ),
            "decomposition": (
                "BTC market cap + current non-BTC market cap + historical "
                "DeadOPop loss, all divided by circulating BTC."
            ),
            "warning": (
                "This is an appraisal/accounting model, not an intrinsic-value "
                "proof or a prediction that market participants will actually "
                "transfer this capital into Bitcoin."
            ),
        },
        "inputs": {
            "current_global_crypto_market_cap_usd": round(global_cap, 2),
            "current_bitcoin_market_cap_usd": round(btc_cap, 2),
            "current_non_bitcoin_market_cap_usd": round(non_btc_cap, 2),
            "spot_btc_price_usd": round(btc_price, 2),
            "btc_circulating_supply": btc_supply,
            "deadopop_cumulative_estimated_value_lost_usd": round(dead_loss, 2),
            "deadopop_total_dead_coins": int(deadopop.get("total_dead_coins", 0)),
            "deadopop_valued_dead_coins": int(deadopop.get("valued_dead_coins", 0)),
            "deadopop_unvalued_dead_coins": int(deadopop.get("unvalued_dead_coins", 0)),
        },
        "outputs": {
            "the_market_btc_created_price_usd": round(market_created_price, 2),
            "active_non_bitcoin_absorption_per_btc_usd": round(active_non_btc_per_btc, 2),
            "deadopop_absorption_per_btc_usd": round(deadopop_per_btc, 2),
            "deadopop_adjusted_appraised_btc_price_usd": round(appraised_price, 2),
            "appraisal_premium_over_spot_usd": round(appraised_price - btc_price, 2),
            "appraisal_multiple_over_spot": round(appraised_price / btc_price, 8),
            "btc_capture_percent_of_created_market_plus_deadopop": round(capture_percent, 8),
            "inverse_unabsorbed_percent": round(inverse_capture_percent, 8),
            "spot_to_appraised_percent": round(spot_to_appraised_percent, 8),
            "inverse_spot_to_appraised_percent": round(inverse_spot_to_appraised_percent, 8),
        },
    }

    atomic_json(args.output, output)

    print(
        "TheMarketBTCCreated appraisal updated:",
        f"global_cap={global_cap:.2f}",
        f"deadopop={dead_loss:.2f}",
        f"supply={btc_supply:.8f}",
        f"appraised_btc={appraised_price:.2f}",
    )


if __name__ == "__main__":
    main()
