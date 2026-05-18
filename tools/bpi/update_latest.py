#!/usr/bin/env python3
import json, time, argparse, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
API_DIR = ROOT / "bitcoin" / "bpi" / "api"
EXCHANGES = API_DIR / "exchanges.json"
LATEST = API_DIR / "latest.json"
CHANGES = API_DIR / "changes.json"
HISTORY = API_DIR / "history.json"

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

def fetch_json(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent":"ZZX-Labs-BPI/1.0","Accept":"application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def n(x):
    try: return float(x)
    except Exception: return 0.0

def parse(parser, d):
    if parser == "coinbase_stats":
        return {"price_usd":n(d.get("last")), "volume_24h_btc":n(d.get("volume")), "high_24h":n(d.get("high")), "low_24h":n(d.get("low"))}
    if parser == "coinbase_spot":
        return {"price_usd":n(d.get("data",{}).get("amount"))}
    if parser == "kraken_ticker":
        r=d.get("result",{})
        k=r.get("XXBTZUSD") or r.get("XBTUSD") or r.get("BTCUSD") or (list(r.values())[0] if r else {})
        return {"price_usd":n((k.get("c") or [0])[0]), "volume_24h_btc":n((k.get("v") or [0,0])[1]), "high_24h":n((k.get("h") or [0,0])[1]), "low_24h":n((k.get("l") or [0,0])[1])}
    if parser == "gemini_pubticker":
        return {"price_usd":n(d.get("last")), "volume_24h_btc":n(d.get("volume",{}).get("BTC")), "volume_24h_usd":n(d.get("volume",{}).get("USD"))}
    if parser == "bitstamp_ticker":
        return {"price_usd":n(d.get("last")), "volume_24h_btc":n(d.get("volume")), "high_24h":n(d.get("high")), "low_24h":n(d.get("low"))}
    if parser == "bitfinex_v2_ticker" and isinstance(d, list):
        return {"price_usd":n(d[6]), "volume_24h_btc":n(d[7]), "high_24h":n(d[8]), "low_24h":n(d[9])}
    if parser == "okx_ticker":
        t=(d.get("data") or [{}])[0]
        price=n(t.get("last"))
        vb=n(t.get("volCcy24h") or t.get("vol24h"))
        return {"price_usd":price, "volume_24h_btc":vb, "volume_24h_usd":n(t.get("vol24h")), "high_24h":n(t.get("high24h")), "low_24h":n(t.get("low24h"))}
    if parser == "crypto_com_ticker":
        t=(d.get("result",{}).get("data") or [{}])[0]
        return {"price_usd":n(t.get("a") or t.get("last") or t.get("price")), "volume_24h_btc":n(t.get("v") or t.get("volume")), "high_24h":n(t.get("h") or t.get("high")), "low_24h":n(t.get("l") or t.get("low"))}
    if parser == "kucoin_stats":
        t=d.get("data",{})
        return {"price_usd":n(t.get("last")), "volume_24h_btc":n(t.get("vol")), "volume_24h_usd":n(t.get("volValue")), "high_24h":n(t.get("high")), "low_24h":n(t.get("low"))}
    if parser == "gateio_ticker":
        t=d[0] if isinstance(d, list) and d else d
        return {"price_usd":n(t.get("last")), "volume_24h_btc":n(t.get("base_volume")), "volume_24h_usd":n(t.get("quote_volume")), "high_24h":n(t.get("high_24h")), "low_24h":n(t.get("low_24h"))}
    if parser == "bitget_ticker":
        arr=d.get("data") or [{}]
        t=arr[0] if isinstance(arr, list) else arr
        return {"price_usd":n(t.get("lastPr") or t.get("close") or t.get("last")), "volume_24h_btc":n(t.get("baseVolume") or t.get("baseVol")), "volume_24h_usd":n(t.get("quoteVolume") or t.get("usdtVolume")), "high_24h":n(t.get("high24h") or t.get("high")), "low_24h":n(t.get("low24h") or t.get("low"))}
    if parser == "mexc_24hr" or parser == "binance_24hr":
        return {"price_usd":n(d.get("lastPrice")), "volume_24h_btc":n(d.get("volume")), "volume_24h_usd":n(d.get("quoteVolume")), "high_24h":n(d.get("highPrice")), "low_24h":n(d.get("lowPrice"))}
    if parser == "htx_merged":
        t=d.get("tick",{})
        return {"price_usd":n(t.get("close")), "volume_24h_btc":n(t.get("amount")), "volume_24h_usd":n(t.get("vol")), "high_24h":n(t.get("high")), "low_24h":n(t.get("low"))}
    if parser == "okcoin_ticker":
        return {"price_usd":n(d.get("last")), "volume_24h_btc":n(d.get("base_volume_24h")), "volume_24h_usd":n(d.get("quote_volume_24h")), "high_24h":n(d.get("high_24h")), "low_24h":n(d.get("low_24h"))}
    if parser == "coingecko_bitcoin_tickers":
        return parse_coingecko(d)
    return {"price_usd":0}

def parse_coingecko(d):
    weighted=total=vol_usd=0.0
    high=0.0
    low=None
    for t in d.get("tickers", []):
        p=n((t.get("converted_last") or {}).get("usd"))
        vu=n((t.get("converted_volume") or {}).get("usd"))
        if p <= 0 or vu <= 0: continue
        vb=vu/p
        weighted += p*vb
        total += vb
        vol_usd += vu
        high=max(high,p)
        low=p if low is None else min(low,p)
    return {"price_usd": weighted/total if total else 0, "volume_24h_btc": total, "volume_24h_usd": vol_usd, "high_24h": high, "low_24h": low or 0}

def fetch_source(key, src, sources):
    try:
        return parse(src["parser"], fetch_json(src["url"]))
    except Exception:
        if src.get("fallback") == "coingecko" and "coingecko_global" in sources:
            cg=sources["coingecko_global"]
            return parse(cg["parser"], fetch_json(cg["url"]))
        raise

def build_once():
    cfg=read_json(EXCHANGES,{})
    sources=cfg.get("sources",{})
    rows={}
    for key in cfg.get("order", list(sources.keys())):
        if key in ("zzx",): continue
        src=sources.get(key)
        if not src: continue
        try:
            p=fetch_source(key, src, sources)
            if p.get("price_usd",0) > 0:
                rows[key]={**p, "label":src.get("label",key), "source":key, "updated_at":now_iso()}
        except Exception as e:
            rows[key]={"label":src.get("label",key), "source":key, "error":str(e), "updated_at":now_iso()}
    good=[r for r in rows.values() if r.get("price_usd",0)>0 and r.get("volume_24h_btc",0)>0]
    if good:
        vol=sum(r["volume_24h_btc"] for r in good)
        price=sum(r["price_usd"]*r["volume_24h_btc"] for r in good)/vol
    else:
        priced=[r for r in rows.values() if r.get("price_usd",0)>0]
        vol=sum(r.get("volume_24h_btc",0) for r in priced)
        price=sum(r["price_usd"] for r in priced)/len(priced) if priced else 0
    for r in rows.values():
        r["weight"]=(r.get("volume_24h_btc",0)/vol) if vol else 0
    goodprices=[r["price_usd"] for r in rows.values() if r.get("price_usd",0)>0]
    latest={"source":"zzx-global-bpi","mode":"generated","base":"USD","updated_at":now_iso(),
            "price_usd":price,"btc_usd":price,"vwap_usd":price,"bpi_usd":price,
            "volume_24h_btc":vol,"volume_24h_usd":sum(r.get("volume_24h_usd",0) for r in rows.values()),
            "high_24h":max(goodprices) if goodprices else 0,"low_24h":min(goodprices) if goodprices else 0,
            "exchange_count":len([r for r in rows.values() if r.get("price_usd",0)>0]),
            "weighted_average":{"method":"volume_weighted_average_price","sources":len(good),"price_usd":price,"vwap_usd":price,"formula":"sum(price_usd * volume_24h_btc) / sum(volume_24h_btc)"},
            "global_bpi":{"price_usd":price,"vwap_usd":price}, "exchanges":rows}
    prev=read_json(LATEST,{})
    write_json(LATEST, latest)
    if prev.get("price_usd") != latest.get("price_usd"):
        ch=read_json(CHANGES,[])
        if not isinstance(ch,list): ch=[]
        ch.append({"updated_at":latest["updated_at"],"old_price_usd":prev.get("price_usd"),"new_price_usd":latest.get("price_usd")})
        write_json(CHANGES,ch[-1000:])
        hist=read_json(HISTORY,[])
        if not isinstance(hist,list): hist=[]
        hist.append({"updated_at":latest["updated_at"],"price_usd":price,"volume_24h_btc":vol,"exchange_count":latest["exchange_count"]})
        write_json(HISTORY,hist[-10000:])
    print(f"latest ${price:.2f}, {latest['exchange_count']} exchanges")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--interval", type=float, default=0.25)
    args=ap.parse_args()
    if args.loop:
        while True:
            try: build_once()
            except Exception as e: print("ERROR", e)
            time.sleep(args.interval)
    else:
        build_once()

if __name__=="__main__":
    main()
