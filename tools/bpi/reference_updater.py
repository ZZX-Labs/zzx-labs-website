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
from update_sovereign_data import update_sovereign_data

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



def apply_catalog_derivations(root: Path, refs: dict[str, Any]) -> None:
    """Derive exact unit-price equivalents declared by the catalog.

    This never invents a market value.  A derived row exists only when a
    verified base reference is present and the catalog explicitly declares the
    multiplicative unit conversion.  Multiple passes permit a short derivation
    chain while cycle protection is implicit because existing rows are never
    overwritten.
    """
    catalog=load_json(
        root/"__partials/widgets/bitcoin-ticker/reference-catalog.json",
        {},
    )
    items=catalog.get("items") or []
    by_id={
        str(row.get("id")): row
        for row in items
        if isinstance(row,dict) and row.get("id")
    }

    for _pass in range(8):
        added=0
        for item_id,row in by_id.items():
            if item_id in refs:
                continue
            base_id=str(row.get("derived_from") or "")
            if not base_id or base_id not in refs:
                continue
            factor=positive(row.get("derived_factor"))
            if not math.isfinite(factor):
                continue
            base=refs.get(base_id)
            if not isinstance(base,dict):
                continue
            base_usd=positive(base.get("usd"))
            if not math.isfinite(base_usd):
                continue
            refs[item_id]={
                "usd": base_usd*factor,
                "source": str(base.get("source") or "reference feed"),
                "updated_at": base.get("updated_at") or utcnow(),
                "reference_geography": "US",
                "reference_currency": "USD",
                "derived": True,
                "derived_from": base_id,
                "derived_factor": factor,
            }
            added+=1
        if not added:
            break

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

    # Carry forward last-known-good references through transient public-source
    # failures.  Row timestamps remain the source timestamps, so stale data is
    # visible rather than being silently presented as fresh.
    previous=load_json(api/"reference_prices.json",{}).get("prices",{})
    refs={}
    if isinstance(previous,dict):
        for item,row in previous.items():
            if not isinstance(row,dict):
                continue
            usd=positive(row.get("usd"))
            if math.isfinite(usd):
                refs[str(item)]=dict(row)

    # Fresh public values always supersede carried-forward rows.
    refs.update(prices)
    for item,row in overrides.items():
        if not isinstance(row,dict):
            continue
        usd=positive(row.get("usd"))
        if math.isfinite(usd):
            refs[item]={
                "usd":usd,
                "source":str(row.get("source") or "local curated reference"),
                "updated_at":row.get("updated_at") or utcnow(),
                "reference_geography":"US",
                "reference_currency":"USD",
            }

    apply_catalog_derivations(root,refs)

    atomic_json(api/"reference_prices.json",{
        "schema":"zzx-bitcoin-ticker-reference-prices-v2",
        "reference_geography":"US",
        "reference_currency":"USD",
        "updated_at":utcnow(),
        "prices":refs
    })


def update_debts(root: Path, client: HttpClient) -> None:
    try:
        update_sovereign_data(
            root,
            client,
            minimum_available=10,
        )
    except Exception as exc:
        # Preserve the last valid sovereign mirrors on transient public-API failure.
        print(f"SOVEREIGN_UPDATE_FAIL: {exc}")


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
    parser.add_argument(
        "--references-only",
        action="store_true",
        help="Update commodity/reference-market mirrors once and exit."
    )
    parser.add_argument(
        "--bpi-only",
        action="store_true",
        help="Run persistently for BPI reference/debt data without touching Bitnodes or mempool mirrors."
    )
    args=parser.parse_args()

    signal.signal(signal.SIGINT,handler)
    signal.signal(signal.SIGTERM,handler)

    root=Path(args.root).resolve()
    client=HttpClient(proxy_url=args.proxy)

    next_ref=0.0
    next_debt=0.0
    next_mempool=0.0
    next_nodes=0.0

    if args.references_only:
        update_commodities(root,client)
        return 0

    while not STOP:
        now=time.monotonic()

        if now>=next_ref:
            update_commodities(root,client)
            next_ref=now+60

        if now>=next_debt:
            update_debts(root,client)
            next_debt=now+21600

        if not args.bpi_only and now>=next_mempool:
            update_mempool_mirror(root,client)
            next_mempool=now+15

        if not args.bpi_only and now>=next_nodes:
            update_bitnodes_mirror(root,client)
            next_nodes=now+60

        if args.once:
            break

        time.sleep(1.0)

    return 0


if __name__=="__main__":
    raise SystemExit(main())
