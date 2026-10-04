#!/usr/bin/env python3
"""
Normalize CIA World Factbook electricity extracts and current grid observations.

This utility is intentionally source-agnostic: it consumes JSON/CSV exports
collected elsewhere and never invents missing values.

Expected canonical historical record fields:
  country, year, electricity_generation_kwh, electricity_consumption_kwh,
  installed_capacity_kw, generation_by_source_pct, source

Expected live row fields:
  country, timezone, generationMW, loadMW, peakMW, capacityMW, mix, hourly, source
"""
from __future__ import annotations
import argparse, csv, json, math
from pathlib import Path
from typing import Any

def finite(v):
    if v is None or v == "": return None
    try: n=float(str(v).replace(",",""))
    except (TypeError,ValueError): return None
    return n if math.isfinite(n) else None

def iso(v):
    s=str(v or "").strip().upper()
    return s if len(s)==2 and s.isalpha() else ""

def read_any(path: Path):
    if path.suffix.lower()==".csv":
        with path.open(newline="",encoding="utf-8-sig") as f:return list(csv.DictReader(f))
    return json.loads(path.read_text(encoding="utf-8"))

ALIASES={
    "country":["country","country_code","iso","iso2"],
    "year":["year","date_year"],
    "electricity_generation_kwh":["electricity_generation_kwh","generation_kwh","electricity_production_kwh","electricity_production"],
    "electricity_consumption_kwh":["electricity_consumption_kwh","consumption_kwh","electricity_consumption"],
    "installed_capacity_kw":["installed_capacity_kw","capacity_kw","electricity_installed_generating_capacity_kw"],
}

def first(row,names):
    for n in names:
        if n in row and row[n] not in (None,""): return row[n]
    return None

def normalize_factbook(data, source_name):
    rows=data.get("records",data) if isinstance(data,dict) else data
    out=[]
    for row in rows:
        if not isinstance(row,dict):continue
        cc=iso(first(row,ALIASES["country"]))
        if not cc:continue
        year=finite(first(row,ALIASES["year"]))
        gen=finite(first(row,ALIASES["electricity_generation_kwh"]))
        use=finite(first(row,ALIASES["electricity_consumption_kwh"]))
        cap=finite(first(row,ALIASES["installed_capacity_kw"]))
        mix=row.get("generation_by_source_pct") or row.get("mix") or {}
        if all(v is None for v in (gen,use,cap)) and not mix: continue
        out.append({
            "country":cc,"year":int(year) if year is not None else None,
            "electricity_generation_kwh":gen,
            "electricity_consumption_kwh":use,
            "installed_capacity_kw":cap,
            "generation_by_source_pct":mix,
            "source":str(row.get("source") or source_name)
        })
    return out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--factbook",type=Path,action="append",default=[])
    ap.add_argument("--live",type=Path)
    ap.add_argument("--out-dir",type=Path,required=True)
    args=ap.parse_args()
    args.out_dir.mkdir(parents=True,exist_ok=True)

    records=[]
    for path in args.factbook:
        records.extend(normalize_factbook(read_any(path),path.name))
    records.sort(key=lambda r:(r["country"],r["year"] or -1))
    (args.out_dir/"factbook-history.json").write_text(json.dumps({
        "schema":"zzx-global-power-grid-factbook-history-v1",
        "records":records
    },indent=2)+"\n",encoding="utf-8")

    if args.live:
        data=read_any(args.live)
        rows=data.get("countries",data) if isinstance(data,dict) else data
        (args.out_dir/"live-grid.json").write_text(json.dumps({
            "schema":"zzx-global-power-grid-live-v1",
            "countries":rows
        },indent=2)+"\n",encoding="utf-8")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
