#!/usr/bin/env python3
"""
Robust BPI market-consensus and volume sanity gates.

The objective is not to predict Bitcoin's price. It is to prevent a malformed,
mis-normalized, or obviously anomalous provider row from dominating a
volume-weighted index.

Stages:
  1. Price consensus from the unweighted median of valid BTC/fiat prices.
  2. Adaptive MAD price band, with conservative 7.5% minimum / 20% maximum.
  3. Volume anomaly gate based on the median positive BTC volume, with a
     100,000 BTC floor and 1,000,000 BTC hard ceiling per market per 24h.

Rows are never silently deleted. They are annotated with:
  index_eligible
  consensus_price_usd
  consensus_deviation_pct
  consensus_price_band_pct
  volume_sanity_limit_btc
  exclusion_reason
"""

from __future__ import annotations

import math
import statistics
from typing import Any

MIN_PRICE_BAND_PCT = 7.5
MAX_PRICE_BAND_PCT = 20.0
MAD_MULTIPLIER = 8.0

VOLUME_MEDIAN_MULTIPLIER = 100.0
VOLUME_FLOOR_BTC = 100_000.0
VOLUME_HARD_CEILING_BTC = 1_000_000.0

MIN_INDEX_SOURCES = 2


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


def robust_consensus(prices: list[float]) -> tuple[float, float, float]:
    values = [float(v) for v in prices if math.isfinite(positive(v))]
    if not values:
        return math.nan, math.nan, math.nan

    center = statistics.median(values)

    if len(values) < 3:
        return center, 0.0, MAX_PRICE_BAND_PCT

    abs_deviations = [abs(v - center) for v in values]
    mad = statistics.median(abs_deviations)
    mad_pct = (mad / center * 100.0) if center > 0 else math.nan

    band = MAD_MULTIPLIER * mad_pct if math.isfinite(mad_pct) else MIN_PRICE_BAND_PCT
    band = min(MAX_PRICE_BAND_PCT, max(MIN_PRICE_BAND_PCT, band))

    return center, mad_pct, band


def volume_limit(volumes: list[float]) -> tuple[float, float]:
    values = [float(v) for v in volumes if math.isfinite(positive(v))]

    if not values:
        return VOLUME_FLOOR_BTC, math.nan

    median_volume = statistics.median(values)
    limit = max(
        VOLUME_FLOOR_BTC,
        median_volume * VOLUME_MEDIAN_MULTIPLIER,
    )
    limit = min(limit, VOLUME_HARD_CEILING_BTC)

    return limit, median_volume


def classify_markets(
    markets: list[dict[str, Any]],
    *,
    minimum_sources: int = MIN_INDEX_SOURCES,
) -> dict[str, Any]:
    rows = [dict(row) for row in markets if isinstance(row, dict)]

    prices = [
        positive(row.get("price_usd"))
        for row in rows
    ]
    prices = [p for p in prices if math.isfinite(p)]

    center, mad_pct, band_pct = robust_consensus(prices)

    # Compute the volume baseline only from rows whose prices are already
    # plausibly near price consensus. A $0.19/BTC parser failure therefore
    # cannot inflate the volume threshold that is supposed to quarantine it.
    price_plausible_volumes: list[float] = []
    if math.isfinite(center):
        for row in rows:
            price = positive(row.get("price_usd"))
            if not math.isfinite(price):
                continue
            deviation = abs(price - center) / center * 100.0
            if deviation <= band_pct:
                volume = positive(row.get("volume_24h_btc"))
                if math.isfinite(volume):
                    price_plausible_volumes.append(volume)

    vol_limit, median_volume = volume_limit(price_plausible_volumes)

    accepted: list[dict[str, Any]] = []
    quarantined: list[dict[str, Any]] = []

    for row in rows:
        price = positive(row.get("price_usd"))
        volume = nonnegative(row.get("volume_24h_btc"))

        reasons: list[str] = []

        if not math.isfinite(price):
            deviation = math.nan
            reasons.append("invalid_price")
        elif math.isfinite(center) and center > 0:
            deviation = (price - center) / center * 100.0
            if abs(deviation) > band_pct:
                reasons.append("price_consensus_outlier")
        else:
            deviation = math.nan

        if not math.isfinite(volume):
            reasons.append("invalid_volume")
        elif volume > vol_limit:
            reasons.append("volume_outlier")

        row["consensus_price_usd"] = center if math.isfinite(center) else None
        row["consensus_deviation_pct"] = deviation if math.isfinite(deviation) else None
        row["consensus_price_band_pct"] = band_pct if math.isfinite(band_pct) else None
        row["volume_sanity_limit_btc"] = vol_limit
        row["index_eligible"] = not reasons
        row["exclusion_reason"] = ",".join(reasons) if reasons else None

        if reasons:
            row["weight"] = 0.0
            quarantined.append(row)
        else:
            accepted.append(row)

    if len(accepted) < minimum_sources:
        detail = "; ".join(
            f"{row.get('exchange') or row.get('source') or '?'}="
            f"{row.get('price_usd')!r}/{row.get('exclusion_reason')}"
            for row in quarantined[:12]
        )
        raise RuntimeError(
            "refusing index: only "
            f"{len(accepted)} consensus-valid source(s); "
            f"median={center!r}; band={band_pct!r}%"
            + (f"; quarantined: {detail}" if detail else "")
        )

    return {
        "accepted": accepted,
        "quarantined": quarantined,
        "consensus_price_usd": center,
        "median_absolute_deviation_pct": mad_pct,
        "price_band_pct": band_pct,
        "median_positive_volume_btc": median_volume,
        "volume_limit_btc": vol_limit,
        "raw_count": len(rows),
        "accepted_count": len(accepted),
        "quarantined_count": len(quarantined),
    }
