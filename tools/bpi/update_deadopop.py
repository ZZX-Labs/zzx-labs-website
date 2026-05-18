#!/usr/bin/env python3
import json, time, argparse, urllib.request
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/"bitcoin"/"bpi"/"api"/"deadopop.json"
def now_iso(): return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
def write_json(p,d):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
def fetch_json(url):
    req=urllib.request.Request(url,headers={"User-Agent":"ZZX-Labs-DeadOPop/1.0","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=25) as r: return json.loads(r.read().decode())
def build_once():
    total=0.0
    alive=0.0
    count=0
    # CoinGecko free endpoint is paged; this intentionally avoids Bitcoin and sums non-BTC market caps from accessible current markets.
    for page in range(1,6):
        d=fetch_json(f"https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page={page}&sparkline=false")
        if not isinstance(d,list) or not d: break
        for coin in d:
            if coin.get("id")=="bitcoin" or coin.get("symbol")=="btc": continue
            mc=float(coin.get("market_cap") or 0)
            total += mc
            alive += mc
            count += 1
    out={"updated_at":now_iso(),"source":"coingecko_current_markets","non_bitcoin_assets_count":count,
         "alive_non_bitcoin_market_cap_usd":alive,
         "dead_or_inactive_market_cap_usd":None,
         "total_non_bitcoin_market_cap_usd":total,
         "note":"Dead/inactive historical loss requires a separate archival dataset; current free API only reflects currently listed markets."}
    write_json(OUT,out)
    print("deadopop updated", count)
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--interval", type=float, default=3600)
    args=ap.parse_args()
    if args.loop:
        while True:
            try: build_once()
            except Exception as e: print("ERROR",e)
            time.sleep(args.interval)
    else:
        build_once()
if __name__=="__main__": main()
