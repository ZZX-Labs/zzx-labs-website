#!/usr/bin/env python3
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

UA = "ZZX-Labs-TheMarketBTCCreated/3.0 (+https://zzx-labs.io/)"
TOTAL_SUPPLY_BTC = 21_000_000.0
HALVING_INTERVAL = 210_000
GENESIS_REWARD = 50.0
TARGET_BLOCK_SECONDS = 600


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_json(url, retries=4, timeout=25):
    last = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            TimeoutError,
            json.JSONDecodeError,
        ) as exc:
            last = exc
            if attempt < retries:
                time.sleep(min(12, 2 ** attempt))
    raise RuntimeError(f"JSON fetch failed: {url}: {last}")


def fetch_text(url, retries=4, timeout=25):
    last = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Accept": "text/plain,*/*;q=0.5"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read().decode("utf-8").strip()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            last = exc
            if attempt < retries:
                time.sleep(min(12, 2 ** attempt))
    raise RuntimeError(f"text fetch failed: {url}: {last}")


def positive(value, label):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise RuntimeError(f"{label} must be positive and finite")
    return number


def nonnegative(value, label):
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise RuntimeError(f"{label} must be non-negative and finite")
    return number


def atomic_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(
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
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def load_market():
    global_data = fetch_json("https://api.coingecko.com/api/v3/global")
    btc_data = fetch_json(
        "https://api.coingecko.com/api/v3/coins/bitcoin"
        "?localization=false&tickers=false&market_data=true"
        "&community_data=false&developer_data=false&sparkline=false"
    )

    market = btc_data["market_data"]

    return (
        positive(
            global_data["data"]["total_market_cap"]["usd"],
            "global crypto market cap",
        ),
        positive(market["market_cap"]["usd"], "BTC market cap"),
        positive(market["current_price"]["usd"], "BTC spot price"),
        positive(market["circulating_supply"], "BTC circulating supply"),
    )


def network_snapshot(height, btc_supply):
    epoch = height // HALVING_INTERVAL
    reward = GENESIS_REWARD / (2 ** epoch)
    next_reward = reward / 2.0
    next_height = (epoch + 1) * HALVING_INTERVAL
    blocks_remaining = max(0, next_height - height)
    countdown = blocks_remaining * TARGET_BLOCK_SECONDS
    estimated_halving = datetime.fromtimestamp(
        datetime.now(timezone.utc).timestamp() + countdown,
        tz=timezone.utc,
    )

    remaining = max(0.0, TOTAL_SUPPLY_BTC - btc_supply)
    annual_blocks = (
        365.2425 * 24 * 60 * 60
    ) / TARGET_BLOCK_SECONDS

    return {
        "block_height": height,
        "btc_total_supply_limit": TOTAL_SUPPLY_BTC,
        "btc_remaining_to_mine": remaining,
        "btc_remaining_to_mine_percent": (
            remaining / TOTAL_SUPPLY_BTC
        ) * 100.0,
        "estimated_btc_mined_this_year": annual_blocks * reward,
        "current_block_reward_btc": reward,
        "next_block_reward_btc": next_reward,
        "next_halving_height": next_height,
        "blocks_remaining_until_halving": blocks_remaining,
        "estimated_halving_at": (
            estimated_halving.isoformat().replace("+00:00", "Z")
        ),
        "halving_countdown_seconds": countdown,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--deadopop", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--global-market-cap-usd", type=float)
    parser.add_argument("--btc-market-cap-usd", type=float)
    parser.add_argument("--btc-price-usd", type=float)
    parser.add_argument("--btc-circulating-supply", type=float)
    parser.add_argument("--block-height", type=int)
    args = parser.parse_args()

    dead = json.loads(args.deadopop.read_text(encoding="utf-8"))

    if dead.get("source") != "zzx_deadcoins_archival_registry":
        raise SystemExit("refusing non-archival DeadOPop input")

    dead_loss = nonnegative(
        dead.get("combined_estimated_value_lost_usd", 0),
        "DeadOPop cumulative loss",
    )

    supplied = (
        args.global_market_cap_usd,
        args.btc_market_cap_usd,
        args.btc_price_usd,
        args.btc_circulating_supply,
    )

    if all(v is not None for v in supplied):
        global_cap = positive(args.global_market_cap_usd, "global market cap")
        btc_cap = positive(args.btc_market_cap_usd, "BTC market cap")
        spot = positive(args.btc_price_usd, "BTC spot price")
        supply = positive(args.btc_circulating_supply, "BTC circulating supply")
        market_source = "explicit_inputs"
    elif any(v is not None for v in supplied):
        raise SystemExit("provide all four explicit market inputs or none")
    else:
        global_cap, btc_cap, spot, supply = load_market()
        market_source = "coingecko"

    if args.block_height is None:
        height = int(fetch_text("https://blockchain.info/q/getblockcount"))
        block_source = "blockchain.info"
    else:
        height = int(args.block_height)
        block_source = "explicit_input"

    if height < 0:
        raise SystemExit("block height cannot be negative")

    non_btc_cap = max(0.0, global_cap - btc_cap)
    theoretical = global_cap / supply
    adjusted = (global_cap + dead_loss) / supply

    baseline_delta = theoretical - spot
    baseline_delta_pct = (baseline_delta / spot) * 100.0
    total_delta = adjusted - spot
    total_delta_pct = (total_delta / spot) * 100.0

    capture = (btc_cap / (global_cap + dead_loss)) * 100.0
    inverse_capture = 100.0 - capture

    output = {
        "updated_at": now_iso(),
        "source": "zzx_themarketbtccreated_deadopop_v3",
        "market_data_source": market_source,
        "block_data_source": block_source,
        "inputs": {
            "current_global_crypto_market_cap_usd": round(global_cap, 2),
            "current_bitcoin_market_cap_usd": round(btc_cap, 2),
            "current_non_bitcoin_market_cap_usd": round(non_btc_cap, 2),
            "spot_btc_price_usd": round(spot, 2),
            "btc_circulating_supply": supply,
            "deadopop_cumulative_estimated_value_lost_usd": round(dead_loss, 2),
            "deadopop_total_dead_coins": int(dead.get("total_dead_coins", 0)),
            "deadopop_valued_dead_coins": int(dead.get("valued_dead_coins", 0)),
            "deadopop_unvalued_dead_coins": int(dead.get("unvalued_dead_coins", 0)),
            "deadopop_valuation_coverage_percent": float(
                dead.get("valuation_coverage_percent", 0)
            ),
        },
        "outputs": {
            "the_market_btc_created_price_usd": round(theoretical, 2),
            "active_non_bitcoin_absorption_per_btc_usd": round(non_btc_cap / supply, 2),
            "deadopop_absorption_per_btc_usd": round(dead_loss / supply, 2),
            "deadopop_adjusted_appraised_btc_price_usd": round(adjusted, 2),
            "baseline_delta_usd": round(baseline_delta, 2),
            "baseline_delta_percent": round(baseline_delta_pct, 8),
            "inverse_baseline_delta_percent": round(-baseline_delta_pct, 8),
            "total_delta_usd": round(total_delta, 2),
            "total_delta_percent": round(total_delta_pct, 8),
            "inverse_total_delta_percent": round(-total_delta_pct, 8),
            "btc_capture_percent_of_created_market_plus_deadopop": round(capture, 8),
            "inverse_unabsorbed_percent": round(inverse_capture, 8),
            "appraisal_multiple_over_spot": round(adjusted / spot, 8),
        },
        "network": network_snapshot(height, supply),
        "model": {
            "name": "TheMarketBTCCreated + DeadOPop",
            "baseline_formula": (
                "current_global_crypto_market_cap_usd / "
                "btc_circulating_supply"
            ),
            "deadopop_adjusted_formula": (
                "(current_global_crypto_market_cap_usd + "
                "deadopop_cumulative_estimated_value_lost_usd) / "
                "btc_circulating_supply"
            ),
            "warning": (
                "Appraisal/accounting model, not a prediction of spot price."
            ),
        },
    }

    atomic_json(args.output, output)

    print(
        "TheMarketBTCCreated updated:",
        f"height={height}",
        f"deadopop={dead_loss:.2f}",
        f"appraised_btc={adjusted:.2f}",
    )


if __name__ == "__main__":
    main()
