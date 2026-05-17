#!/usr/bin/env python3
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API_DIR = ROOT / "bitcoin" / "bpi" / "api"

LATEST = API_DIR / "latest.json"
CHANGES = API_DIR / "changes.json"
HISTORY = API_DIR / "history.json"

COINGECKO_TICKERS = (
    "https://api.coingecko.com/api/v3/coins/bitcoin/tickers"
    "?include_exchange_logo=false&depth=false&order=volume_desc"
)

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def fetch_json(url, timeout=20):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ZZX-Labs-BPI/1.0",
            "Accept": "application/json"
        }
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def fetch_coingecko_bitcoin_tickers():
    data = fetch_json(COINGECKO_TICKERS)
    rows = []

    for t in data.get("tickers", []):
        market = t.get("market") or {}
        exchange = market.get("identifier") or market.get("name") or "unknown"

        price = None
        volume_usd = None

        converted_last = t.get("converted_last") or {}
        converted_volume = t.get("converted_volume") or {}

        if "usd" in converted_last:
            price = float(converted_last["usd"])

        if "usd" in converted_volume:
            volume_usd = float(converted_volume["usd"])

        if not price or price <= 0:
            continue

        volume_btc = 0.0
        if volume_usd and volume_usd > 0:
            volume_btc = volume_usd / price

        rows.append({
            "exchange": exchange,
            "pair": f"{t.get('base', 'BTC')}/{t.get('target', '')}",
            "price_usd": price,
            "volume_24h_btc": volume_btc,
            "volume_24h_usd": volume_usd or 0.0,
            "trust_score": t.get("trust_score"),
            "source": "coingecko",
            "timestamp": t.get("timestamp") or t.get("last_traded_at") or now_iso()
        })

    return rows

def compute_vwap(rows):
    usable = [r for r in rows if r["price_usd"] > 0 and r["volume_24h_btc"] > 0]

    if usable:
        total_volume = sum(r["volume_24h_btc"] for r in usable)
        weighted_sum = sum(r["price_usd"] * r["volume_24h_btc"] for r in usable)
        price = weighted_sum / total_volume
    else:
        total_volume = 0.0
        price = sum(r["price_usd"] for r in rows) / len(rows)

    high = max(r["price_usd"] for r in rows)
    low = min(r["price_usd"] for r in rows)

    exchanges = {}
    for r in rows:
        key = r["exchange"]
        weight = 0.0
        if total_volume > 0:
            weight = r["volume_24h_btc"] / total_volume

        exchanges[key] = {
            "price_usd": round(r["price_usd"], 8),
            "volume_24h_btc": round(r["volume_24h_btc"], 8),
            "volume_24h_usd": round(r["volume_24h_usd"], 2),
            "weight": round(weight, 12),
            "pair": r["pair"],
            "source": r["source"],
            "timestamp": r["timestamp"]
        }

    return {
        "source": "zzx-global-bpi",
        "mode": "generated",
        "base": "USD",
        "updated_at": now_iso(),
        "price_usd": round(price, 8),
        "btc_usd": round(price, 8),
        "vwap_usd": round(price, 8),
        "bpi_usd": round(price, 8),
        "volume_24h_btc": round(total_volume, 8),
        "high_24h": round(high, 8),
        "low_24h": round(low, 8),
        "exchange_count": len(exchanges),
        "weighted_average": {
            "method": "volume_weighted_average_price",
            "sources": len(exchanges),
            "price_usd": round(price, 8),
            "vwap_usd": round(price, 8),
            "formula": "sum(price_usd * volume_24h_btc) / sum(volume_24h_btc)"
        },
        "global_bpi": {
            "price_usd": round(price, 8),
            "vwap_usd": round(price, 8)
        },
        "exchanges": exchanges
    }

def read_json(path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

def main():
    rows = fetch_coingecko_bitcoin_tickers()
    if not rows:
        raise SystemExit("No Bitcoin ticker rows returned.")

    latest = compute_vwap(rows)
    previous = read_json(LATEST, {})

    write_json(LATEST, latest)

    old_price = previous.get("price_usd")
    new_price = latest.get("price_usd")

    if old_price != new_price:
        change = {
            "updated_at": latest["updated_at"],
            "old_price_usd": old_price,
            "new_price_usd": new_price,
            "exchange_count": latest["exchange_count"],
            "volume_24h_btc": latest["volume_24h_btc"]
        }

        changes = read_json(CHANGES, [])
        if not isinstance(changes, list):
            changes = []
        changes.append(change)
        write_json(CHANGES, changes[-500:])

        history = read_json(HISTORY, [])
        if not isinstance(history, list):
            history = []
        history.append({
            "updated_at": latest["updated_at"],
            "price_usd": new_price,
            "volume_24h_btc": latest["volume_24h_btc"],
            "exchange_count": latest["exchange_count"]
        })
        write_json(HISTORY, history[-5000:])

    print(f"Updated latest.json: ${latest['price_usd']} from {latest['exchange_count']} markets")

if __name__ == "__main__":
    main()
