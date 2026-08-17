#!/usr/bin/env python3
import argparse
import json
import math
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "bitcoin" / "bpi" / "api" / "deadopop.json"

INTERVAL_SECONDS = 3600
TOP_LIMIT = 100

ALLOWED_STATUSES = {
    "bankrupt",
    "insolvent",
    "scam",
    "rug_pull",
    "fraud",
    "collapsed",
    "abandoned",
    "shutdown",
    "dead",
    "delisted_dead",
    "protocol_failure",
    "exchange_failure",
    "zeroed_out",
}


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def finite(value, default=None):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return default
    return number if math.isfinite(number) else default


def positive(value, default=None):
    number = finite(value)
    if number is None or number <= 0:
        return default
    return number


def nonnegative(value, default=0.0):
    number = finite(value)
    if number is None or number < 0:
        return default
    return number


def write_json_atomic(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"

    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".",
        suffix=".tmp",
        dir=str(path.parent),
        text=True,
    )

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def registry_candidates():
    env_path = os.environ.get("DEADOPOP_REGISTRY", "").strip()

    candidates = []
    if env_path:
        candidates.append(Path(env_path))

    candidates.extend([
        ROOT / "bitcoin" / "bpi" / "data" / "deadcoins_registry.json",
        ROOT / "bitcoin" / "bpi" / "api" / "deadcoins_registry.json",
        ROOT / "bitcoin" / "bpi" / "deadcoins_registry.json",
        ROOT / "deadcoins_registry.json",
    ])

    return candidates


def resolve_registry_path(explicit=None):
    if explicit is not None:
        path = Path(explicit).expanduser()
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()

        if not path.is_file():
            raise RuntimeError(
                f"explicit dead-coin registry does not exist: {path}"
            )
        return path

    checked = []
    seen = set()

    for candidate in registry_candidates():
        path = candidate.expanduser()
        if not path.is_absolute():
            path = (ROOT / path).resolve()

        key = str(path)
        if key in seen:
            continue

        seen.add(key)
        checked.append(path)

        if path.is_file():
            return path

    bpi_root = ROOT / "bitcoin" / "bpi"
    discovered = []

    if bpi_root.is_dir():
        for path in bpi_root.rglob("deadcoins_registry.json"):
            if not path.is_file():
                continue

            parts = set(path.parts)
            if ".git" in parts or "node_modules" in parts or "__pycache__" in parts:
                continue

            resolved = path.resolve()
            if str(resolved) not in seen:
                discovered.append(resolved)

    if len(discovered) == 1:
        return discovered[0]

    if len(discovered) > 1:
        found = "\n".join(f"  - {path}" for path in discovered)
        raise RuntimeError(
            "multiple deadcoins_registry.json files were found; "
            "pass --registry explicitly or set DEADOPOP_REGISTRY:\n"
            + found
        )

    searched = "\n".join(f"  - {path}" for path in checked)
    raise RuntimeError(
        "dead-coin registry not found. Searched:\n" + searched
    )


def load_registry(path):
    data = json.loads(path.read_text(encoding="utf-8"))

    if isinstance(data, dict):
        entries = data.get("entries")
    else:
        entries = data

    if not isinstance(entries, list):
        raise RuntimeError(
            f"dead-coin registry must contain an entries array: {path}"
        )

    if not entries:
        raise RuntimeError(
            f"dead-coin registry contains zero entries: {path}"
        )

    return data, entries


def normalize_sources(value):
    if not isinstance(value, list):
        return []

    out = []
    seen = set()

    for item in value:
        if isinstance(item, str):
            url = item.strip()
            label = ""
        elif isinstance(item, dict):
            url = str(item.get("url") or "").strip()
            label = str(item.get("label") or "").strip()
        else:
            continue

        if not url or url in seen:
            continue

        if not (url.startswith("https://") or url.startswith("http://")):
            continue

        seen.add(url)
        out.append({"url": url, "label": label})

    return out


def normalize_entry(raw):
    if not isinstance(raw, dict):
        return None

    coin_id = str(raw.get("id") or "").strip()
    symbol = str(raw.get("symbol") or "").strip()
    name = str(raw.get("name") or "").strip()
    status = str(raw.get("status") or "").strip().lower()

    if not coin_id or not name or status not in ALLOWED_STATUSES:
        return None

    if coin_id.lower() == "bitcoin" or symbol.lower() == "btc":
        return None

    peak = positive(raw.get("peak_market_cap_usd"))
    terminal = nonnegative(raw.get("terminal_market_cap_usd"), 0.0)
    direct_loss = positive(raw.get("estimated_value_lost_usd"))

    if direct_loss is not None:
        loss = direct_loss
        loss_method = str(
            raw.get("loss_method") or "archival_estimate"
        ).strip()
    elif peak is not None:
        loss = max(0.0, peak - terminal)
        loss_method = "peak_market_cap_minus_terminal_market_cap"
    else:
        return None

    if loss <= 0:
        return None

    failure_date = str(raw.get("failure_date") or "").strip()
    failure_reason = str(raw.get("failure_reason") or "").strip()
    notes = str(raw.get("notes") or "").strip()
    confidence = finite(raw.get("confidence"), 0.0)
    confidence = max(0.0, min(1.0, confidence))

    return {
        "id": coin_id,
        "symbol": symbol,
        "name": name,
        "status": status,
        "failure_date": failure_date,
        "failure_reason": failure_reason,
        "peak_market_cap_usd": peak,
        "terminal_market_cap_usd": terminal,
        "estimated_value_lost_usd": loss,
        "loss_method": loss_method,
        "confidence": confidence,
        "sources": normalize_sources(raw.get("sources")),
        "notes": notes,
    }


def build_once(registry_path=None, out_path=DEFAULT_OUT):
    resolved_registry = resolve_registry_path(registry_path)
    registry_doc, raw_entries = load_registry(resolved_registry)

    normalized = []
    seen = set()

    for raw in raw_entries:
        item = normalize_entry(raw)
        if item is None:
            continue

        key = item["id"].lower()
        if key in seen:
            raise RuntimeError(
                f"duplicate dead-coin registry id: {item['id']}"
            )

        seen.add(key)
        normalized.append(item)

    if not normalized:
        raise RuntimeError(
            "dead-coin registry produced zero validated "
            "failed/dead/scam assets"
        )

    normalized.sort(
        key=lambda item: item["estimated_value_lost_usd"],
        reverse=True,
    )

    total_lost = sum(
        item["estimated_value_lost_usd"]
        for item in normalized
    )

    total_peak = sum(
        item["peak_market_cap_usd"]
        for item in normalized
        if item["peak_market_cap_usd"] is not None
    )

    status_counts = {}
    for item in normalized:
        status = item["status"]
        status_counts[status] = status_counts.get(status, 0) + 1

    top = [
        {"rank": rank, **item}
        for rank, item in enumerate(
            normalized[:TOP_LIMIT],
            start=1,
        )
    ]

    output = {
        "updated_at": now_iso(),
        "registry_generated_at": (
            str(registry_doc.get("generated_at") or "")
            if isinstance(registry_doc, dict)
            else ""
        ),
        "registry_source_path": (
            resolved_registry.relative_to(ROOT).as_posix()
            if ROOT in resolved_registry.parents
            else str(resolved_registry)
        ),
        "source": "zzx_deadcoins_archival_registry",
        "scope": "failed_dead_bankrupt_scam_collapsed_cryptoassets",
        "available": True,
        "bitcoin_excluded": True,
        "total_dead_coins": len(normalized),
        "combined_estimated_value_lost_usd": round(total_lost, 2),
        "combined_peak_market_cap_usd": round(total_peak, 2),
        "status_counts": status_counts,
        "top_dead_coins": top,
        "methodology": (
            "Includes only assets explicitly classified in the archival "
            "registry as failed/dead/bankrupt/scam/collapsed/etc. "
            "estimated_value_lost_usd is preferred; otherwise loss may "
            "be computed as peak_market_cap_usd minus "
            "terminal_market_cap_usd."
        ),
    }

    write_json_atomic(Path(out_path), output)

    print(f"DeadOPop registry loaded: {resolved_registry}")
    print(
        "deadopop updated:",
        f"dead_coins={output['total_dead_coins']};",
        f"combined_lost_usd={output['combined_estimated_value_lost_usd']:.2f};",
        f"combined_peak_mcap_usd={output['combined_peak_market_cap_usd']:.2f}",
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--registry",
        type=Path,
        default=None,
        help=(
            "Optional registry path. When omitted, the updater searches "
            "supported BPI registry locations and DEADOPOP_REGISTRY."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUT,
    )
    parser.add_argument("--loop", action="store_true")
    parser.add_argument(
        "--interval",
        type=float,
        default=INTERVAL_SECONDS,
    )
    args = parser.parse_args()

    if args.loop:
        while True:
            try:
                build_once(args.registry, args.output)
            except Exception as exc:
                print("ERROR:", exc)
            time.sleep(args.interval)
    else:
        build_once(args.registry, args.output)


if __name__ == "__main__":
    main()
