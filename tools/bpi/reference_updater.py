#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import signal
import time
from pathlib import Path
from typing import Any

from collector import HttpClient, atomic_json, load_json, positive, finite, utcnow

STOP=False


def merge_price(out: dict[str, Any], item: str, usd: Any, source: str, updated_at: str | None=None) -> None:
    n=positive(usd)
    if not math.isfinite(n):
        return
    if item not in out:
        out[item]={"usd":n,"source":source,"updated_at":updated_at or utcnow()}


def parse_stooq(text: str) -> float:
    rows=[r for r in csv.reader(io.StringIO(str(text))) if r]
    if not rows:
        return math.nan
    if len(rows)>=2 and any(str(x).lower()=="close" for x in rows[0]):
        idx=[str(x).lower() for x in rows[0]].index("close")
        return positive(rows[1][idx] if len(rows[1])>idx else None)
    row=rows[-1]
    return positive(row[6] if len(row)>=7 else None)


def update_commodities(root: Path, client: HttpClient) -> None:
    api=root/"bitcoin/bpi/api"
    cfg=load_json(api/"commodity_source_urls.json",{})
    prices={}
    sources={}

    for src in cfg.get("sources",[]):
        if not src.get("enabled",True):
            continue
        result=client.get(src["id"],src["url"])
        if not result.ok:
            continue

        adapter=src.get("adapter")
        payload=result.payload

        try:
            if adapter=="goldprice":
                item=(payload.get("items") or [None])[0] or {}
                merge_price(prices,"gold",item.get("xauPrice") or item.get("goldPrice"),src["id"])
                merge_price(prices,"silver",item.get("xagPrice") or item.get("silverPrice"),src["id"])

            elif adapter=="metals_live":
                if isinstance(payload,list):
                    for row in payload:
                        if not isinstance(row,dict):
                            continue
                        for key,val in row.items():
                            lk=str(key).lower()
                            if "gold" in lk: merge_price(prices,"gold",val,src["id"])
                            elif "silver" in lk: merge_price(prices,"silver",val,src["id"])
                            elif "platinum" in lk: merge_price(prices,"platinum",val,src["id"])
                            elif "palladium" in lk: merge_price(prices,"palladium",val,src["id"])

            elif adapter=="stooq_csv":
                val=parse_stooq(payload)
                if math.isfinite(val):
                    for item in src.get("items",[]):
                        merge_price(prices,item,val,src["id"])
        except Exception:
            continue

    for item,row in prices.items():
        sources[item]=row["source"]

    atomic_json(api/"commodities.json",{
        "schema":"zzx-commodities-v5-master",
        "updated_at":utcnow(),
        "prices":{k:v["usd"] for k,v in prices.items()},
        "sources":sources
    })

    overrides=load_json(api/"reference_overrides.json",{}).get("prices",{})
    refs=dict(prices)
    for item,row in overrides.items():
        if not isinstance(row,dict):
            continue
        usd=positive(row.get("usd"))
        if math.isfinite(usd):
            refs[item]={
                "usd":usd,
                "source":str(row.get("source") or "local curated reference"),
                "updated_at":row.get("updated_at") or utcnow()
            }

    atomic_json(api/"reference_prices.json",{
        "schema":"zzx-bitcoin-ticker-reference-prices-v1",
        "updated_at":utcnow(),
        "prices":refs
    })


def update_debts(root: Path, client: HttpClient) -> None:
    api=root/"bitcoin/bpi/api"
    cfg=load_json(api/"national_debt_source_urls.json",{})
    countries=[]

    for src in cfg.get("sources",[]):
        if not src.get("enabled",True):
            continue
        result=client.get(src["id"],src["url"])
        if not result.ok:
            continue
        try:
            if src.get("adapter")=="us_treasury":
                row=(result.payload.get("data") or [None])[0] or {}
                debt=positive(row.get("tot_pub_debt_out_amt"))
                if math.isfinite(debt):
                    countries.append({
                        "code":"US",
                        "name":"United States",
                        "debt_usd":debt,
                        "source":"U.S. Treasury Fiscal Data",
                        "record_date":row.get("record_date")
                    })
        except Exception:
            continue

    overrides=load_json(api/"national_debt_overrides.json",{}).get("countries",[])
    by_code={str(r.get("code") or r.get("name")):r for r in countries}
    for row in overrides:
        if not isinstance(row,dict):
            continue
        debt=positive(row.get("debt_usd"))
        if not math.isfinite(debt):
            continue
        key=str(row.get("code") or row.get("name"))
        by_code[key]={
            "code":row.get("code"),
            "name":row.get("name") or row.get("code"),
            "debt_usd":debt,
            "source":row.get("source") or "local curated national debt reference",
            "record_date":row.get("record_date") or row.get("updated_at")
        }

    atomic_json(api/"national_debts.json",{
        "schema":"zzx-national-debts-v1",
        "updated_at":utcnow(),
        "countries":sorted(by_code.values(),key=lambda r:str(r.get("name")))
    })


def update_mempool_mirror(root: Path, client: HttpClient) -> None:
    base=root/"bitcoin/mempool.space/api"
    base.mkdir(parents=True,exist_ok=True)

    tip=client.get("mempool_tip","https://mempool.space/api/blocks/tip/height")
    if tip.ok:
        text=str(tip.payload).strip()
        try:
            height=int(text)
            (base/"blocks/tip").mkdir(parents=True,exist_ok=True)
            tmp=base/"blocks/tip/height.tmp"
            tmp.write_text(str(height),encoding="utf-8")
            os.replace(tmp,base/"blocks/tip/height")
        except Exception:
            pass

    blocks=client.get("mempool_blocks","https://mempool.space/api/blocks")
    if blocks.ok and isinstance(blocks.payload,list):
        atomic_json(base/"blocks",blocks.payload)


def update_bitnodes_mirror(root: Path, client: HttpClient) -> None:
    result=client.get("btcnodes_latest","https://btcnodes.io/api/v1/snapshots/latest/")
    if not result.ok or not isinstance(result.payload,(dict,list)):
        return
    out=root/"bitcoin/bitnodes/api/zzxbitnodes/latest.json"
    atomic_json(out,result.payload)


def handler(_signum: int,_frame: Any)->None:
    global STOP
    STOP=True


def main()->int:
    parser=argparse.ArgumentParser()
    parser.add_argument("--root",default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--proxy",default=os.environ.get("ZZX_BPI_PROXY"))
    parser.add_argument("--once",action="store_true")
    args=parser.parse_args()

    signal.signal(signal.SIGINT,handler)
    signal.signal(signal.SIGTERM,handler)

    root=Path(args.root).resolve()
    client=HttpClient(proxy_url=args.proxy)

    next_ref=0.0
    next_debt=0.0
    next_mempool=0.0
    next_nodes=0.0

    while not STOP:
        now=time.monotonic()

        if now>=next_ref:
            update_commodities(root,client)
            next_ref=now+60

        if now>=next_debt:
            update_debts(root,client)
            next_debt=now+1800

        if now>=next_mempool:
            update_mempool_mirror(root,client)
            next_mempool=now+15

        if now>=next_nodes:
            update_bitnodes_mirror(root,client)
            next_nodes=now+60

        if args.once:
            break

        time.sleep(1.0)

    return 0


if __name__=="__main__":
    raise SystemExit(main())
