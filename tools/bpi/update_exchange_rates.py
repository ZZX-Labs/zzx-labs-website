#!/usr/bin/env python3
import json, time, argparse, urllib.request
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT=Path(__file__).resolve().parents[2]
API=ROOT/"bitcoin"/"bpi"/"api"
CURRENCIES=API/"currencies.json"
EXCHANGE_RATES=API/"exchange_rates.json"

def now_iso(): return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
def read_json(p,f):
    try: return json.loads(p.read_text(encoding="utf-8"))
    except Exception: return f
def write_json(p,d):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
def fetch_json(url):
    req=urllib.request.Request(url,headers={"User-Agent":"ZZX-Labs-BPI/1.0","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=25) as r: return json.loads(r.read().decode())
def fetch_frankfurter(codes):
    rates={"USD":1}
    wanted=[c for c in codes if c!="USD"]
    # Frankfurter supports many but not all; query in chunks.
    for i in range(0,len(wanted),20):
        chunk=wanted[i:i+20]
        try:
            d=fetch_json("https://api.frankfurter.app/latest?from=USD&to="+",".join(chunk))
            for k,v in d.get("rates",{}).items(): rates[k]=float(v)
        except Exception:
            pass
    return rates
def fetch_erapi(codes, rates):
    try:
        d=fetch_json("https://open.er-api.com/v6/latest/USD")
        rr=d.get("rates",{})
        for c in codes:
            if c not in rates and c in rr:
                rates[c]=float(rr[c])
    except Exception:
        pass
    return rates
def build_once():
    cur=read_json(CURRENCIES,{"order":["USD"]})
    codes=cur.get("order",["USD"])
    rates=fetch_frankfurter(codes)
    rates=fetch_erapi(codes,rates)
    # Metals/oil/weed are generated values only when a configured provider or admin value is available.
    prev=read_json(EXCHANGE_RATES,{})
    out={
      "base":"USD","updated_at":now_iso(),
      "next_update_after":(datetime.now(timezone.utc)+timedelta(seconds=1800)).isoformat().replace("+00:00","Z"),
      "update_interval_seconds":1800,
      "sources":{"fiat_primary":"frankfurter","fiat_fallback":"open.er-api.com","commodities":"admin_or_provider_generated"},
      "rates":{c:rates[c] for c in codes if c in rates},
      "assets_usd":prev.get("assets_usd",{}),
      "commodities_usd":prev.get("commodities_usd",{}),
      "user_values_usd":prev.get("user_values_usd",{})
    }
    write_json(EXCHANGE_RATES,out)
    print("exchange_rates updated", len(out["rates"]), "fiat rates")
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--interval", type=float, default=1800)
    args=ap.parse_args()
    if args.loop:
        while True:
            try: build_once()
            except Exception as e: print("ERROR",e)
            time.sleep(args.interval)
    else:
        build_once()
if __name__=="__main__": main()
