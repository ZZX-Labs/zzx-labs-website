#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from collector import atomic_json, load_json, utcnow


USER_AGENT="ZZX-Labs-Reference-National/1.0"


def finite(value: Any) -> float:
    try:
        number=float(value)
    except (TypeError,ValueError):
        return math.nan
    return number if math.isfinite(number) else math.nan


def positive(value: Any) -> float:
    number=finite(value)
    return number if number>0 else math.nan


def request_json(
    url: str,
    *,
    method: str="GET",
    body: Any=None,
    timeout: int=20,
    headers: dict[str,str] | None=None,
) -> Any:
    payload=None

    request_headers={
        "User-Agent":USER_AGENT,
        "Accept":"application/json",
    }

    if headers:
        request_headers.update(headers)

    if body is not None:
        payload=json.dumps(body).encode("utf-8")
        request_headers["Content-Type"]="application/json"

    request=urllib.request.Request(
        url,
        data=payload,
        method=method,
        headers=request_headers,
    )

    with urllib.request.urlopen(
        request,
        timeout=timeout,
    ) as response:
        return json.loads(
            response.read().decode("utf-8")
        )


def request_text(
    url: str,
    *,
    timeout: int=20,
) -> str:
    request=urllib.request.Request(
        url,
        headers={
            "User-Agent":USER_AGENT,
            "Accept":"text/csv,text/plain,*/*",
        },
    )

    with urllib.request.urlopen(
        request,
        timeout=timeout,
    ) as response:
        return response.read().decode(
            "utf-8",
            errors="replace",
        )


def deep_get(
    value: Any,
    path: str,
) -> Any:
    current=value

    for part in str(path or "").split("."):
        if not part:
            continue

        if isinstance(current,dict):
            current=current.get(part)
        elif isinstance(current,list):
            try:
                current=current[int(part)]
            except Exception:
                return None
        else:
            return None

    return current


def observation(
    *,
    source: dict[str,Any],
    item_id: str,
    usd: float,
    unit: str | None=None,
    updated_at: Any=None,
    sample_weight: float | None=None,
    product_count: int | None=None,
) -> dict[str,Any] | None:
    value=positive(usd)

    if not math.isfinite(value):
        return None

    country=str(
        source.get("country_code")
        or source.get("scope")
        or ""
    ).upper()

    if len(country)!=2:
        return None

    row={
        "country_code":country,
        "item_id":str(item_id),
        "usd":value,
        "unit":str(unit or source.get("unit") or "unit"),
        "source":str(
            source.get("label")
            or source.get("id")
            or "public API"
        ),
        "source_class":str(
            source.get("source_class")
            or "validated aggregate dataset"
        ),
        "updated_at":
            updated_at
            or source.get("updated_at")
            or utcnow(),
    }

    weight=positive(sample_weight)
    if math.isfinite(weight):
        row["weight"]=weight

    if product_count is not None:
        try:
            row["product_count"]=max(
                1,
                int(product_count),
            )
        except Exception:
            pass

    multiplier=positive(
        source.get("unit_multiplier_to_catalog")
    )
    if math.isfinite(multiplier):
        row["unit_multiplier_to_catalog"]=multiplier

    return row


def collect_bls(
    source: dict[str,Any],
) -> list[dict[str,Any]]:
    series=source.get("series")
    if not isinstance(series,dict) or not series:
        return []

    body={
        "seriesid":list(series.keys()),
        "latest":True,
    }

    payload=request_json(
        str(source["url"]),
        method="POST",
        body=body,
    )

    out=[]

    for block in (
        payload.get("Results",{})
        .get("series",[])
    ):
        series_id=str(
            block.get("seriesID") or ""
        )

        mapping=series.get(series_id)
        if not isinstance(mapping,dict):
            continue

        rows=block.get("data") or []

        for row in rows[:1]:
            value=positive(row.get("value"))
            if not math.isfinite(value):
                continue

            item=observation(
                source=source,
                item_id=str(
                    mapping.get("item_id") or ""
                ),
                usd=value,
                unit=mapping.get("unit"),
                updated_at=
                    f"{row.get('year')}-{row.get('period')}",
                product_count=
                    mapping.get("product_count"),
            )

            if item:
                out.append(item)

    return out


def collect_fred(
    source: dict[str,Any],
) -> list[dict[str,Any]]:
    api_key=os.environ.get(
        str(source.get("requires_env") or "FRED_API_KEY"),
        "",
    )

    if not api_key:
        return []

    out=[]

    for mapping in source.get("series",[]):
        if not isinstance(mapping,dict):
            continue

        series_id=str(
            mapping.get("series_id") or ""
        )

        if not series_id:
            continue

        query={
            "series_id":series_id,
            "api_key":api_key,
            "file_type":"json",
            "sort_order":"desc",
            "limit":"1",
        }

        url=(
            str(source["url"])
            +"?"
            +urllib.parse.urlencode(query)
        )

        payload=request_json(url)
        rows=payload.get("observations") or []

        if not rows:
            continue

        value=positive(rows[0].get("value"))

        if not math.isfinite(value):
            continue

        multiplier=finite(
            mapping.get("usd_multiplier")
        )

        if math.isfinite(multiplier):
            value*=multiplier

        item=observation(
            source=source,
            item_id=str(
                mapping.get("item_id") or ""
            ),
            usd=value,
            unit=mapping.get("unit"),
            updated_at=rows[0].get("date"),
            product_count=
                mapping.get("product_count"),
        )

        if item:
            out.append(item)

    return out


def collect_generic_json(
    source: dict[str,Any],
) -> list[dict[str,Any]]:
    url=str(source.get("url") or "")
    if not url:
        return []

    requires_env=str(
        source.get("requires_env") or ""
    )

    if requires_env:
        token=os.environ.get(requires_env,"")
        if not token:
            return []

        url=url.replace(
            "{API_KEY}",
            urllib.parse.quote(token),
        )

    payload=request_json(url)

    rows=deep_get(
        payload,
        str(source.get("records_path") or "")
    )

    if rows is None:
        rows=payload

    if not isinstance(rows,list):
        return []

    item_field=str(
        source.get("item_id_field")
        or "item_id"
    )
    price_field=str(
        source.get("usd_field")
        or "usd"
    )
    unit_field=str(
        source.get("unit_field")
        or "unit"
    )
    updated_field=str(
        source.get("updated_at_field")
        or "updated_at"
    )
    weight_field=str(
        source.get("sample_weight_field")
        or ""
    )
    product_count_field=str(
        source.get("product_count_field")
        or ""
    )

    item_map=source.get("item_map") or {}
    out=[]

    for row in rows:
        if not isinstance(row,dict):
            continue

        raw_item=str(
            deep_get(row,item_field)
            or ""
        )

        item_id=str(
            item_map.get(raw_item)
            or raw_item
        )

        value=positive(
            deep_get(
                row,
                price_field
            )
        )

        if not item_id or not math.isfinite(value):
            continue

        multiplier=finite(
            source.get("usd_multiplier")
        )

        if math.isfinite(multiplier):
            value*=multiplier

        item=observation(
            source=source,
            item_id=item_id,
            usd=value,
            unit=deep_get(row,unit_field),
            updated_at=deep_get(
                row,
                updated_field,
            ),
            sample_weight=(
                deep_get(row,weight_field)
                if weight_field
                else None
            ),
            product_count=(
                deep_get(
                    row,
                    product_count_field
                )
                if product_count_field
                else None
            ),
        )

        if item:
            out.append(item)

    return out


def collect_generic_csv(
    source: dict[str,Any],
) -> list[dict[str,Any]]:
    url=str(source.get("url") or "")
    if not url:
        return []

    text=request_text(url)
    rows=list(
        csv.DictReader(
            io.StringIO(text)
        )
    )

    source_copy=dict(source)
    source_copy["records_path"]=""

    out=[]
    item_field=str(
        source.get("item_id_field")
        or "item_id"
    )
    price_field=str(
        source.get("usd_field")
        or "usd"
    )
    unit_field=str(
        source.get("unit_field")
        or "unit"
    )
    item_map=source.get("item_map") or {}

    for row in rows:
        raw_item=str(
            row.get(item_field) or ""
        )

        item_id=str(
            item_map.get(raw_item)
            or raw_item
        )

        value=positive(
            row.get(price_field)
        )

        if not item_id or not math.isfinite(value):
            continue

        item=observation(
            source=source,
            item_id=item_id,
            usd=value,
            unit=row.get(unit_field),
            updated_at=row.get(
                str(
                    source.get(
                        "updated_at_field"
                    )
                    or "updated_at"
                )
            ),
        )

        if item:
            out.append(item)

    return out


def collect_source(
    source: dict[str,Any],
) -> list[dict[str,Any]]:
    adapter=str(
        source.get("adapter") or ""
    )

    if adapter=="bls_timeseries":
        return collect_bls(source)

    if adapter=="fred_series":
        return collect_fred(source)

    if adapter in {
        "eia_v2",
        "usda_quickstats",
        "socrata_or_state_json",
        "government_json_csv",
        "json_records",
        "validated_aggregate_dataset",
        "official_msrp_aggregate",
        "auction_aggregate",
        "licensed_or_public_price_index",
    }:
        return collect_generic_json(source)

    if adapter in {
        "csv_records",
        "government_csv",
    }:
        return collect_generic_csv(source)

    return []


def collect(
    root: Path,
) -> dict[str,Any]:
    api=root/"bitcoin/bpi/api"

    registry=load_json(
        api/"reference_national_source_registry.json",
        {},
    )

    previous=load_json(
        api/"reference_national_observations.json",
        {},
    )

    prior_rows=[
        row for row in previous.get("observations",[])
        if isinstance(row,dict)
    ]

    fresh=[]
    source_health={}

    for source in registry.get("sources",[]):
        if not isinstance(source,dict):
            continue

        source_id=str(
            source.get("id") or ""
        )

        if not source.get("enabled",False):
            source_health[source_id]={
                "enabled":False,
                "observations":0,
            }
            continue

        try:
            rows=collect_source(source)
            fresh.extend(rows)

            source_health[source_id]={
                "enabled":True,
                "ok":True,
                "observations":len(rows),
            }
        except Exception as exc:
            source_health[source_id]={
                "enabled":True,
                "ok":False,
                "error":str(exc),
                "observations":0,
            }

    # Explicit country-scoped overrides become validated observations.
    overrides=load_json(
        api/"reference_overrides.json",
        {},
    )

    for item_id,row in (
        overrides.get("prices",{})
        if isinstance(overrides,dict)
        else {}
    ).items():
        if not isinstance(row,dict):
            continue

        country=str(
            row.get("country_code")
            or ""
        ).upper()

        value=positive(row.get("usd"))

        if len(country)!=2 or not math.isfinite(value):
            continue

        fresh.append({
            "country_code":country,
            "item_id":str(item_id),
            "usd":value,
            "unit":row.get("unit"),
            "source":str(
                row.get("source")
                or "country-scoped curated override"
            ),
            "source_class":str(
                row.get("source_class")
                or "validated aggregate dataset"
            ),
            "updated_at":
                row.get("updated_at")
                or utcnow(),
            "product_count":
                int(row.get("product_count") or 1),
        })

    # Preserve prior observations only from sources that were not refreshed
    # successfully this run. Fresh source+country+item replaces same-source prior.
    fresh_keys={
        (
            str(row.get("country_code") or "").upper(),
            str(row.get("item_id") or ""),
            str(row.get("source") or ""),
        )
        for row in fresh
    }

    retained=[
        row for row in prior_rows
        if (
            str(row.get("country_code") or "").upper(),
            str(row.get("item_id") or ""),
            str(row.get("source") or ""),
        )
        not in fresh_keys
    ]

    observations=retained+fresh

    result={
        "schema":"zzx-reference-national-observations-v1",
        "updated_at":utcnow(),
        "observation_count":len(observations),
        "observations":observations,
        "source_health":source_health,
        "notes":"Country-scoped normalized observations only. No synthetic values."
    }

    atomic_json(
        api/"reference_national_observations.json",
        result,
    )

    return result


def self_test() -> None:
    source={
        "id":"fixture",
        "label":"Fixture",
        "country_code":"US",
        "source_class":"validated aggregate dataset",
    }

    row=observation(
        source=source,
        item_id="tobacco",
        usd=12.5,
        unit="pack",
        product_count=50,
    )

    assert row is not None
    assert row["country_code"]=="US"
    assert row["usd"]==12.5
    assert row["product_count"]==50

    print("reference_national_collector.py self-test: PASS")


def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        default=str(Path(__file__).resolve().parents[2]),
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
    )
    args=parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    result=collect(
        Path(args.root).resolve()
    )

    print(
        "National reference observations updated: "
        f"{result['observation_count']}"
    )

    return 0


if __name__=="__main__":
    raise SystemExit(main())
