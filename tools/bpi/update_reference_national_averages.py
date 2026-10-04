#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any

from collector import atomic_json, load_json, utcnow


def finite(value: Any) -> float:
    try:
        number=float(value)
    except (TypeError,ValueError):
        return math.nan
    return number if math.isfinite(number) else math.nan


def positive(value: Any) -> float:
    number=finite(value)
    return number if number>0 else math.nan


def normalized_observation(
    row: dict[str,Any],
    catalog_by_id: dict[str,dict[str,Any]],
) -> dict[str,Any] | None:
    item_id=str(row.get("item_id") or row.get("id") or "")
    country=str(row.get("country_code") or row.get("country") or "").upper()
    usd=positive(row.get("usd") or row.get("price_usd"))

    if not item_id or item_id not in catalog_by_id:
        return None

    if len(country)!=2:
        return None

    if not math.isfinite(usd):
        return None

    item=catalog_by_id[item_id]
    unit=str(
        row.get("unit")
        or item.get("unit")
        or "unit"
    )

    # An observation must be for the same declared reference unit unless an
    # explicit positive conversion multiplier is supplied.
    catalog_unit=str(item.get("unit") or "unit")
    multiplier=positive(row.get("unit_multiplier_to_catalog"))

    if unit!=catalog_unit:
        if not math.isfinite(multiplier):
            return None
        usd*=multiplier
        unit=catalog_unit

    weight=positive(row.get("weight"))

    return {
        "country_code":country,
        "item_id":item_id,
        "page":str(item.get("page") or "references"),
        "usd":usd,
        "unit":unit,
        "source":str(row.get("source") or "unattributed source"),
        "source_class":str(row.get("source_class") or "validated aggregate dataset"),
        "updated_at":row.get("updated_at"),
        "sample_weight":weight if math.isfinite(weight) else None,
        "product_count":int(row.get("product_count") or 1),
    }


def aggregate_values(
    rows: list[dict[str,Any]],
) -> dict[str,Any]:
    values=[float(row["usd"]) for row in rows]
    mean=statistics.fmean(values)
    median=statistics.median(values)

    weighted_rows=[
        row for row in rows
        if positive(row.get("sample_weight"))>0
    ]

    if weighted_rows:
        total_weight=sum(float(row["sample_weight"]) for row in weighted_rows)
        selected=sum(
            float(row["usd"])*float(row["sample_weight"])
            for row in weighted_rows
        )/total_weight
        method="weighted_mean"
    else:
        total_weight=None
        selected=mean
        method="arithmetic_mean"

    product_count=sum(
        max(1,int(row.get("product_count") or 1))
        for row in rows
    )

    sources=sorted({
        str(row.get("source") or "")
        for row in rows
        if row.get("source")
    })

    source_classes=sorted({
        str(row.get("source_class") or "")
        for row in rows
        if row.get("source_class")
    })

    updated=[
        str(row.get("updated_at"))
        for row in rows
        if row.get("updated_at")
    ]

    return {
        "national_average_usd":selected,
        "mean_usd":mean,
        "median_usd":median,
        "minimum_usd":min(values),
        "maximum_usd":max(values),
        "sample_count":len(rows),
        "product_count":product_count,
        "source_count":len(sources),
        "sources":sources,
        "source_classes":source_classes,
        "aggregation_method":method,
        "total_sample_weight":total_weight,
        "updated_at":max(updated) if updated else None,
    }


def build(
    catalog: dict[str,Any],
    observations_payload: dict[str,Any],
    *,
    countries_payload: dict[str,Any] | None=None,
) -> dict[str,Any]:
    items=[
        row for row in catalog.get("items",[])
        if isinstance(row,dict) and row.get("id")
    ]
    pages=[
        row for row in catalog.get("pages",[])
        if isinstance(row,dict) and row.get("id")
    ]

    by_id={
        str(row["id"]):row
        for row in items
    }

    normalized=[]

    for row in observations_payload.get("observations",[]):
        if not isinstance(row,dict):
            continue
        value=normalized_observation(row,by_id)
        if value:
            normalized.append(value)

    grouped=defaultdict(list)
    for row in normalized:
        grouped[
            (
                row["country_code"],
                row["item_id"],
            )
        ].append(row)

    countries=defaultdict(lambda:{
        "items":{},
        "pages":{},
    })

    for (country,item_id),rows in sorted(grouped.items()):
        item=by_id[item_id]
        aggregate=aggregate_values(rows)

        countries[country]["items"][item_id]={
            "item_id":item_id,
            "name":str(item.get("name") or item_id),
            "page":str(item.get("page") or "references"),
            "unit":str(item.get("unit") or "unit"),
            **aggregate,
        }

    page_by_id={
        str(row["id"]):row
        for row in pages
    }

    for country,payload in countries.items():
        item_rows=payload["items"]

        for page_id,page in page_by_id.items():
            page_items=[
                row for row in items
                if str(row.get("page"))==page_id
            ]

            available=[
                item_rows[str(row["id"])]
                for row in page_items
                if str(row["id"]) in item_rows
            ]

            if not available:
                continue

            values=[
                float(row["national_average_usd"])
                for row in available
            ]

            units=sorted({
                str(row.get("unit") or "unit")
                for row in available
            })

            payload["pages"][page_id]={
                "page_id":page_id,
                "label":str(page.get("label") or page_id),
                "category_average_usd":statistics.fmean(values),
                "category_median_usd":statistics.median(values),
                "priced_item_count":len(available),
                "catalog_item_count":len(page_items),
                "coverage_ratio":
                    len(available)/len(page_items)
                    if page_items
                    else 0.0,
                "units":units,
                "heterogeneous_units":len(units)>1,
                "aggregation_method":
                    "equal_item_class_mean_of_national_item_averages",
                "conversion_policy":
                    "individual item national_average_usd is authoritative for conversions; category_average_usd is summary only",
            }

    names={}
    if isinstance(countries_payload,dict):
        for row in countries_payload.get("countries",[]):
            if not isinstance(row,dict):
                continue
            code=str(
                row.get("code")
                or row.get("country_code")
                or ""
            ).upper()
            if code:
                names[code]=str(
                    row.get("name")
                    or row.get("country_name")
                    or code
                )

    output_countries={}
    for code,payload in sorted(countries.items()):
        output_countries[code]={
            "country_code":code,
            "country_name":names.get(code,code),
            **payload,
        }

    return {
        "schema":"zzx-reference-national-averages-v1",
        "updated_at":utcnow(),
        "country_count":len(output_countries),
        "observation_count":len(normalized),
        "countries":output_countries,
        "methodology":{
            "item":"national average is computed only from country-scoped observations for the exact reference item/class",
            "weighted":"uses observation sample_weight when supplied; otherwise arithmetic mean",
            "category":"summary only; equal mean across available item-class national averages",
            "missing":"unavailable; global spot/reference prices never masquerade as national averages",
        },
    }


def self_test() -> None:
    catalog={
        "pages":[
            {"id":"tobacco","label":"Tobacco"},
        ],
        "items":[
            {
                "id":"tobacco",
                "name":"Cigarettes",
                "unit":"pack",
                "page":"tobacco",
            },
            {
                "id":"premium_cigar",
                "name":"Premium Cigar",
                "unit":"cigar",
                "page":"tobacco",
            },
        ],
    }

    observations={
        "observations":[
            {
                "country_code":"US",
                "item_id":"tobacco",
                "usd":10,
                "unit":"pack",
                "source":"A",
                "product_count":100,
            },
            {
                "country_code":"US",
                "item_id":"tobacco",
                "usd":14,
                "unit":"pack",
                "source":"B",
                "product_count":100,
            },
            {
                "country_code":"US",
                "item_id":"premium_cigar",
                "usd":20,
                "unit":"cigar",
                "source":"C",
            },
        ]
    }

    result=build(catalog,observations)

    assert result["country_count"]==1
    tobacco=result["countries"]["US"]["items"]["tobacco"]
    assert abs(tobacco["national_average_usd"]-12)<1e-12
    assert tobacco["sample_count"]==2
    assert tobacco["product_count"]==200

    page=result["countries"]["US"]["pages"]["tobacco"]
    assert abs(page["category_average_usd"]-16)<1e-12
    assert page["heterogeneous_units"] is True

    print("update_reference_national_averages.py self-test: PASS")


def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        default=str(Path(__file__).resolve().parents[2]),
    )
    parser.add_argument("--self-test",action="store_true")
    args=parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    root=Path(args.root).resolve()
    api=root/"bitcoin/bpi/api"

    catalog=load_json(
        root/"__partials/widgets/bitcoin-ticker/reference-catalog.json",
        {},
    )
    observations=load_json(
        api/"reference_national_observations.json",
        {},
    )
    countries=load_json(
        api/"sovereign-countries.json",
        {},
    )

    result=build(
        catalog,
        observations,
        countries_payload=countries,
    )

    atomic_json(
        api/"reference_national_averages.json",
        result,
    )

    print(
        "National reference averages updated: "
        f"countries={result['country_count']} "
        f"observations={result['observation_count']}"
    )
    return 0


if __name__=="__main__":
    raise SystemExit(main())
