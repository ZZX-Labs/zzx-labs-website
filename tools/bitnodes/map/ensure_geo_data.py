#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import io
import json
import shutil
import time
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

DBIP_BASE = "https://download.db-ip.com/free"
GEONAMES_BASE = "https://download.geonames.org/export/dump"
DBIP_NAMES = ("city", "asn", "country")
GEONAMES_TEXT = ("admin1CodesASCII.txt", "admin2Codes.txt")
GEONAMES_ZIP = "cities500.zip"
GEONAMES_CITY = "cities500.txt"


def month_candidates(back: int) -> list[str]:
    now = datetime.now(timezone.utc)
    year, month = now.year, now.month
    out=[]
    for _ in range(max(1,int(back))):
        out.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return out


def fetch_bytes(url: str, *, timeout: int, retries: int) -> bytes:
    last=None
    for attempt in range(1,max(1,retries)+1):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"ZZX-Labs-Bitnodes-MapHost/10.4"})
            with urllib.request.urlopen(req,timeout=timeout) as resp:
                data=resp.read()
            if not data:
                raise RuntimeError("empty response")
            return data
        except Exception as exc:
            last=exc
            if attempt < max(1,retries):
                time.sleep(min(5,attempt))
    raise RuntimeError(f"download failed: {url}: {last}")


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def ensure_dbip(geoip_dir: Path, *, months_back: int, timeout: int, retries: int) -> list[dict]:
    geoip_dir.mkdir(parents=True,exist_ok=True)
    results=[]
    for name in DBIP_NAMES:
        out=geoip_dir/f"dbip-{name}-lite.mmdb"
        if out.is_file() and out.stat().st_size > 65536:
            results.append({"name":name,"path":str(out),"mode":"existing","bytes":out.stat().st_size})
            continue
        last=None
        for month in month_candidates(months_back):
            url=f"{DBIP_BASE}/dbip-{name}-lite-{month}.mmdb.gz"
            try:
                compressed=fetch_bytes(url,timeout=timeout,retries=retries)
                data=gzip.decompress(compressed)
                if len(data) <= 65536:
                    raise RuntimeError(f"decompressed MMDB unexpectedly small: {len(data)}")
                atomic_write(out,data)
                results.append({"name":name,"path":str(out),"mode":"download","month":month,"url":url,"bytes":len(data)})
                break
            except Exception as exc:
                last=exc
        else:
            raise RuntimeError(f"could not obtain DB-IP {name} Lite database: {last}")
    return results


def ensure_geonames(geo_root: Path, *, timeout: int, retries: int) -> list[dict]:
    source=geo_root/'sources'
    source.mkdir(parents=True,exist_ok=True)
    results=[]
    for filename in GEONAMES_TEXT:
        out=source/filename
        if out.is_file() and out.stat().st_size > 1000:
            results.append({"name":filename,"path":str(out),"mode":"existing","bytes":out.stat().st_size})
            continue
        url=f"{GEONAMES_BASE}/{filename}"
        data=fetch_bytes(url,timeout=timeout,retries=retries)
        if len(data) <= 1000:
            raise RuntimeError(f"GeoNames file unexpectedly small: {filename}")
        atomic_write(out,data)
        results.append({"name":filename,"path":str(out),"mode":"download","url":url,"bytes":len(data)})

    city=source/GEONAMES_CITY
    if city.is_file() and city.stat().st_size > 10000:
        results.append({"name":GEONAMES_CITY,"path":str(city),"mode":"existing","bytes":city.stat().st_size})
    else:
        url=f"{GEONAMES_BASE}/{GEONAMES_ZIP}"
        data=fetch_bytes(url,timeout=timeout,retries=retries)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            member=next((n for n in zf.namelist() if n.endswith('/'+GEONAMES_CITY) or n==GEONAMES_CITY),None)
            if not member:
                raise RuntimeError(f"{GEONAMES_ZIP} did not contain {GEONAMES_CITY}")
            raw=zf.read(member)
        if len(raw) <= 10000:
            raise RuntimeError(f"GeoNames city file unexpectedly small: {len(raw)}")
        atomic_write(city,raw)
        results.append({"name":GEONAMES_CITY,"path":str(city),"mode":"download","url":url,"bytes":len(raw)})
    return results


def verify(geoip_dir: Path, geo_root: Path) -> dict:
    required=[
        geoip_dir/'dbip-city-lite.mmdb',
        geoip_dir/'dbip-asn-lite.mmdb',
        geoip_dir/'dbip-country-lite.mmdb',
        geo_root/'sources'/'admin1CodesASCII.txt',
        geo_root/'sources'/'admin2Codes.txt',
        geo_root/'sources'/'cities500.txt',
    ]
    missing=[str(p) for p in required if not p.is_file() or p.stat().st_size <= 0]
    if missing:
        raise RuntimeError(f"geodata verification failed: {missing}")
    return {"schema":"zzx-bitnodes-map-geodata-v1","files":[{"path":str(p),"bytes":p.stat().st_size} for p in required]}


def main() -> int:
    ap=argparse.ArgumentParser(description="Ensure DB-IP Lite + GeoNames files required by Bitnodes Map Host IP geolocation.")
    ap.add_argument('--geoip-dir',required=True)
    ap.add_argument('--geo-root',required=True)
    ap.add_argument('--months-back',type=int,default=6)
    ap.add_argument('--timeout',type=int,default=60)
    ap.add_argument('--retries',type=int,default=3)
    ap.add_argument('--report',default='')
    ap.add_argument('--verify-only',action='store_true')
    args=ap.parse_args()
    geoip=Path(args.geoip_dir); geo=Path(args.geo_root)
    if args.verify_only:
        report=verify(geoip,geo)
    else:
        report={"schema":"zzx-bitnodes-map-geodata-v1","dbip":ensure_dbip(geoip,months_back=args.months_back,timeout=args.timeout,retries=args.retries),"geonames":ensure_geonames(geo,timeout=args.timeout,retries=args.retries)}
        report.update(verify(geoip,geo))
    if args.report:
        Path(args.report).parent.mkdir(parents=True,exist_ok=True)
        Path(args.report).write_text(json.dumps(report,indent=2)+"\n",encoding='utf-8')
    print(json.dumps(report))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
