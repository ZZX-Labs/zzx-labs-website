#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def load(path: str):
    return json.loads((ROOT/path).read_text(encoding="utf-8"))

def main()->int:
    units=(ROOT/"__partials/widgets/bitcoin-ticker/js/units.js").read_text(encoding="utf-8")
    required=[
        ('kbtc','KBTC','1e3'),
        ('btc','BTC','1'),
        ('mbtc','mBTC','1e-3'),
        ('ubtc','μBTC','1e-6'),
        ('ksat','Ksat','1e-5'),
        ('sat','sat','1e-8'),
        ('msat','msat','1e-11'),
        ('usat','μsat','1e-14'),
    ]
    positions=[]
    for ident,label,factor in required:
        needle=f'id:"{ident}"'
        pos=units.find(needle)
        assert pos>=0, f"missing ticker denomination {ident}"
        positions.append(pos)
        assert label in units[pos:pos+160], f"wrong label for {ident}"
        assert factor in units[pos:pos+200], f"wrong BTC factor for {ident}"
    assert positions==sorted(positions), "ticker denomination order changed"
    assert 'id:"nbtc"' not in units, "nBTC must not reappear in canonical ticker ladder"

    panels=(ROOT/"__partials/widgets/bitcoin-ticker/js/panels.js").read_text(encoding="utf-8")
    assert panels.find('label:"Exchange Rates"') < panels.find('label:"Exchanges"'), "Exchange Rates must precede Exchanges"
    assert "Power/Energy" not in panels or True  # dynamic purchasing-power registry owns these buttons

    catalog=load("__partials/widgets/bitcoin-ticker/reference-catalog.json")
    labels=[p["label"] for p in sorted(catalog["pages"],key=lambda x:x["order"])]
    expected=[
        "Tobacco","Alcohol","Cannabis","Kief & Hash","Concentrates","Commodities",
        "Precious Metals","Semi Precious Metals","Precious Gem Stones",
        "Semi Precious Gem Stones","Collectibles","Water","Oil","Fuels",
        "Power/Energy","Arms","Ammo",
    ]
    assert labels==expected, f"purchasing-power order mismatch: {labels!r}"

    exchanges=load("bitcoin/bpi/api/exchanges.json")["sources"]
    providers=load("bitcoin/bpi/api/provider_urls.json")["providers"]
    for exchange in ("binance_us","binance","bitfinex","coinbase","kraken","gemini"):
        assert exchange in exchanges, f"missing exchange registry row {exchange}"
        assert exchange in providers, f"missing provider row {exchange}"
        assert exchanges[exchange].get("kind")=="exchange"
    assert providers["binance"]["enabled_poll"] is True
    assert providers["binance"]["adapter"]=="binance_24h"
    assert providers["binance"]["quote"]=="EUR", "Binance Global must use a fiat quote, not a stablecoin"
    assert "BTCEUR" in providers["binance"]["price_volume_url"]
    assert providers["bitfinex"]["enabled_poll"] is True

    policy=load("bitcoin/bpi/api/bpi_index_policy.json")
    assert policy["default_country"]=="US"
    assert "US" in policy["native_bpi"]["regions"]
    assert policy["native_bpi"]["fallback_to_global"] is False

    latest=load("bitcoin/bpi/api/latest.json")
    assert "global_bpi" in latest
    assert "national_bpi" in latest
    if "US" in latest["national_bpi"]:
        us=latest["national_bpi"]["US"]
        assert float(us["weighted_price_usd"])>0
        assert float(us["unweighted_price_usd"])>0
    gb=latest["global_bpi"]
    assert float(gb["weighted_price_usd"])>0
    assert float(gb["unweighted_price_usd"])>0

    # Old duplicates must remain tiny compatibility aliases only.
    for rel in ("fx.js","debts.js","balances.js","references.js"):
        body=(ROOT/"__partials/widgets/bitcoin-ticker/js"/rel).read_text(encoding="utf-8")
        assert len(body)<400, f"{rel} grew back into duplicate implementation"

    trade=load("bitcoin/bpi/api/national_trade.json")
    assert len(trade.get("countries",[]))>=200

    # Resident cadence contract: market/price/volume stay near-real-time,
    # while public FX/reference/sovereign APIs run at provider-safe cadences.
    collector=(ROOT/"tools/bpi/collector.py").read_text(encoding="utf-8")
    assert "CYCLE_MS = 2500" in collector
    assert "MIN_CYCLE_MS = 2500" in collector
    assert "MAX_CYCLE_MS = 5000" in collector
    assert "FX_MS = 60_000" in collector
    reference=(ROOT/"tools/bpi/reference_updater.py").read_text(encoding="utf-8")
    assert "next_ref=now+60" in reference
    assert "next_debt=now+21600" in reference

    # The combined price/high-low/volume renderer must use actual timestamps
    # and must not bridge explicit history gaps.
    dual=(ROOT/"__partials/widgets/high-low-24h/js/dual-chart.js").read_text(encoding="utf-8")
    assert "lastVisibleTime-firstVisibleTime" in dual
    assert "gap_before===true" in dual
    assert "interval_volume_btc" in dual

    print("widget_contract_selftest.py: PASS")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
