#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_POLICY_PATH = APP_ROOT / "tools" / "bitnodes" / "data" / "policy" / "sanctioned-jurisdictions.json"

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

DEFAULT_RESTRICTED_OVERLAYS = {
    "TOR": "Tor Overlay Network",
    "I2P": "I2P Overlay Network",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


def normalize_code(value: Any) -> str:
    return clean(value).upper()


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def nested_dict(row: dict[str, Any], key: str) -> dict[str, Any]:
    value = row.get(key)

    return value if isinstance(value, dict) else {}


def default_policy() -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-sanction-policy-v1",
        "generated_at": utc_now(),
        "policy_name": "ZZX-Labs Bitnodes Jurisdiction Risk Policy",
        "note": "This file is a technical classification policy, not legal advice. Update from official government sources before operational use.",
        "sanctioned_countries": DEFAULT_SANCTIONED_COUNTRIES,
        "restricted_overlays": DEFAULT_RESTRICTED_OVERLAYS,
        "risk_labels": {
            "sanctioned": "Sanctioned / Restricted Jurisdiction",
            "restricted_overlay": "Privacy Overlay / Attribution-Limited",
            "unknown": "Unknown Jurisdiction",
            "clear": "No local policy match",
        },
    }


def load_policy(policy_path: Path) -> dict[str, Any]:
    policy = read_json(policy_path, fallback={})

    if not isinstance(policy, dict) or not policy:
        policy = default_policy()

    sanctioned = policy.get("sanctioned_countries")

    if isinstance(sanctioned, list):
        policy["sanctioned_countries"] = {
            normalize_code(item): normalize_code(item)
            for item in sanctioned
            if normalize_code(item)
        }

    if not isinstance(policy.get("sanctioned_countries"), dict):
        policy["sanctioned_countries"] = DEFAULT_SANCTIONED_COUNTRIES

    if not isinstance(policy.get("restricted_overlays"), dict):
        policy["restricted_overlays"] = DEFAULT_RESTRICTED_OVERLAYS

    return policy


def country_code(row: dict[str, Any]) -> str:
    for key in (
        "country_code",
        "cc",
        "iso_country",
        "iso_country_code",
    ):
        value = normalize_code(row.get(key))

        if len(value) == 2 or value in {"TOR", "I2P"}:
            return value

    country_data = nested_dict(row, "country_data")

    for key in (
        "country_code",
        "cc",
        "iso_country",
        "iso_country_code",
    ):
        value = normalize_code(country_data.get(key))

        if len(value) == 2 or value in {"TOR", "I2P"}:
            return value

    geo = nested_dict(row, "geo")

    for key in (
        "country_code",
        "country",
        "iso_code",
        "iso_country",
        "iso_country_code",
    ):
        value = normalize_code(geo.get(key))

        if len(value) == 2 or value in {"TOR", "I2P"}:
            return value

    value = normalize_code(row.get("country"))

    if len(value) == 2 or value in {"TOR", "I2P"}:
        return value

    if row.get("is_tor") or nested_dict(row, "tor").get("is_tor"):
        return "TOR"

    if row.get("is_i2p") or nested_dict(row, "i2p").get("is_i2p"):
        return "I2P"

    return ""


def policy_match(
    row: dict[str, Any],
    policy: dict[str, Any],
) -> dict[str, Any]:
    code = country_code(row)

    sanctioned = policy.get("sanctioned_countries", {})
    restricted_overlays = policy.get("restricted_overlays", {})

    sanctioned_name = sanctioned.get(code)
    overlay_name = restricted_overlays.get(code)

    is_sanctioned = bool(sanctioned_name)
    is_restricted_overlay = bool(overlay_name)

    if is_sanctioned:
        risk_level = "high"
        risk_label = "sanctioned"
        action = "exclude-or-review"
    elif is_restricted_overlay:
        risk_level = "medium"
        risk_label = "restricted_overlay"
        action = "review-attribution-limited"
    elif not code:
        risk_level = "unknown"
        risk_label = "unknown"
        action = "review-unknown"
    else:
        risk_level = "clear"
        risk_label = "clear"
        action = "allow"

    return {
        "country_code": code or "Unknown",
        "matched_name": sanctioned_name or overlay_name or "",
        "is_sanctioned": is_sanctioned,
        "is_restricted_overlay": is_restricted_overlay,
        "is_policy_restricted": is_sanctioned or is_restricted_overlay,
        "risk_level": risk_level,
        "risk_label": risk_label,
        "recommended_action": action,
        "policy_name": clean(policy.get("policy_name")) or "ZZX-Labs Bitnodes Jurisdiction Risk Policy",
        "policy_schema": clean(policy.get("schema")) or "zzx-bitnodes-sanction-policy-v1",
        "checked_at": utc_now(),
    }


def enrich_nodes(
    nodes: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    context = context or {}

    policy_path = Path(
        context.get("sanctions_policy")
        or context.get("sanctioned_policy")
        or context.get("policy_path")
        or DEFAULT_POLICY_PATH
    )

    policy = load_policy(policy_path)

    for node in nodes:
        meta = policy_match(node, policy)

        node["sanctions_data"] = meta
        node["is_sanctioned_node"] = meta["is_sanctioned"]
        node["is_policy_restricted_node"] = meta["is_policy_restricted"]
        node["jurisdiction_risk_level"] = meta["risk_level"]
        node["jurisdiction_recommended_action"] = meta["recommended_action"]

        node.setdefault("enrichment", {})
        node["enrichment"]["sanctioned_nodes"] = {
            "status": "ok",
            "updated_at": utc_now(),
            "policy_path": str(policy_path),
        }

    return nodes


def summarize(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    countries: dict[str, int] = {}
    risk_levels: dict[str, int] = {}
    actions: dict[str, int] = {}

    sanctioned_count = 0
    restricted_overlay_count = 0
    policy_restricted_count = 0

    for node in nodes:
        data = nested_dict(node, "sanctions_data")

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

    return {
        "schema": "zzx-bitnodes-sanctioned-nodes-summary-v1",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "sanctioned_nodes": sanctioned_count,
        "restricted_overlay_nodes": restricted_overlay_count,
        "policy_restricted_nodes": policy_restricted_count,
        "countries": countries,
        "risk_levels": risk_levels,
        "recommended_actions": actions,
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

    args = parser.parse_args()

    policy_path = Path(args.policy)

    if args.write_default_policy:
        write_json(policy_path, default_policy())
        print(f"default sanctions policy written: {policy_path}")
        return 0

    payload = read_json(Path(args.input), fallback={})
    nodes = payload.get("nodes", payload if isinstance(payload, list) else [])

    if not isinstance(nodes, list):
        nodes = []

    enriched = enrich_nodes(
        nodes,
        {
            "sanctions_policy": args.policy,
        },
    )

    if isinstance(payload, dict):
        payload["nodes"] = enriched
        payload.setdefault("metadata", {})
        payload["metadata"]["sanctioned_nodes_enriched_at"] = utc_now()
        payload["metadata"]["sanctions_policy"] = args.policy
        output = payload
    else:
        output = enriched

    write_json(Path(args.output), output)

    if args.summary:
        write_json(Path(args.summary), summarize(enriched))

    print(f"sanctioned nodes enrichment complete: {len(enriched)} nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
