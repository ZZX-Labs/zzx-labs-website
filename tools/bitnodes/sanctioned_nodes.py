#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_POLICY_PATH = APP_ROOT / "tools" / "bitnodes" / "data" / "policy" / "sanctioned-jurisdictions.json"

SCHEMA = "zzx-bitnodes-sanctioned-nodes-v2"

UNKNOWN_VALUES = {
    "",
    "unknown",
    "none",
    "null",
    "undefined",
    "—",
    "-",
    "n/a",
    "na",
}

DEFAULT_SANCTIONED_COUNTRIES = {
    "RU": "Russia",
    "CN": "China",
    "KP": "North Korea",
    "IR": "Iran",
    "SY": "Syria",
    "VE": "Venezuela",
    "CU": "Cuba",
    "BY": "Belarus",
    "MM": "Myanmar",
    "AF": "Afghanistan",
    "SD": "Sudan",
    "SS": "South Sudan",
    "SO": "Somalia",
    "YE": "Yemen",
    "LY": "Libya",
    "ML": "Mali",
    "CF": "Central African Republic",
    "CD": "Democratic Republic of the Congo",
    "ZW": "Zimbabwe",
}

DEFAULT_WATCH_COUNTRIES = {
    "HK": "Hong Kong",
    "MO": "Macau",
    "PK": "Pakistan",
    "LB": "Lebanon",
    "IQ": "Iraq",
}

DEFAULT_RESTRICTED_OVERLAYS = {
    "TOR": "Tor Overlay Network",
    "I2P": "I2P Overlay Network",
}

COUNTRY_NAME_TO_CODE = {
    "RUSSIA": "RU",
    "RUSSIAN FEDERATION": "RU",
    "CHINA": "CN",
    "PEOPLE'S REPUBLIC OF CHINA": "CN",
    "NORTH KOREA": "KP",
    "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF": "KP",
    "IRAN": "IR",
    "IRAN, ISLAMIC REPUBLIC OF": "IR",
    "SYRIA": "SY",
    "SYRIAN ARAB REPUBLIC": "SY",
    "VENEZUELA": "VE",
    "CUBA": "CU",
    "BELARUS": "BY",
    "MYANMAR": "MM",
    "BURMA": "MM",
    "AFGHANISTAN": "AF",
    "SUDAN": "SD",
    "SOUTH SUDAN": "SS",
    "SOMALIA": "SO",
    "YEMEN": "YE",
    "LIBYA": "LY",
    "MALI": "ML",
    "CENTRAL AFRICAN REPUBLIC": "CF",
    "DEMOCRATIC REPUBLIC OF THE CONGO": "CD",
    "CONGO, THE DEMOCRATIC REPUBLIC OF THE": "CD",
    "ZIMBABWE": "ZW",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


def normalize_code(value: Any) -> str:
    text = clean(value).upper()

    if len(text) == 2:
        return text

    if text in {"TOR", "I2P"}:
        return text

    return COUNTRY_NAME_TO_CODE.get(text, text)


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)

    path.write_text(text + "\n", encoding="utf-8")


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    if "." not in key:
        return row.get(key)

    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None

        current = current.get(part)

    return current


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    return str(value or "").strip().lower() in {"true", "yes", "y", "ok", "1"}


def default_policy() -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-sanction-policy-v2",
        "generated_at": utc_now(),
        "policy_name": "ZZX-Labs Bitnodes Jurisdiction Risk Policy",
        "note": (
            "Technical classification policy only, not legal advice. "
            "Update this JSON from official government sources before operational use."
        ),
        "sanctioned_countries": DEFAULT_SANCTIONED_COUNTRIES,
        "watch_countries": DEFAULT_WATCH_COUNTRIES,
        "restricted_overlays": DEFAULT_RESTRICTED_OVERLAYS,
        "risk_labels": {
            "sanctioned": "Sanctioned / Restricted Jurisdiction",
            "watch": "Policy Watch Jurisdiction",
            "restricted_overlay": "Privacy Overlay / Attribution-Limited",
            "unknown": "Unknown Jurisdiction",
            "clear": "No local policy match",
        },
        "recommended_actions": {
            "exclude-or-review": "Exclude from sensitive metrics or review manually.",
            "watch-review": "Keep visible but flag for policy review.",
            "review-attribution-limited": "Show as overlay/private network with attribution warning.",
            "review-unknown": "Review manually because jurisdiction is unknown.",
            "allow": "No local policy match.",
        },
    }


def normalize_policy_table(value: Any, fallback: dict[str, str]) -> dict[str, str]:
    if isinstance(value, list):
        return {
            normalize_code(item): normalize_code(item)
            for item in value
            if normalize_code(item)
        }

    if isinstance(value, Mapping):
        out = {}

        for key, label in value.items():
            code = normalize_code(key)

            if code:
                out[code] = clean(label) or code

        return out or fallback

    return fallback


def load_policy(policy_path: Path) -> dict[str, Any]:
    policy = read_json(policy_path, fallback={})

    if not isinstance(policy, Mapping) or not policy:
        policy = default_policy()

    policy = dict(policy)
    policy["sanctioned_countries"] = normalize_policy_table(
        policy.get("sanctioned_countries"),
        DEFAULT_SANCTIONED_COUNTRIES,
    )
    policy["watch_countries"] = normalize_policy_table(
        policy.get("watch_countries"),
        DEFAULT_WATCH_COUNTRIES,
    )
    policy["restricted_overlays"] = normalize_policy_table(
        policy.get("restricted_overlays"),
        DEFAULT_RESTRICTED_OVERLAYS,
    )

    return policy


def country_code(row: Mapping[str, Any]) -> str:
    keys = (
        "country_code",
        "cc",
        "iso_country",
        "iso_country_code",
        "country",
        "geo.country_code",
        "geo.country",
        "geo.iso_code",
        "geo.iso_country",
        "geo.iso_country_code",
        "geoip.country_code",
        "geoip.country",
        "geoip.country_name",
        "geoip_data.country_code",
        "geoip_data.country",
        "geoip_data.country_name",
        "country_data.country_code",
        "country_data.cc",
        "country_data.iso_country",
        "country_data.iso_country_code",
        "location.country_code",
        "location.country",
        "metadata.country_code",
        "metadata.country",
    )

    for key in keys:
        code = normalize_code(deep_get(row, key))

        if len(code) == 2 or code in {"TOR", "I2P"}:
            return code

    if (
        boolish(row.get("is_tor"))
        or boolish(row.get("tor"))
        or boolish(deep_get(row, "tor.is_tor"))
        or boolish(deep_get(row, "metadata.is_tor"))
        or boolish(deep_get(row, "metadata.tor"))
    ):
        return "TOR"

    if (
        boolish(row.get("is_i2p"))
        or boolish(row.get("i2p"))
        or boolish(deep_get(row, "i2p.is_i2p"))
        or boolish(deep_get(row, "metadata.is_i2p"))
        or boolish(deep_get(row, "metadata.i2p"))
    ):
        return "I2P"

    network = clean(row.get("network") or deep_get(row, "metadata.network")).lower()

    if network == "tor":
        return "TOR"

    if network == "i2p":
        return "I2P"

    return ""


def policy_match(row: Mapping[str, Any], policy: Mapping[str, Any]) -> dict[str, Any]:
    code = country_code(row)

    sanctioned = policy.get("sanctioned_countries", {})
    watch = policy.get("watch_countries", {})
    restricted_overlays = policy.get("restricted_overlays", {})

    if not isinstance(sanctioned, Mapping):
        sanctioned = DEFAULT_SANCTIONED_COUNTRIES

    if not isinstance(watch, Mapping):
        watch = DEFAULT_WATCH_COUNTRIES

    if not isinstance(restricted_overlays, Mapping):
        restricted_overlays = DEFAULT_RESTRICTED_OVERLAYS

    sanctioned_name = sanctioned.get(code)
    watch_name = watch.get(code)
    overlay_name = restricted_overlays.get(code)

    is_sanctioned = bool(sanctioned_name)
    is_watch = bool(watch_name)
    is_restricted_overlay = bool(overlay_name)

    if is_sanctioned:
        risk_level = "high"
        risk_label = "sanctioned"
        action = "exclude-or-review"
    elif is_restricted_overlay:
        risk_level = "medium"
        risk_label = "restricted_overlay"
        action = "review-attribution-limited"
    elif is_watch:
        risk_level = "watch"
        risk_label = "watch"
        action = "watch-review"
    elif not code:
        risk_level = "unknown"
        risk_label = "unknown"
        action = "review-unknown"
    else:
        risk_level = "clear"
        risk_label = "clear"
        action = "allow"

    return {
        "schema": SCHEMA,
        "country_code": code or "Unknown",
        "matched_name": sanctioned_name or watch_name or overlay_name or "",
        "is_sanctioned": is_sanctioned,
        "is_watch": is_watch,
        "is_restricted_overlay": is_restricted_overlay,
        "is_policy_restricted": is_sanctioned or is_restricted_overlay,
        "is_policy_watch": is_watch,
        "risk_level": risk_level,
        "risk_label": risk_label,
        "recommended_action": action,
        "policy_name": clean(policy.get("policy_name")) or "ZZX-Labs Bitnodes Jurisdiction Risk Policy",
        "policy_schema": clean(policy.get("schema")) or "zzx-bitnodes-sanction-policy-v2",
        "checked_at": utc_now(),
    }


def enrich_node(node: MutableMapping[str, Any], policy: Mapping[str, Any], policy_path: Path) -> MutableMapping[str, Any]:
    meta = policy_match(node, policy)

    node["sanctions_data"] = meta
    node["is_sanctioned_node"] = meta["is_sanctioned"]
    node["is_policy_restricted_node"] = meta["is_policy_restricted"]
    node["policy_restricted"] = meta["is_policy_restricted"]
    node["policy_watch"] = meta["is_policy_watch"]
    node["jurisdiction_risk_level"] = meta["risk_level"]
    node["jurisdiction_recommended_action"] = meta["recommended_action"]

    node.setdefault("enrichment", {})
    node["enrichment"]["sanctioned_nodes"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "policy_path": str(policy_path),
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    context = context or {}

    policy_path = Path(
        context.get("sanctions_policy")
        or context.get("sanctioned_policy")
        or context.get("policy_path")
        or DEFAULT_POLICY_PATH
    )

    policy = load_policy(policy_path)

    if isinstance(nodes, list):
        return [
            enrich_node(dict(node), policy, policy_path) if isinstance(node, Mapping) else node
            for node in nodes
        ]

    if isinstance(nodes, Mapping):
        return {
            key: enrich_node(dict(value), policy, policy_path) if isinstance(value, Mapping) else value
            for key, value in nodes.items()
        }

    return nodes


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    if isinstance(payload, list):
        return enrich_nodes(payload, context)

    if not isinstance(payload, MutableMapping):
        return payload

    if isinstance(payload.get("nodes"), (list, dict)):
        payload["nodes"] = enrich_nodes(payload["nodes"], context)

    if isinstance(payload.get("results"), list):
        payload["results"] = enrich_nodes(payload["results"], context)

    if isinstance(payload.get("data"), list):
        payload["data"] = enrich_nodes(payload["data"], context)

    payload.setdefault("metadata", {})

    if isinstance(payload["metadata"], MutableMapping):
        payload["metadata"]["sanctioned_nodes_enriched_at"] = utc_now()
        payload["metadata"]["sanctions_policy"] = str(
            context.get("sanctions_policy") if context else DEFAULT_POLICY_PATH
        )

    return payload


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    if isinstance(payload, list):
        return [node for node in payload if isinstance(node, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [node for node in nodes if isinstance(node, Mapping)]

    if isinstance(nodes, Mapping):
        return [node for node in nodes.values() if isinstance(node, Mapping)]

    for key in ("results", "data"):
        value = payload.get(key)

        if isinstance(value, list):
            return [node for node in value if isinstance(node, Mapping)]

    return []


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    countries: dict[str, int] = {}
    risk_levels: dict[str, int] = {}
    actions: dict[str, int] = {}

    sanctioned_count = 0
    restricted_overlay_count = 0
    policy_restricted_count = 0
    policy_watch_count = 0

    for node in nodes:
        data = node.get("sanctions_data", {})

        if not isinstance(data, Mapping):
            data = {}

        country = clean(data.get("country_code")) or "Unknown"
        risk = clean(data.get("risk_level")) or "unknown"
        action = clean(data.get("recommended_action")) or "unknown"

        countries[country] = countries.get(country, 0) + 1
        risk_levels[risk] = risk_levels.get(risk, 0) + 1
        actions[action] = actions.get(action, 0) + 1

        if data.get("is_sanctioned"):
            sanctioned_count += 1

        if data.get("is_restricted_overlay"):
            restricted_overlay_count += 1

        if data.get("is_policy_restricted"):
            policy_restricted_count += 1

        if data.get("is_policy_watch"):
            policy_watch_count += 1

    return {
        "schema": "zzx-bitnodes-sanctioned-nodes-summary-v2",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "sanctioned_nodes": sanctioned_count,
        "restricted_overlay_nodes": restricted_overlay_count,
        "policy_restricted_nodes": policy_restricted_count,
        "policy_watch_nodes": policy_watch_count,
        "countries": dict(sorted(countries.items(), key=lambda item: (-item[1], item[0]))),
        "risk_levels": dict(sorted(risk_levels.items(), key=lambda item: (-item[1], item[0]))),
        "recommended_actions": dict(sorted(actions.items(), key=lambda item: (-item[1], item[0]))),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with local policy-based sanctioned/restricted jurisdiction classification."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument(
        "--policy",
        default=str(DEFAULT_POLICY_PATH),
        help="Path to sanctioned-jurisdictions policy JSON.",
    )
    parser.add_argument(
        "--write-default-policy",
        action="store_true",
        help="Write a starter policy JSON to --policy and exit.",
    )
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    policy_path = Path(args.policy)

    if args.write_default_policy:
        write_json(policy_path, default_policy(), compact=args.compact)
        print(f"default sanctions policy written: {policy_path}")
        return 0

    payload = read_json(Path(args.input), fallback={})
    enriched = enrich_payload(payload, {"sanctions_policy": args.policy})

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"sanctioned nodes enrichment complete: {len(iter_nodes(enriched))} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
