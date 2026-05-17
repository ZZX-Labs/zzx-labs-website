#!/usr/bin/env python3
from __future__ import annotations
import json, math, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
ROOT = Path(__file__).resolve().parents[2]
API_DIR = ROOT / 'bitcoin' / 'bpi' / 'api'
EXCHANGES = API_DIR / 'exchanges.json'; LATEST = API_DIR / 'latest.json'; CHANGES = API_DIR / 'changes.json'; HISTORY = API_DIR / 'history.json'
COINGECKO_TICKERS = 'https://api.coingecko.com/api/v3/coins/bitcoin/tickers?include_exchange_logo=false&depth=false&order=volume_desc'
UA = 'ZZX-Labs-BPI/1.0 (+https://zzx-labs.io/bitcoin/bpi/)'
def now_iso(): return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def read_json(path, fallback):
    try: return json.loads(Path(path).read_text(encoding='utf-8'))
    except Exception: return fallback
def write_json(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True); Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
def fetch_json(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent':UA,'Accept':'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read().decode('utf-8'))
def finite(x):
    try:
        f=float(x); return f if math.isfinite(f) else float('nan')
    except Exception: return float('nan')
def valid(x):
    f=finite(x); return math.isfinite(f) and f>0
def norm(price=None, volume_btc=None, volume_usd=None, high=None, low=None):
    p=finite(price); vb=finite(volume_btc); vu=finite(volume_usd); hi=finite(high); lo=finite(low)
    if (not math.isfinite(vb) or vb<=0) and math.isfinite(vu) and vu>0 and valid(p): vb=vu/p
    if (not math.isfinite(vu) or vu<=0) and math.isfinite(vb) and vb>0 and valid(p): vu=vb*p
    return {'price_usd':p if valid(p) else 0.0,'volume_24h_btc':vb if math.isfinite(vb) and vb>0 else 0.0,'volume_24h_usd':vu if math.isfinite(vu) and vu>0 else 0.0,'high_24h':hi if valid(hi) else 0.0,'low_24h':lo if valid(lo) else 0.0}
def parse_exchange(parser, d):
    if parser=='coinbase_stats': return norm(d.get('last'), d.get('volume'), None, d.get('high'), d.get('low'))
    if parser=='coinbase_spot': return norm((d.get('data') or {}).get('amount'))
    if parser=='kraken_ticker':
        r=d.get('result') or {}; k=r.get('XXBTZUSD') or r.get('XBTUSD') or r.get('BTCUSD') or next(iter(r.values()), {})
        return norm((k.get('c') or [None])[0], (k.get('v') or [None,None])[1], None, (k.get('h') or [None,None])[1], (k.get('l') or [None,None])[1])
    if parser=='gemini_pubticker':
        v=d.get('volume') or {}; return norm(d.get('last'), v.get('BTC'), v.get('USD'))
    if parser=='bitstamp_ticker': return norm(d.get('last'), d.get('volume'), None, d.get('high'), d.get('low'))
    if parser=='bitfinex_v2_ticker': return norm(d[6] if isinstance(d,list) and len(d)>6 else None, d[7] if isinstance(d,list) and len(d)>7 else None, None, d[8] if isinstance(d,list) and len(d)>8 else None, d[9] if isinstance(d,list) and len(d)>9 else None)
    if parser=='okx_ticker':
        t=(d.get('data') or [{}])[0]; return norm(t.get('last'), t.get('vol24h'), t.get('volCcy24h'), t.get('high24h'), t.get('low24h'))
    if parser=='crypto_com_ticker':
        t=((d.get('result') or {}).get('data') or [{}])[0]; return norm(t.get('a') or t.get('last'), t.get('v'), None, t.get('h'), t.get('l'))
    if parser=='kucoin_stats':
        t=d.get('data') or {}; return norm(t.get('last'), t.get('vol'), t.get('volValue'), t.get('high'), t.get('low'))
    if parser=='gateio_ticker':
        t=d[0] if isinstance(d,list) and d else d; return norm(t.get('last'), t.get('base_volume'), t.get('quote_volume'), t.get('high_24h'), t.get('low_24h'))
    if parser=='bitget_ticker':
        data=d.get('data') or [{}]; t=data[0] if isinstance(data,list) else data; return norm(t.get('lastPr') or t.get('last'), t.get('baseVolume'), t.get('quoteVolume') or t.get('usdtVolume'), t.get('high24h'), t.get('low24h'))
    if parser in ('mexc_24hr','binance_24hr'): return norm(d.get('lastPrice'), d.get('volume'), d.get('quoteVolume'), d.get('highPrice'), d.get('lowPrice'))
    if parser=='htx_merged':
        t=d.get('tick') or {}; return norm(t.get('close'), t.get('amount'), t.get('vol'), t.get('high'), t.get('low'))
    if parser=='okcoin_ticker': return norm(d.get('last'), d.get('base_volume_24h'), d.get('quote_volume_24h'), d.get('high_24h'), d.get('low_24h'))
    if parser=='zzx_bpi': return norm(d.get('price_usd') or d.get('vwap_usd') or ((d.get('weighted_average') or {}).get('price_usd')), d.get('volume_24h_btc'), None, d.get('high_24h'), d.get('low_24h'))
    raise ValueError('unknown parser '+parser)
def coingecko_tickers():
    data=fetch_json(COINGECKO_TICKERS); out={}
    for t in data.get('tickers',[]):
        m=t.get('market') or {}; key=m.get('identifier') or m.get('name'); p=finite((t.get('converted_last') or {}).get('usd')); vu=finite((t.get('converted_volume') or {}).get('usd'))
        if not key or not valid(p): continue
        vb=vu/p if math.isfinite(vu) and vu>0 else 0.0
        prev=out.get(key)
        if not prev or vu>prev.get('volume_24h_usd',0): out[key]=norm(p,vb,vu)
    return out
def compute(rows):
    usable=[r for r in rows if valid(r['price_usd'])]; vol=[r for r in usable if finite(r.get('volume_24h_btc'))>0]
    if vol:
        total=sum(float(r['volume_24h_btc']) for r in vol); price=sum(float(r['price_usd'])*float(r['volume_24h_btc']) for r in vol)/total
    else:
        total=0.0; price=sum(float(r['price_usd']) for r in usable)/len(usable)
    highs=[float(r.get('high_24h') or r['price_usd']) for r in usable]; lows=[float(r.get('low_24h') or r['price_usd']) for r in usable]
    ex={}
    for r in usable:
        w=(float(r.get('volume_24h_btc') or 0)/total) if total>0 else 0
        ex[r['key']]={'label':r['label'],'price_usd':round(float(r['price_usd']),8),'volume_24h_btc':round(float(r.get('volume_24h_btc') or 0),8),'volume_24h_usd':round(float(r.get('volume_24h_usd') or 0),2),'high_24h':round(float(r.get('high_24h') or 0),8),'low_24h':round(float(r.get('low_24h') or 0),8),'weight':round(w,12),'status':r.get('status','ok'),'source':r.get('source','direct'),'updated_at':r.get('updated_at')}
    ts=now_iso(); return {'source':'zzx-global-bpi','mode':'generated','base':'USD','updated_at':ts,'price_usd':round(price,8),'btc_usd':round(price,8),'vwap_usd':round(price,8),'bpi_usd':round(price,8),'volume_24h_btc':round(total,8),'high_24h':round(max(highs),8),'low_24h':round(min(lows),8),'exchange_count':len(ex),'weighted_average':{'method':'volume_weighted_average_price','sources':len(ex),'price_usd':round(price,8),'vwap_usd':round(price,8),'formula':'sum(price_usd * volume_24h_btc) / sum(volume_24h_btc)'},'global_bpi':{'price_usd':round(price,8),'vwap_usd':round(price,8)},'exchanges':ex}
def main():
    cfg=read_json(EXCHANGES,{}); sources=cfg.get('sources',{}); order=[k for k in cfg.get('order',list(sources.keys())) if k in sources and k not in {'zzx','coingecko_global'}]
    cg=None; rows=[]
    for key in order:
        src=sources[key]
        try:
            parsed=parse_exchange(src['parser'], fetch_json(src['url']))
            if not valid(parsed['price_usd']): raise ValueError('invalid direct price')
            rows.append({'key':key,'label':src.get('label',key),**parsed,'status':'ok','source':'direct','updated_at':now_iso()})
        except Exception as e:
            if src.get('fallback')=='coingecko':
                try:
                    if cg is None: cg=coingecko_tickers()
                    cgkey=key.replace('_','-'); val=cg.get(key) or cg.get(cgkey) or cg.get(src.get('label',''))
                    if val and valid(val['price_usd']): rows.append({'key':key,'label':src.get('label',key),**val,'status':'fallback','source':'coingecko','updated_at':now_iso(),'error':str(e)}); continue
                except Exception: pass
            print(f'WARN {key}: {e}', file=sys.stderr)
    if not rows:
        cg=coingecko_tickers()
        for k,v in list(cg.items())[:100]: rows.append({'key':k,'label':k,**v,'status':'fallback','source':'coingecko','updated_at':now_iso()})
    if not rows: raise SystemExit('No usable BTC market rows.')
    prev=read_json(LATEST,{}); latest=compute(rows); write_json(LATEST,latest)
    if prev.get('price_usd') != latest.get('price_usd'):
        changes=read_json(CHANGES,[]); changes = changes if isinstance(changes,list) else []
        changes.append({'updated_at':latest['updated_at'],'old_price_usd':prev.get('price_usd'),'new_price_usd':latest.get('price_usd'),'exchange_count':latest['exchange_count'],'volume_24h_btc':latest['volume_24h_btc']}); write_json(CHANGES, changes[-1000:])
        history=read_json(HISTORY,[]); history = history if isinstance(history,list) else []
        history.append({'updated_at':latest['updated_at'],'price_usd':latest.get('price_usd'),'volume_24h_btc':latest['volume_24h_btc'],'exchange_count':latest['exchange_count']}); write_json(HISTORY, history[-10000:])
    print(f"updated latest.json price_usd={latest['price_usd']} exchanges={latest['exchange_count']}")
if __name__=='__main__': main()
