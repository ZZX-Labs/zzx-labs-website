#!/usr/bin/env python3
import argparse
import json
import time
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
            "User-Agent": "ZZX-Labs-BPI/1.0",
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


def normalize_commodities(prev):
    commodities = dict(prev.get("commodities_usd", {}) or {})

    commodities["WEED_LB"] = WEED_LB_USD

    return commodities


def build_once():
    currencies = read_json(CURRENCIES, {"order": ["USD"]})
    codes = currencies.get("order", ["USD"])

    rates = fetch_frankfurter(codes)
    rates = fetch_erapi(codes, rates)

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
            "metals": prev.get("sources", {}).get("metals", "admin_or_provider_generated"),
            "oil": prev.get("sources", {}).get("oil", "admin_or_provider_generated"),
            "weed": "static_baseline_125_usd_per_oz"
        },
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

    out["rates"]["USD"] = 1.0

    write_json(EXCHANGE_RATES, out)

    print(
        "exchange_rates updated:",
        len(out["rates"]),
        "fiat rates;",
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
