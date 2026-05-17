#!/usr/bin/env python3
from __future__ import annotations
import csv, json, os, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
ROOT = Path(__file__).resolve().parents[2]
API_DIR = ROOT / 'bitcoin' / 'bpi' / 'api'
CURRENCIES=API_DIR/'currencies.json'; COMMODITIES=API_DIR/'commodities.json'; EXCHANGE_RATES=API_DIR/'exchange_rates.json'; CHANGES=API_DIR/'changes.json'
UA='ZZX-Labs-BPI-Rates/1.0'
def now_iso(): return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def read_json(path, fallback):
    try: return json.loads(Path(path).read_text(encoding='utf-8'))
    except Exception: return fallback
def write_json(path, data): Path(path).parent.mkdir(parents=True,exist_ok=True); Path(path).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def fetch_text(url, timeout=20):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'*/*'})
    with urllib.request.urlopen(req,timeout=timeout) as r: return r.read().decode('utf-8',errors='replace')
def fetch_json(url, timeout=20): return json.loads(fetch_text(url,timeout))
def num(x):
    try:
        v=float(x); return v if v>0 else None
    except Exception: return None
def frankfurter(codes):
    wanted=[c for c in codes if c!='USD']; out={'USD':1.0}
    if not wanted: return out
    data=fetch_json('https://api.frankfurter.app/latest?from=USD&to='+','.join(wanted))
    for k,v in (data.get('rates') or {}).items():
        nv=num(v)
        if nv: out[k]=nv
    return out
def er_api(codes):
    out={}; data=fetch_json('https://open.er-api.com/v6/latest/USD'); rates=data.get('rates') or {}
    for c in codes:
        nv=num(rates.get(c))
        if nv: out[c]=nv
    return out
def parse_stooq_csv_close(text):
    rows=list(csv.DictReader(text.splitlines()))
    if not rows: return None
    row=rows[-1]
    for key in ('Close','close','Last','last'):
        if key in row: return num(row[key])
    return None
def parse_json_usd(data):
    if isinstance(data,dict):
        for key in ('usd','price_usd','value_usd','price','last'):
            if key in data:
                v=num(data[key])
                if v: return v
    return None
def fetch_commodity(code, meta):
    for api in meta.get('apis',[]):
        url=api.get('url')
        if api.get('name')=='env_url': url=os.getenv(api.get('env') or '')
        if not url: continue
        try:
            parser=api.get('parser')
            if parser=='stooq_csv_close': return parse_stooq_csv_close(fetch_text(url))
            if parser=='json_usd': return parse_json_usd(fetch_json(url))
        except Exception: continue
    return None
def main():
    currencies=read_json(CURRENCIES,{}); commodities=read_json(COMMODITIES,{}); previous=read_json(EXCHANGE_RATES,{})
    codes=currencies.get('order',['USD']); rates={}
    try: rates.update(frankfurter(codes))
    except Exception: rates['USD']=1.0
    missing=[c for c in codes if c not in rates]
    if missing:
        try: rates.update(er_api(missing))
        except Exception: pass
    rates['USD']=1.0
    commodities_usd={}
    for code, meta in (commodities.get('sources') or {}).items():
        val=fetch_commodity(code, meta)
        if val: commodities_usd[code]=val
    output={'base':'USD','updated_at':now_iso(),'sources':{'primary_fx':'frankfurter','fallback_fx':'open.er-api.com','commodities':'commodities.json'},'rates':rates,'assets_usd':{},'commodities_usd':commodities_usd}
    write_json(EXCHANGE_RATES,output)
    if output != previous:
        changes=read_json(CHANGES,[]); changes = changes if isinstance(changes,list) else []
        changes.append({'updated_at':output['updated_at'],'type':'exchange_rates','rates_count':len(rates),'commodities_count':len(commodities_usd)})
        write_json(CHANGES,changes[-1000:])
    print(f"updated exchange_rates.json rates={len(rates)} commodities={len(commodities_usd)}")
if __name__=='__main__': main()
