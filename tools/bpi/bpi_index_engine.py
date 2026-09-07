#!/usr/bin/env python3
from __future__ import annotations

import math
import statistics
from collections import defaultdict
from typing import Any


def finite(value: Any) -> float:
    try:
        number=float(value)
    except (TypeError,ValueError):
        return math.nan
    return number if math.isfinite(number) else math.nan


def positive(value: Any) -> float:
    number=finite(value)
    return number if number>0 else math.nan


def nonnegative(value: Any) -> float:
    number=finite(value)
    return number if number>=0 else math.nan


def country_currency_map(config: dict[str,Any]) -> dict[str,str]:
    regions=config.get("regions")
    if isinstance(regions,dict):
        return {
            str(country).upper():str(currency).upper()
            for country,currency in regions.items()
            if country and currency
        }

    out={}
    for row in config.get("countries",[]):
        if not isinstance(row,dict):
            continue
        country=str(row.get("country_code") or "").upper()
        currency=str(row.get("currency") or "").upper()
        if country and currency:
            out[country]=currency
    return out


def annotate_global_weights(
    markets: list[dict[str,Any]],
) -> dict[str,Any]:
    rows=[dict(row) for row in markets if isinstance(row,dict)]

    eligible=[
        row for row in rows
        if row.get("index_eligible") is not False
        and positive(row.get("price_usd"))>0
        and positive(row.get("volume_24h_btc"))>0
    ]

    total_volume=sum(
        float(row["volume_24h_btc"])
        for row in eligible
    )

    if not (total_volume>0):
        raise RuntimeError(
            "cannot weight BPI: no positive eligible global 24h BTC volume"
        )

    by_key={}
    for row in eligible:
        volume=float(row["volume_24h_btc"])
        price=float(row["price_usd"])
        ratio=volume/total_volume

        row.update({
            "weight_ratio":ratio,
            "weight_decimal":ratio,
            "weight_percent_decimal":ratio,
            "weight_percent":ratio*100.0,
            "weighted_price_contribution_usd":price*ratio,
            "global_volume_24h_btc":total_volume,
        })

        key=str(
            row.get("market_key")
            or (
                str(row.get("exchange") or "")
                +"::"+
                str(row.get("pair") or row.get("quote") or "")
            )
        )
        by_key[key]=row

    annotated=[]
    for raw in rows:
        key=str(
            raw.get("market_key")
            or (
                str(raw.get("exchange") or "")
                +"::"+
                str(raw.get("pair") or raw.get("quote") or "")
            )
        )
        checked=by_key.get(key)

        if checked is not None:
            annotated.append(checked)
        else:
            row=dict(raw)
            row.update({
                "weight_ratio":0.0,
                "weight_decimal":0.0,
                "weight_percent_decimal":0.0,
                "weight_percent":0.0,
                "weighted_price_contribution_usd":0.0,
                "global_volume_24h_btc":total_volume,
            })
            annotated.append(row)

    return {
        "markets":annotated,
        "eligible":eligible,
        "global_volume_24h_btc":total_volume,
    }


def index_for_rows(
    rows: list[dict[str,Any]],
    *,
    global_weight_key: str="weight_ratio",
) -> dict[str,Any] | None:
    eligible=[
        row for row in rows
        if row.get("index_eligible") is not False
        and positive(row.get("price_usd"))>0
    ]

    if not eligible:
        return None

    unweighted=sum(
        float(row["price_usd"])
        for row in eligible
    )/len(eligible)

    weight_sum=sum(
        max(0.0,finite(row.get(global_weight_key)))
        for row in eligible
        if math.isfinite(finite(row.get(global_weight_key)))
    )

    if weight_sum>0:
        weighted=sum(
            float(row["price_usd"])
            * max(0.0,finite(row.get(global_weight_key)))
            for row in eligible
        )/weight_sum
    else:
        weighted=unweighted

    volume=sum(
        max(0.0,finite(row.get("volume_24h_btc")))
        for row in eligible
        if math.isfinite(finite(row.get("volume_24h_btc")))
    )

    def metric(field: str) -> float | None:
        pairs=[]
        for row in eligible:
            value=finite(row.get(field))
            weight=max(0.0,finite(row.get(global_weight_key)))
            if math.isfinite(value) and math.isfinite(weight) and weight>0:
                pairs.append((value,weight))
        total=sum(weight for _,weight in pairs)
        if total>0:
            return sum(value*weight for value,weight in pairs)/total
        values=[finite(row.get(field)) for row in eligible]
        values=[value for value in values if math.isfinite(value)]
        return statistics.fmean(values) if values else None

    exchanges=sorted({
        str(row.get("exchange") or "")
        for row in eligible
        if row.get("exchange")
    })

    return {
        "weighted_price_usd":weighted,
        "unweighted_price_usd":unweighted,
        "weights_enabled_default":True,
        "global_weight_share_ratio":weight_sum,
        "global_weight_share_percent":weight_sum*100.0,
        "volume_24h_btc":volume,
        "high_24h":metric("high_24h_usd"),
        "low_24h":metric("low_24h_usd"),
        "market_count":len(eligible),
        "exchange_count":len(exchanges),
        "exchanges":exchanges,
        "method_weighted":"global_volume_weighted_subset_renormalized",
        "method_unweighted":"arithmetic_mean",
    }


def build_indexes(
    markets: list[dict[str,Any]],
    country_currency_config: dict[str,Any],
) -> dict[str,Any]:
    weighted=annotate_global_weights(markets)
    eligible=weighted["eligible"]

    global_index=index_for_rows(eligible)
    if global_index is None:
        raise RuntimeError("no eligible markets for Global BPI")

    global_index["weighted_price_usd"]=sum(
        float(row["weighted_price_contribution_usd"])
        for row in eligible
    )
    global_index["global_weight_share_ratio"]=1.0
    global_index["global_weight_share_percent"]=100.0
    global_index["method_weighted"]="global_24h_btc_volume_weighted"

    country_map=country_currency_map(country_currency_config)
    national={}

    for country,currency in sorted(country_map.items()):
        rows=[
            row for row in eligible
            if str(row.get("quote") or "").upper()==currency
        ]
        index=index_for_rows(rows)

        if index is None:
            continue

        index.update({
            "country_code":country,
            "currency":currency,
            "scope_method":"national_currency_market",
        })
        national[country]=index

    default_country=str(
        country_currency_config.get("default_country")
        or "US"
    ).upper()

    default=national.get(default_country)

    return {
        "markets":weighted["markets"],
        "global_bpi":global_index,
        "national_bpi":national,
        "default_country":default_country,
        "default_bpi":default or global_index,
        "global_volume_24h_btc":weighted["global_volume_24h_btc"],
    }


def aggregate_exchanges(
    markets: list[dict[str,Any]],
) -> dict[str,dict[str,Any]]:
    grouped=defaultdict(list)

    for row in markets:
        if not isinstance(row,dict):
            continue
        exchange=str(row.get("exchange") or "")
        if exchange:
            grouped[exchange].append(row)

    out={}
    for exchange,rows in grouped.items():
        eligible=[
            row for row in rows
            if row.get("index_eligible") is not False
            and positive(row.get("price_usd"))>0
        ]

        volume=sum(
            max(0.0,finite(row.get("volume_24h_btc")))
            for row in eligible
            if math.isfinite(finite(row.get("volume_24h_btc")))
        )

        global_ratio=sum(
            max(0.0,finite(row.get("weight_ratio")))
            for row in eligible
            if math.isfinite(finite(row.get("weight_ratio")))
        )

        if eligible and volume>0:
            price=sum(
                float(row["price_usd"])
                * max(0.0,finite(row.get("volume_24h_btc")))
                for row in eligible
            )/volume
        elif eligible:
            price=sum(
                float(row["price_usd"])
                for row in eligible
            )/len(eligible)
        else:
            price=None

        out[exchange]={
            "label":str(rows[0].get("label") or exchange),
            "price_usd":price,
            "index_eligible":bool(eligible),
            "quote":"MULTI"
                if len({str(row.get("quote") or "") for row in rows})>1
                else str(rows[0].get("quote") or ""),
            "fiat_quotes":sorted({
                str(row.get("quote") or "")
                for row in rows
                if row.get("quote")
            }),
            "market_count":len(rows),
            "eligible_market_count":len(eligible),
            "volume_24h_btc":volume,
            "weight_ratio":global_ratio,
            "weight_decimal":global_ratio,
            "weight_percent_decimal":global_ratio,
            "weight_percent":global_ratio*100.0,
            "weighted_price_contribution_usd":
                (price*global_ratio)
                if price is not None
                else 0.0,
            "updated_at":max(
                (
                    str(row.get("updated_at") or "")
                    for row in rows
                ),
                default=None,
            ),
            "mode":"exchange-global-volume-weight-share",
        }

    return out


def self_test() -> None:
    markets=[
        {
            "exchange":"a",
            "quote":"USD",
            "price_usd":79000,
            "volume_24h_btc":100,
            "index_eligible":True,
        },
        {
            "exchange":"b",
            "quote":"USD",
            "price_usd":81000,
            "volume_24h_btc":300,
            "index_eligible":True,
        },
        {
            "exchange":"c",
            "quote":"EUR",
            "price_usd":80000,
            "volume_24h_btc":600,
            "index_eligible":True,
        },
    ]

    config={
        "default_country":"US",
        "regions":{
            "US":"USD",
            "DE":"EUR",
        },
    }

    result=build_indexes(markets,config)

    assert abs(result["global_bpi"]["weighted_price_usd"]-80200)<1e-9
    assert abs(result["global_bpi"]["unweighted_price_usd"]-80000)<1e-9

    us=result["national_bpi"]["US"]
    assert abs(us["weighted_price_usd"]-80500)<1e-9
    assert abs(us["unweighted_price_usd"]-80000)<1e-9
    assert abs(us["global_weight_share_ratio"]-0.4)<1e-12

    annotated=result["markets"]
    assert abs(annotated[0]["weight_ratio"]-0.1)<1e-12
    assert abs(annotated[1]["weight_percent"]-30.0)<1e-12

    print("bpi_index_engine.py self-test: PASS")


if __name__=="__main__":
    self_test()
