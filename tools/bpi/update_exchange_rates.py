#!/usr/bin/env python3
import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "bitcoin" / "bpi" / "api"

CURRENCIES = API / "currencies.json"
EXCHANGE_RATES = API / "exchange_rates.json"

WEED_LB_USD = 125 * 16
FX_INTERVAL_SECONDS = 1800
OIL_INTERVAL_SECONDS = 3600

COMMODITY_SYMBOLS = {
    "XAU": "GC=F",
    "XAG": "SI=F",
    "XCU": "HG=F",
    "XPT": "PL=F",
    "XPD": "PA=F",
    "OIL_BBL": "CL=F",
}


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8"
    )


def fetch_json(url, timeout=25):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ZZX-Labs-BPI/2.0",
            "Accept": "application/json"
        }
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_frankfurter(codes):
    rates = {"USD": 1.0}
    wanted = [c for c in codes if c != "USD"]

    for i in range(0, len(wanted), 20):
        chunk = wanted[i:i + 20]
        if not chunk:
            continue

        try:
            url = "https://api.frankfurter.app/latest?from=USD&to=" + ",".join(chunk)
            data = fetch_json(url)
            for k, v in data.get("rates", {}).items():
                rates[k] = float(v)
        except Exception as e:
            print("Frankfurter chunk failed:", ",".join(chunk), e)

    return rates


def fetch_erapi(codes, rates):
    try:
        data = fetch_json("https://open.er-api.com/v6/latest/USD")
        fallback_rates = data.get("rates", {})

        for code in codes:
            if code not in rates and code in fallback_rates:
                rates[code] = float(fallback_rates[code])

    except Exception as e:
        print("open.er-api fallback failed:", e)

    return rates


def fetch_yahoo_chart(symbol):
    encoded = urllib.parse.quote(symbol)
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        + encoded
        + "?range=1d&interval=1m"
    )

    data = fetch_json(url)
    results = data.get("chart", {}).get("result", [])

    if not results:
        raise RuntimeError("empty Yahoo chart result for " + symbol)

    meta = results[0].get("meta", {})
    price = meta.get("regularMarketPrice")

    if price is None:
        price = meta.get("previousClose")

    price = float(price)

    if price <= 0:
        raise RuntimeError("bad commodity price for " + symbol)

    return price


def normalize_commodities(prev):
    previous = dict(prev.get("commodities_usd", {}) or {})
    commodities = {}

    for code, symbol in COMMODITY_SYMBOLS.items():
        try:
            commodities[code] = fetch_yahoo_chart(symbol)
        except Exception as e:
            print("commodity fetch failed:", code, symbol, e)

            if previous.get(code):
                commodities[code] = previous[code]

    commodities["WEED_LB"] = WEED_LB_USD

    return commodities


def build_once():
    currencies = read_json(CURRENCIES, {"order": ["USD"]})
    codes = currencies.get("order", ["USD"])

    rates = fetch_frankfurter(codes)
    rates = fetch_erapi(codes, rates)
    rates["USD"] = 1.0

    prev = read_json(EXCHANGE_RATES, {})

    updated_at = now_iso()
    next_update = (
        datetime.now(timezone.utc) + timedelta(seconds=FX_INTERVAL_SECONDS)
    ).isoformat().replace("+00:00", "Z")

    out = {
        "base": "USD",
        "updated_at": updated_at,
        "next_update_after": next_update,
        "update_interval_seconds": FX_INTERVAL_SECONDS,
        "sources": {
            "fiat_primary": "frankfurter",
            "fiat_fallback": "open.er-api.com",
            "metals": "yahoo_finance_chart",
            "oil": "yahoo_finance_chart",
            "weed": "static_baseline_125_usd_per_oz"
        },
        "commodity_symbols": COMMODITY_SYMBOLS,
        "rates": {
            code: rates[code]
            for code in codes
            if code in rates
        },
        "assets_usd": dict(prev.get("assets_usd", {}) or {}),
        "commodities_usd": normalize_commodities(prev),
        "user_values_usd": dict(prev.get("user_values_usd", {}) or {}),
        "intervals": {
            "currency_seconds": FX_INTERVAL_SECONDS,
            "commodity_seconds": FX_INTERVAL_SECONDS,
            "oil_seconds": OIL_INTERVAL_SECONDS,
            "weed_static_usd_per_lb": WEED_LB_USD
        }
    }

    write_json(EXCHANGE_RATES, out)

    print(
        "exchange_rates updated:",
        len(out["rates"]),
        "fiat rates;",
        len(out["commodities_usd"]),
        "commodity units;",
        "WEED_LB =",
        out["commodities_usd"]["WEED_LB"]
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--interval", type=float, default=FX_INTERVAL_SECONDS)
    args = parser.parse_args()

    if args.loop:
        while True:
            try:
                build_once()
            except Exception as e:
                print("ERROR:", e)
            time.sleep(args.interval)
    else:
        build_once()


if __name__ == "__main__":
    main()
