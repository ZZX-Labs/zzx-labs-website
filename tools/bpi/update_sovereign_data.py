#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
from typing import Any

from collector import HttpClient, atomic_json, load_json, positive, finite, utcnow

GDP_INDICATOR = "NY.GDP.MKTP.CD"
DEBT_PCT_INDICATOR = "GC.DOD.TOTL.GD.ZS"
RESERVES_TOTAL_INDICATOR = "FI.RES.TOTL.CD"
RESERVES_EX_GOLD_INDICATOR = "FI.RES.XGLD.CD"


def wb_rows(payload: Any) -> list[dict[str, Any]]:
    if (
        isinstance(payload, list)
        and len(payload) >= 2
        and isinstance(payload[1], list)
    ):
        return [row for row in payload[1] if isinstance(row, dict)]
    return []


def year_value_map(payload: Any) -> dict[str, dict[int, float]]:
    out: dict[str, dict[int, float]] = {}

    for row in wb_rows(payload):
        iso3 = str(row.get("countryiso3code") or "").upper()
        if len(iso3) != 3:
            continue

        try:
            year = int(row.get("date"))
        except Exception:
            continue

        value = positive(row.get("value"))
        if not math.isfinite(value):
            continue

        out.setdefault(iso3, {})[year] = value

    return out


def latest_value(
    values: dict[int, float],
) -> tuple[int | None, float | None]:
    if not values:
        return None, None

    year = max(values)
    value = values[year]

    if not math.isfinite(positive(value)):
        return None, None

    return year, float(value)


def matched_debt(
    debt_pct: dict[int, float],
    gdp: dict[int, float],
) -> tuple[int | None, float | None, float | None, float | None]:
    years = sorted(set(debt_pct).intersection(gdp), reverse=True)

    for year in years:
        ratio = positive(debt_pct.get(year))
        gdp_usd = positive(gdp.get(year))

        if not (math.isfinite(ratio) and math.isfinite(gdp_usd)):
            continue

        debt_usd = gdp_usd * ratio / 100.0

        if math.isfinite(positive(debt_usd)):
            return year, debt_usd, ratio, gdp_usd

    return None, None, None, None


def merge_world_bank_metadata(
    seed: list[dict[str, Any]],
    payload: Any,
) -> list[dict[str, Any]]:
    by_iso3 = {
        str(row.get("iso3") or "").upper(): dict(row)
        for row in seed
        if isinstance(row, dict)
    }

    for row in wb_rows(payload):
        iso3 = str(row.get("id") or row.get("iso3Code") or "").upper()
        if iso3 not in by_iso3:
            continue

        target = by_iso3[iso3]
        target["world_bank_name"] = row.get("name")
        target["region"] = (row.get("region") or {}).get("value")
        target["income_level"] = (row.get("incomeLevel") or {}).get("value")
        target["lending_type"] = (row.get("lendingType") or {}).get("value")
        target["capital_city"] = row.get("capitalCity")
        target["longitude"] = row.get("longitude")
        target["latitude"] = row.get("latitude")

    rows = list(by_iso3.values())
    return sorted(rows, key=lambda row: str(row.get("name") or ""))


def apply_debt_overrides(
    rows: list[dict[str, Any]],
    overrides: dict[str, Any],
) -> None:
    by_code = {
        str(row.get("code") or "").upper(): row
        for row in rows
    }

    for override in overrides.get("countries", []):
        if not isinstance(override, dict):
            continue

        code = str(override.get("code") or "").upper()
        row = by_code.get(code)
        if row is None:
            continue

        debt = positive(override.get("debt_usd"))
        if not math.isfinite(debt):
            continue

        override_ratio = positive(
            override.get("debt_percent_gdp")
        )
        if not math.isfinite(override_ratio):
            override_ratio = None

        override_gdp = positive(override.get("gdp_usd"))
        if not math.isfinite(override_gdp):
            override_gdp = None

        row.update({
            "available": True,
            "debt_usd": debt,
            "debt_percent_gdp": override_ratio,
            "gdp_usd": override_gdp,
            "record_year": override.get("record_year"),
            "record_date": (
                override.get("record_date")
                or override.get("updated_at")
            ),
            "source": (
                override.get("source")
                or "official/local sovereign debt override"
            ),
            "method": (
                override.get("method")
                or "official/curated public debt value"
            ),
        })


def apply_balance_overrides(
    rows: list[dict[str, Any]],
    overrides: dict[str, Any],
) -> None:
    by_code = {
        str(row.get("code") or "").upper(): row
        for row in rows
    }

    for override in overrides.get("countries", []):
        if not isinstance(override, dict):
            continue

        code = str(override.get("code") or "").upper()
        row = by_code.get(code)
        if row is None:
            continue

        total = positive(
            override.get("balance_assets_usd")
            or override.get("reserve_assets_usd")
        )
        if not math.isfinite(total):
            continue

        ex_gold = positive(override.get("reserve_assets_ex_gold_usd"))
        if not math.isfinite(ex_gold):
            ex_gold = None

        gold_component = (
            max(0.0, total - ex_gold)
            if ex_gold is not None
            else None
        )

        row.update({
            "available": True,
            "balance_assets_usd": total,
            "reserve_assets_usd": total,
            "reserve_assets_ex_gold_usd": ex_gold,
            "implied_gold_component_usd": gold_component,
            "record_year": override.get("record_year"),
            "record_date": (
                override.get("record_date")
                or override.get("updated_at")
            ),
            "source": (
                override.get("source")
                or "official/local reserve-assets override"
            ),
            "method": (
                override.get("method")
                or "official/curated public reserve-assets value"
            ),
        })


def update_sovereign_data(
    root: Path,
    client: HttpClient,
    *,
    minimum_available: int = 10,
) -> dict[str, int]:
    api = root / "bitcoin/bpi/api"

    registry = load_json(api / "sovereign-countries.json", {})
    seed = registry.get("countries", [])

    if not isinstance(seed, list) or len(seed) < 200:
        raise RuntimeError("sovereign country registry is missing/incomplete")

    cfg = load_json(api / "sovereign_source_urls.json", {})
    sources = {
        str(row.get("id")): row
        for row in cfg.get("sources", [])
        if isinstance(row, dict) and row.get("enabled", True)
    }

    fetched: dict[str, Any] = {}

    for source_id, source in sources.items():
        result = client.get(source_id, str(source.get("url") or ""))
        if result.ok:
            fetched[source_id] = result.payload
        else:
            print(
                f"SOVEREIGN_SOURCE_FAIL {source_id}: "
                f"{result.error or result.status}"
            )

    countries = merge_world_bank_metadata(
        seed,
        fetched.get("world_bank_country_metadata"),
    )

    gdp = year_value_map(
        fetched.get("world_bank_gdp_usd")
    )
    debt_pct = year_value_map(
        fetched.get(
            "world_bank_central_government_debt_pct_gdp"
        )
    )
    reserves_total = year_value_map(
        fetched.get("world_bank_reserves_total_usd")
    )
    reserves_ex_gold = year_value_map(
        fetched.get("world_bank_reserves_ex_gold_usd")
    )

    debt_rows: list[dict[str, Any]] = []
    balance_rows: list[dict[str, Any]] = []

    for country in countries:
        code = str(country.get("code") or "").upper()
        iso3 = str(country.get("iso3") or "").upper()
        name = str(country.get("name") or code)

        year, debt_usd, ratio, gdp_usd = matched_debt(
            debt_pct.get(iso3, {}),
            gdp.get(iso3, {}),
        )

        debt_rows.append({
            "code": code,
            "iso3": iso3,
            "name": name,
            "available": debt_usd is not None,
            "debt_usd": debt_usd,
            "debt_percent_gdp": ratio,
            "gdp_usd": gdp_usd,
            "record_year": year,
            "record_date": str(year) if year else None,
            "source": (
                "World Bank WDI"
                if debt_usd is not None
                else "World Bank WDI: matching debt/GDP year unavailable"
            ),
            "method": (
                "central government debt (% GDP) × GDP (current USD), same year"
                if debt_usd is not None
                else None
            ),
        })

        reserve_year, total = latest_value(
            reserves_total.get(iso3, {})
        )

        ex_gold = None
        if reserve_year is not None:
            ex_gold = positive(
                reserves_ex_gold.get(iso3, {}).get(reserve_year)
            )
            if not math.isfinite(ex_gold):
                ex_gold = None

        gold_component = (
            max(0.0, total - ex_gold)
            if total is not None and ex_gold is not None
            else None
        )

        balance_rows.append({
            "code": code,
            "iso3": iso3,
            "name": name,
            "available": total is not None,
            "balance_assets_usd": total,
            "reserve_assets_usd": total,
            "reserve_assets_ex_gold_usd": ex_gold,
            "implied_gold_component_usd": gold_component,
            "record_year": reserve_year,
            "record_date": (
                str(reserve_year)
                if reserve_year is not None
                else None
            ),
            "source": (
                "World Bank WDI"
                if total is not None
                else "World Bank WDI: reserve-assets value unavailable"
            ),
            "method": (
                "total reserves including gold (current USD)"
                if total is not None
                else None
            ),
        })

    # Official U.S. public-debt feed supersedes the broad World Bank estimate.
    treasury = fetched.get("us_treasury_debt_to_penny")
    if isinstance(treasury, dict):
        row = (treasury.get("data") or [None])[0] or {}
        official_debt = positive(row.get("tot_pub_debt_out_amt"))

        if math.isfinite(official_debt):
            for debt_row in debt_rows:
                if debt_row["code"] == "US":
                    debt_row.update({
                        "available": True,
                        "debt_usd": official_debt,
                        "record_date": row.get("record_date"),
                        "source": "U.S. Treasury Fiscal Data",
                        "method": "Total Public Debt Outstanding",
                    })
                    break

    apply_debt_overrides(
        debt_rows,
        load_json(api / "national_debt_overrides.json", {}),
    )
    apply_balance_overrides(
        balance_rows,
        load_json(api / "national_balance_overrides.json", {}),
    )

    debt_available = sum(
        1 for row in debt_rows if row.get("available") is True
    )
    balance_available = sum(
        1 for row in balance_rows if row.get("available") is True
    )

    # Fail closed: never overwrite broad valid datasets with an API outage.
    if debt_available < minimum_available:
        raise RuntimeError(
            "refusing sovereign update with only "
            f"{debt_available} debt estimates"
        )

    if balance_available < minimum_available:
        raise RuntimeError(
            "refusing sovereign update with only "
            f"{balance_available} reserve-asset estimates"
        )

    now = utcnow()

    atomic_json(api / "sovereign-countries.json", {
        "schema": "zzx-sovereign-countries-v1",
        "updated_at": now,
        "source": "ISO 3166 seed + World Bank country metadata",
        "country_count": len(countries),
        "countries": countries,
    })

    atomic_json(api / "national_debts.json", {
        "schema": "zzx-national-debts-v2",
        "updated_at": now,
        "methodology": (
            "Official national feed where available; otherwise World Bank "
            "central government debt (% GDP) × GDP (current USD), same year."
        ),
        "available_country_count": debt_available,
        "country_count": len(debt_rows),
        "countries": sorted(
            debt_rows,
            key=lambda row: str(row.get("name") or ""),
        ),
    })

    atomic_json(api / "national_balances.json", {
        "schema": "zzx-national-balances-v1",
        "updated_at": now,
        "methodology": (
            "Public reserve-assets proxy using World Bank total reserves "
            "including gold (current USD). Not a complete sovereign balance sheet."
        ),
        "available_country_count": balance_available,
        "country_count": len(balance_rows),
        "countries": sorted(
            balance_rows,
            key=lambda row: str(row.get("name") or ""),
        ),
    })

    print(
        "Sovereign data updated: "
        f"registry={len(countries)} "
        f"debts={debt_available} "
        f"balances={balance_available}"
    )

    return {
        "registry": len(countries),
        "debts": debt_available,
        "balances": balance_available,
    }


def self_test() -> None:
    gdp = {
        "AAA": {2023: 1_000_000_000_000.0},
    }
    debt = {
        "AAA": {2023: 80.0},
    }

    year, debt_usd, ratio, gdp_usd = matched_debt(
        debt["AAA"],
        gdp["AAA"],
    )

    assert year == 2023
    assert abs(debt_usd - 800_000_000_000.0) < 1
    assert ratio == 80.0
    assert gdp_usd == 1_000_000_000_000.0

    payload = [
        {"page": 1},
        [
            {
                "countryiso3code": "AAA",
                "date": "2023",
                "value": 123.45,
            }
        ],
    ]

    parsed = year_value_map(payload)
    assert parsed["AAA"][2023] == 123.45

    print("update_sovereign_data.py self-test: PASS")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        default=str(Path(__file__).resolve().parents[2]),
    )
    parser.add_argument(
        "--proxy",
        default=os.environ.get("ZZX_BPI_PROXY"),
    )
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--minimum-available", type=int, default=10)
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    root = Path(args.root).resolve()
    client = HttpClient(proxy_url=args.proxy, timeout=20.0)

    update_sovereign_data(
        root,
        client,
        minimum_available=max(1, args.minimum_available),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
