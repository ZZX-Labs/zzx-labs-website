#!/usr/bin/env python3
import argparse
import json
import math
import os
import tempfile
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
    payload = json.dumps(data, indent=2, ensure_ascii=False) + "\n"

    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".",
        suffix=".tmp",
        dir=str(path.parent),
        text=True,
    )

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())

        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def finite_positive(value):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None

    if not math.isfinite(number) or number <= 0:
        return None

    return number


def fetch_json(url, timeout=25):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ZZX-Labs-BPI/2.1",
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

            for code, value in data.get("rates", {}).items():
                rate = finite_positive(value)
                if rate is not None:
                    rates[code] = rate

        except Exception as e:
            print("Frankfurter chunk failed:", ",".join(chunk), e)

    return rates


def fetch_erapi(codes, rates):
    try:
        data = fetch_json("https://open.er-api.com/v6/latest/USD")
        fallback_rates = data.get("rates", {})

        for code in codes:
            if code in rates or code not in fallback_rates:
                continue

            rate = finite_positive(fallback_rates[code])
            if rate is not None:
                rates[code] = rate

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

    price = finite_positive(price)

    if price is None:
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

            old = finite_positive(previous.get(code))
            if old is not None:
                commodities[code] = old

    commodities["WEED_LB"] = float(WEED_LB_USD)

    return commodities


def normalize_codes(currencies):
    raw = currencies.get("order", ["USD"])

    if not isinstance(raw, list):
        raw = ["USD"]

    codes = []
    seen = set()

    for value in raw:
        code = str(value).strip().upper()

        if not code or code in seen:
            continue

        seen.add(code)
        codes.append(code)

    if "USD" not in seen:
        codes.insert(0, "USD")

    return codes or ["USD"]


def preserve_missing_rates(codes, rates, prev):
    previous = prev.get("rates", {})

    if not isinstance(previous, dict):
        previous = {}

    for code in codes:
        if code in rates:
            continue

        old = finite_positive(previous.get(code))
        if old is not None:
            rates[code] = old
            print("preserved previous exchange rate:", code)

    rates["USD"] = 1.0
    return rates


def validate_rates(codes, rates):
    valid = {}

    for code in codes:
        value = finite_positive(rates.get(code))
        if value is not None:
            valid[code] = value

    valid["USD"] = 1.0

    minimum = 2 if len(codes) > 1 else 1

    if len(valid) < minimum:
        raise RuntimeError(
            "refusing to overwrite exchange_rates.json with "
            f"only {len(valid)} valid fiat rate(s); minimum={minimum}"
        )

    return valid


def build_once():
    currencies = read_json(CURRENCIES, {"order": ["USD"]})
    codes = normalize_codes(currencies)

    # Read the previous production file before querying providers so that a
    # partial upstream outage can preserve individually valid prior values.
    prev = read_json(EXCHANGE_RATES, {})

    rates = fetch_frankfurter(codes)
    rates = fetch_erapi(codes, rates)
    rates = preserve_missing_rates(codes, rates, prev)
    rates = validate_rates(codes, rates)

    updated_at = now_iso()
    next_update = (
        datetime.now(timezone.utc) + timedelta(seconds=FX_INTERVAL_SECONDS)
    ).isoformat().replace("+00:00", "Z")

    commodities = normalize_commodities(prev)

    if not commodities:
        raise RuntimeError(
            "refusing to overwrite exchange_rates.json with no commodity data"
        )

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
        "commodities_usd": commodities,
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
