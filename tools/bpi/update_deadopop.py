#!/usr/bin/env python3
"""
Build the public DeadOPop API from the canonical archival registry.

All valid failed/dead entries count toward total_dead_coins even when their
loss is still unquantified. Only defensible positive loss estimates are summed.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ALLOWED_STATUSES = {
    "bankrupt",
    "insolvent",
    "scam",
    "rug_pull",
    "fraud",
    "collapsed",
    "abandoned",
    "shutdown",
    "dead",
    "delisted_dead",
    "protocol_failure",
    "exchange_failure",
    "zeroed_out",
}


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def finite(value):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) else None


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--top", type=int, default=100)
    args = parser.parse_args()

    data = json.loads(args.registry.read_text(encoding="utf-8"))
    entries = data.get("entries") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        raise SystemExit("registry must contain an entries array")

    valid = []
    ids = set()

    for raw in entries:
        if not isinstance(raw, dict):
            continue

        coin_id = str(raw.get("id") or "").strip()
        symbol = str(raw.get("symbol") or "").strip()
        name = str(raw.get("name") or "").strip()
        status = str(raw.get("status") or "").strip().lower()

        if (
            not coin_id
            or not name
            or status not in ALLOWED_STATUSES
            or coin_id.lower() == "bitcoin"
            or symbol.lower() == "btc"
        ):
            continue

        key = coin_id.lower()
        if key in ids:
            raise SystemExit(f"duplicate dead-coin id: {coin_id}")
        ids.add(key)

        loss = finite(raw.get("estimated_value_lost_usd"))
        if loss is not None and loss <= 0:
            loss = None

        peak = finite(raw.get("peak_market_cap_usd"))
        if peak is not None and peak <= 0:
            peak = None

        terminal = finite(raw.get("terminal_market_cap_usd"))
        if terminal is not None and terminal < 0:
            terminal = None

        item = dict(raw)
        item["status"] = status
        item["estimated_value_lost_usd"] = loss
        item["peak_market_cap_usd"] = peak
        item["terminal_market_cap_usd"] = terminal
        valid.append(item)

    if not valid:
        raise SystemExit("registry contains no valid dead/failed entries")

    valued = [
        item
        for item in valid
        if item["estimated_value_lost_usd"] is not None
    ]
    unvalued = [
        item
        for item in valid
        if item["estimated_value_lost_usd"] is None
    ]

    valued.sort(
        key=lambda item: item["estimated_value_lost_usd"],
        reverse=True,
    )

    total_lost = sum(
        item["estimated_value_lost_usd"]
        for item in valued
    )
    total_peak = sum(
        item["peak_market_cap_usd"]
        for item in valid
        if item["peak_market_cap_usd"] is not None
    )
    total_terminal = sum(
        item["terminal_market_cap_usd"]
        for item in valid
        if item["terminal_market_cap_usd"] is not None
    )

    status_counts = Counter(
        item["status"]
        for item in valid
    )
    loss_methods = Counter(
        str(item.get("loss_method") or "unknown")
        for item in valid
    )

    top = []
    for rank, item in enumerate(valued[: max(1, args.top)], start=1):
        row = dict(item)
        row["rank"] = rank
        top.append(row)

    output = {
        "updated_at": now_iso(),
        "registry_updated_at": str(data.get("updated_at") or ""),
        "source": "zzx_deadcoins_archival_registry",
        "scope": "failed_dead_bankrupt_scam_collapsed_cryptoassets",
        "available": True,
        "bitcoin_excluded": True,
        "total_dead_coins": len(valid),
        "valued_dead_coins": len(valued),
        "unvalued_dead_coins": len(unvalued),
        "valuation_coverage_percent": round(
            (len(valued) / len(valid)) * 100,
            4,
        ),
        "combined_estimated_value_lost_usd": round(total_lost, 2),
        "combined_peak_market_cap_usd": round(total_peak, 2),
        "combined_terminal_market_cap_usd": round(total_terminal, 2),
        "status_counts": dict(sorted(status_counts.items())),
        "loss_method_counts": dict(sorted(loss_methods.items())),
        "top_dead_coins": top,
        "unvalued_dead_coin_ids": [
            item["id"]
            for item in unvalued[:500]
        ],
        "methodology": {
            "primary_metric": "combined_estimated_value_lost_usd",
            "count_policy": (
                "Every validated failed/dead entry counts toward total_dead_coins "
                "even when the loss is still pending quantification."
            ),
            "valuation_policy": (
                "Only positive defensible estimated_value_lost_usd values are summed."
            ),
            "double_counting_policy": (
                "Do not add multiple overlapping loss measurements for the same "
                "economic failure. Keep victim loss, creditor shortfall, exploit loss, "
                "and market-cap destruction distinct via loss_method."
            ),
        },
    }

    atomic_json(args.output, output)

    print(
        "DeadOPop API updated:",
        f"dead={len(valid)}",
        f"valued={len(valued)}",
        f"unvalued={len(unvalued)}",
        f"lost_usd={total_lost:.2f}",
    )


if __name__ == "__main__":
    main()
