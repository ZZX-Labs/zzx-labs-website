#!/usr/bin/env python3
"""
Validate and normalize Hashrate By Nation evidence JSON.

This tool does not scrape or invent values. It turns curated source JSON into
the exact browser-side contract used by the widget.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any


def finite(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def iso(value: Any) -> str:
    text = str(value or "").strip().upper()
    return text if len(text) == 2 and text.isalpha() else ""


def clamp(value: Any, low: float = 0.0, high: float = 1.0) -> float:
    number = finite(value)
    if number is None:
        return low
    return max(low, min(high, number))


def validate_pool_evidence(doc: dict[str, Any]) -> dict[str, Any]:
    pools = doc.get("pools") or {}
    if isinstance(pools, list):
        iterable = ((str(row.get("name") or ""), row) for row in pools if isinstance(row, dict))
    elif isinstance(pools, dict):
        iterable = pools.items()
    else:
        raise ValueError("pools must be an object or array")

    out: dict[str, Any] = {}

    for name, row in iterable:
        name = str(name).strip()
        if not name:
            continue

        allocations = []
        fraction_sum = 0.0

        for allocation in row.get("allocations") or []:
            if not isinstance(allocation, dict):
                continue

            country = iso(
                allocation.get("country")
                or allocation.get("country_code")
                or allocation.get("iso")
            )
            fraction = clamp(allocation.get("fraction", allocation.get("share")))
            confidence = clamp(allocation.get("confidence", 0.5))

            if not country or fraction <= 0 or confidence <= 0:
                continue

            fraction_sum += fraction
            allocations.append(
                {
                    "country": country,
                    "fraction": fraction,
                    "confidence": confidence,
                    "source": str(allocation.get("source") or "").strip(),
                    "updated_at": allocation.get("updated_at"),
                }
            )

        if fraction_sum > 1.000001:
            raise ValueError(f"{name}: allocation fractions exceed 1.0")

        out[name] = {
            "allocations": allocations,
            "note": str(row.get("note") or "").strip(),
        }

    return {
        "schema": "zzx-hashrate-pool-country-evidence-v1",
        "updated_at": doc.get("updated_at"),
        "method": "miner/worker geography only; operator HQ alone is not accepted",
        "pools": out,
    }


MINING_POWER_FIELDS = (
    "bitcoinMiningPowerMW",
    "bitcoin_mining_power_mw",
    "miningPowerMW",
    "mining_power_mw",
    "knownMiningPowerMW",
    "known_mining_power_mw",
    "estimatedBitcoinLoadMW",
    "estimated_bitcoin_load_mw",
)


def validate_grid(doc: dict[str, Any]) -> dict[str, Any]:
    rows = doc.get("countries") or doc.get("rows") or []
    if not isinstance(rows, list):
        raise ValueError("countries/rows must be an array")

    out = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        country = iso(row.get("country") or row.get("country_code") or row.get("iso"))
        if not country:
            continue

        mining_mw = None
        field_used = None

        for field in MINING_POWER_FIELDS:
            value = finite(row.get(field))
            if value is not None and value > 0:
                mining_mw = value
                field_used = field
                break

        normalized = {
            "country": country,
            "countryName": str(row.get("countryName") or row.get("country_name") or "").strip(),
            "confidence": clamp(row.get("confidence", row.get("quality", 0.65))),
            "source": str(row.get("source") or "").strip(),
            "updated_at": row.get("updated_at"),
        }

        if mining_mw is not None:
            normalized["miningPowerMW"] = mining_mw
            normalized["source_field"] = field_used

        # Preserve general grid context without treating it as mining evidence.
        for field in (
            "gridGenerationMW",
            "gridLoadMW",
            "surplusPowerMW",
            "industrialPriceUsdMWh",
        ):
            value = finite(row.get(field))
            if value is not None:
                normalized[field] = value

        out.append(normalized)

    efficiency = finite(doc.get("efficiency_j_per_th"))
    if efficiency is None or efficiency <= 0:
        efficiency = 30.0

    return {
        "schema": "zzx-hashrate-power-grid-24h-v1",
        "updated_at": doc.get("updated_at"),
        "efficiency_j_per_th": efficiency,
        "method": "only mining-specific MW enters estimator",
        "countries": out,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pool-evidence", type=Path)
    parser.add_argument("--grid", type=Path)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)

    if args.pool_evidence:
        doc = json.loads(args.pool_evidence.read_text(encoding="utf-8"))
        normalized = validate_pool_evidence(doc)
        (args.out_dir / "pool-country-evidence.json").write_text(
            json.dumps(normalized, indent=2) + "\n",
            encoding="utf-8",
        )

    if args.grid:
        doc = json.loads(args.grid.read_text(encoding="utf-8"))
        normalized = validate_grid(doc)
        (args.out_dir / "power-grid-24h.json").write_text(
            json.dumps(normalized, indent=2) + "\n",
            encoding="utf-8",
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
