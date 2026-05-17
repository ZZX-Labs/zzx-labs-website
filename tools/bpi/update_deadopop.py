#!/usr/bin/env python3
from __future__ import annotations
import json, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
ROOT = Path(__file__).resolve().parents[2]
API_DIR = ROOT / 'bitcoin' / 'bpi' / 'api'
DEADOPOP=API_DIR/'deadopop.json'; CHANGES=API_DIR/'changes.json'
UA='ZZX-Labs-DeadOPop/1.0'
def now_iso(): return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def fetch_json(url, timeout=30):
    req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':'application/json'})
    with urllib.request.urlopen(req,timeout=timeout) as r: return json.loads(r.read().decode('utf-8'))
def read_json(path, fallback):
    try: return json.loads(Path(path).read_text(encoding='utf-8'))
    except Exception: return fallback
def write_json(path, data): Path(path).parent.mkdir(parents=True,exist_ok=True); Path(path).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def fetch_markets(max_pages=10):
    rows=[]
    for page in range(1,max_pages+1):
        qs=urllib.parse.urlencode({'vs_currency':'usd','order':'market_cap_desc','per_page':250,'page':page,'sparkline':'false'})
        data=fetch_json('https://api.coingecko.com/api/v3/coins/markets?'+qs)
        if not data: break
        rows.extend(data)
    return rows
def main():
    rows=fetch_markets(); non_btc=[r for r in rows if r.get('id')!='bitcoin' and str(r.get('symbol','')).lower()!='btc']
    alive=0.0; coins=[]
    for r in non_btc:
        try: mc=float(r.get('market_cap') or 0)
        except Exception: mc=0.0
        if mc>0: alive += mc
        coins.append({'id':r.get('id'),'symbol':r.get('symbol'),'name':r.get('name'),'market_cap_usd':mc,'current_price_usd':r.get('current_price')})
    output={'source':'coingecko','mode':'generated','updated_at':now_iso(),'alive_market_cap_usd':round(alive,2),'dead_market_cap_usd':None,'total_non_btc_market_cap_usd':round(alive,2),'coins_count':len(coins),'sample_size':len(rows),'coins':coins,'note':'dead_market_cap_usd is null unless a reliable dead/defunct coin source is added.'}
    old=read_json(DEADOPOP,{}); write_json(DEADOPOP,output)
    if old.get('total_non_btc_market_cap_usd') != output.get('total_non_btc_market_cap_usd'):
        changes=read_json(CHANGES,[]); changes = changes if isinstance(changes,list) else []
        changes.append({'updated_at':output['updated_at'],'type':'deadopop','old_total':old.get('total_non_btc_market_cap_usd'),'new_total':output.get('total_non_btc_market_cap_usd')})
        write_json(CHANGES,changes[-1000:])
    print(f"updated deadopop.json non_btc_market_cap={output['total_non_btc_market_cap_usd']}")
if __name__=='__main__': main()
