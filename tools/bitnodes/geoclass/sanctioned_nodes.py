#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_POLICY_PATH = APP_ROOT / "tools" / "bitnodes" / "data" / "policy" / "sanctioned-jurisdictions.json"

SCHEMA = "zzx-bitnodes-sanctioned-nodes-v3"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}

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
    "HONG KONG": "HK",
    "MACAU": "MO",
    "MACAO": "MO",
    "PAKISTAN": "PK",
    "LEBANON": "LB",
    "IRAQ": "IQ",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if text.lower() in UNKNOWN_VALUES:
        return ""
    return text


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

    try:
        if not path.exists():
            return fallback

        if path.suffix == ".gz":
            with gzip.open(path, "rt", encoding="utf-8") as handle:
                return json.load(handle)

        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=None if compact else 2,
            separators=(",", ":") if compact else None,
            sort_keys=not compact,
            default=str,
        )
        + "\n",
        encoding="utf-8",
    )


def deep_get(row: Mapping[str, Any], key: str) -> Any:
    current: Any = row

    for part in key.split("."):
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)

    return current


def first_value(row: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)
        if value not in ("", None):
            return value
    return None


def boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if value in (1, "1"):
        return True

    if value in (0, "0"):
        return False

    return str(value or "").strip().lower() in {"true", "yes", "y", "ok", "1", "on"}


def default_policy() -> dict[str, Any]:
    return {
        "schema": "zzx-bitnodes-sanction-policy-v3",
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
        "map_styles": {
            "sanctioned": {
                "marker_color": "#ff0000",
                "marker_outline": "#ff0000",
                "marker_fill": "#ff0000",
                "marker_fill_opacity": 0.18,
                "marker_radius": 9,
                "marker_shape": "circle",
                "marker_ring": True,
                "table_badge": "SANCTIONED",
                "table_badge_class": "bn-badge bn-badge-red bn-badge-sanctioned",
            },
            "watch": {
                "marker_color": "#ffb000",
                "marker_outline": "#ffb000",
                "marker_fill": "#ffb000",
                "marker_fill_opacity": 0.18,
                "marker_radius": 8,
                "marker_shape": "circle",
                "marker_ring": True,
                "table_badge": "WATCH",
                "table_badge_class": "bn-badge bn-badge-amber bn-badge-watch",
            },
            "restricted_overlay": {
                "marker_color": "#ff3b3b",
                "marker_outline": "#ff3b3b",
                "marker_fill": "#111111",
                "marker_fill_opacity": 0.28,
                "marker_radius": 8,
                "marker_shape": "circle",
                "marker_ring": True,
                "table_badge": "OVERLAY",
                "table_badge_class": "bn-badge bn-badge-red bn-badge-overlay",
            },
            "unknown": {
                "marker_color": "#9ca3af",
                "marker_outline": "#9ca3af",
                "marker_fill": "#9ca3af",
                "marker_fill_opacity": 0.15,
                "marker_radius": 6,
                "marker_shape": "circle",
                "marker_ring": False,
                "table_badge": "UNKNOWN",
                "table_badge_class": "bn-badge bn-badge-gray",
            },
            "clear": {
                "marker_color": "#c0d674",
                "marker_outline": "#c0d674",
                "marker_fill": "#c0d674",
                "marker_fill_opacity": 0.12,
                "marker_radius": 5,
                "marker_shape": "circle",
                "marker_ring": False,
                "table_badge": "CLEAR",
                "table_badge_class": "bn-badge bn-badge-green",
            },
        },
    }


def normalize_policy_table(value: Any, fallback: dict[str, str]) -> dict[str, str]:
    if isinstance(value, list):
        return {normalize_code(item): normalize_code(item) for item in value if normalize_code(item)}

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

    if not isinstance(policy.get("map_styles"), Mapping):
        policy["map_styles"] = default_policy()["map_styles"]

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
        "metadata.geoip.country_code",
        "metadata.geoloc.country_code",
        "geoloc.country_code",
        "geoloc.country",
    )

    for key in keys:
        code = normalize_code(deep_get(row, key) if "." in key else row.get(key))

        if len(code) == 2 or code in {"TOR", "I2P"}:
            return code

    if (
        boolish(row.get("is_tor"))
        or boolish(row.get("suspected_tor"))
        or boolish(deep_get(row, "tor.is_tor"))
        or boolish(deep_get(row, "metadata.is_tor"))
        or boolish(deep_get(row, "metadata.tor.is_tor"))
    ):
        return "TOR"

    if (
        boolish(row.get("is_i2p"))
        or boolish(row.get("suspected_i2p"))
        or boolish(deep_get(row, "i2p.is_i2p"))
        or boolish(deep_get(row, "metadata.is_i2p"))
        or boolish(deep_get(row, "metadata.i2p.is_i2p"))
    ):
        return "I2P"

    network = clean(first_value(row, "network", "metadata.network")).lower()

    if network == "tor":
        return "TOR"

    if network == "i2p":
        return "I2P"

    return ""


def style_for_label(policy: Mapping[str, Any], risk_label: str) -> dict[str, Any]:
    styles = policy.get("map_styles", {})
    default_styles = default_policy()["map_styles"]

    if not isinstance(styles, Mapping):
        styles = {}

    style = styles.get(risk_label)
    if not isinstance(style, Mapping):
        style = default_styles.get(risk_label, default_styles["unknown"])

    return dict(style)


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

    matched_name = sanctioned_name or watch_name or overlay_name or ""
    map_style = style_for_label(policy, risk_label)

    return {
        "schema": SCHEMA,
        "country_code": code or "Unknown",
        "sanctioned_country_code": code if is_sanctioned else "",
        "sanctioned_country_name": sanctioned_name or "",
        "watch_country_code": code if is_watch else "",
        "watch_country_name": watch_name or "",
        "matched_name": matched_name,
        "is_sanctioned": is_sanctioned,
        "is_watch": is_watch,
        "is_restricted_overlay": is_restricted_overlay,
        "is_policy_restricted": is_sanctioned or is_restricted_overlay,
        "is_policy_watch": is_watch,
        "risk_level": risk_level,
        "risk_label": risk_label,
        "recommended_action": action,
        "map_style": map_style,
        "map_marker_color": map_style.get("marker_color", "#ff0000" if is_sanctioned else "#c0d674"),
        "map_marker_outline": map_style.get("marker_outline", "#ff0000" if is_sanctioned else "#c0d674"),
        "map_marker_radius": map_style.get("marker_radius", 9 if is_sanctioned else 5),
        "map_marker_shape": map_style.get("marker_shape", "circle"),
        "map_marker_ring": bool(map_style.get("marker_ring", is_sanctioned)),
        "table_badge": map_style.get("table_badge", "SANCTIONED" if is_sanctioned else risk_label.upper()),
        "table_badge_class": map_style.get("table_badge_class", "bn-badge bn-badge-red bn-badge-sanctioned"),
        "policy_name": clean(policy.get("policy_name")) or "ZZX-Labs Bitnodes Jurisdiction Risk Policy",
        "policy_schema": clean(policy.get("schema")) or "zzx-bitnodes-sanction-policy-v3",
        "checked_at": utc_now(),
    }


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any], policy: Mapping[str, Any], policy_path: Path) -> MutableMapping[str, Any]:
    meta = policy_match(node, policy)
    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")
    map_style = meta["map_style"]

    node["sanctions_data"] = meta
    metadata["sanctions_data"] = meta

    node["is_sanctioned_node"] = meta["is_sanctioned"]
    node["is_policy_restricted_node"] = meta["is_policy_restricted"]
    node["policy_restricted"] = meta["is_policy_restricted"]
    node["policy_watch"] = meta["is_policy_watch"]
    node["jurisdiction_risk_level"] = meta["risk_level"]
    node["jurisdiction_risk_label"] = meta["risk_label"]
    node["jurisdiction_recommended_action"] = meta["recommended_action"]

    node["sanctioned_country_code"] = meta["sanctioned_country_code"]
    node["sanctioned_country_name"] = meta["sanctioned_country_name"]
    node["policy_match_country_code"] = meta["country_code"]
    node["policy_match_country_name"] = meta["matched_name"]

    node["map_marker_color"] = meta["map_marker_color"]
    node["map_marker_outline"] = meta["map_marker_outline"]
    node["map_marker_radius"] = meta["map_marker_radius"]
    node["map_marker_shape"] = meta["map_marker_shape"]
    node["map_marker_ring"] = meta["map_marker_ring"]
    node["map_style"] = map_style

    node["table_badge"] = meta["table_badge"]
    node["table_badge_class"] = meta["table_badge_class"]

    for key in (
        "is_sanctioned_node",
        "is_policy_restricted_node",
        "policy_restricted",
        "policy_watch",
        "jurisdiction_risk_level",
        "jurisdiction_risk_label",
        "jurisdiction_recommended_action",
        "sanctioned_country_code",
        "sanctioned_country_name",
        "policy_match_country_code",
        "policy_match_country_name",
        "map_marker_color",
        "map_marker_outline",
        "map_marker_radius",
        "map_marker_shape",
        "map_marker_ring",
        "map_style",
        "table_badge",
        "table_badge_class",
    ):
        metadata[key] = node[key]

    enrichment["sanctioned_nodes"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "policy_path": str(policy_path),
        "risk_label": meta["risk_label"],
        "country_code": meta["country_code"],
        "matched_name": meta["matched_name"],
        "map_marker_color": meta["map_marker_color"],
        "table_badge": meta["table_badge"],
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


def extract_nodes(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [dict(node) for node in payload if isinstance(node, Mapping)]

    if not isinstance(payload, Mapping):
        return []

    nodes = payload.get("nodes")

    if isinstance(nodes, list):
        return [dict(node) for node in nodes if isinstance(node, Mapping)]

    if isinstance(nodes, Mapping):
        output = []
        for address, value in nodes.items():
            if isinstance(value, Mapping):
                output.append({"address": str(address), **dict(value)})
            elif isinstance(value, list):
                padded = list(value) + [None] * max(0, 20 - len(value))
                metadata = padded[19] if isinstance(padded[19], Mapping) else {}
                output.append(
                    {
                        "address": str(address),
                        "protocol": padded[0],
                        "agent": padded[1],
                        "height": padded[4],
                        "hostname": padded[5],
                        "city": padded[6],
                        "country": padded[7],
                        "latitude": padded[8],
                        "longitude": padded[9],
                        "timezone": padded[10],
                        "asn": padded[11],
                        "organization": padded[12],
                        "provider": padded[13],
                        "metadata": dict(metadata),
                    }
                )
        return output

    for key in ("results", "data", "rows", "peers", "node_records", "reachable_nodes"):
        value = payload.get(key)

        if isinstance(value, list):
            return [dict(node) for node in value if isinstance(node, Mapping)]

        if isinstance(value, Mapping):
            return extract_nodes({"nodes": value})

    return []


def put_nodes(payload: Any, nodes: list[dict[str, Any]]) -> Any:
    if isinstance(payload, list):
        return nodes

    if not isinstance(payload, MutableMapping):
        return {"nodes": nodes}

    output = dict(payload)

    if isinstance(output.get("nodes"), Mapping):
        output["nodes"] = {
            str(node.get("canonical_address") or node.get("address") or index): node
            for index, node in enumerate(nodes)
        }
    else:
        output["nodes"] = nodes

    output.setdefault("metadata", {})
    if isinstance(output["metadata"], MutableMapping):
        output["metadata"]["sanctioned_nodes_enriched_at"] = utc_now()
        output["metadata"]["sanctioned_nodes_schema"] = SCHEMA

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context))


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    countries: dict[str, int] = {}
    sanctioned_countries: dict[str, int] = {}
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
        sanctioned_country = clean(data.get("sanctioned_country_code")) or ""
        risk = clean(data.get("risk_level")) or "unknown"
        action = clean(data.get("recommended_action")) or "unknown"

        countries[country] = countries.get(country, 0) + 1
        risk_levels[risk] = risk_levels.get(risk, 0) + 1
        actions[action] = actions.get(action, 0) + 1

        if sanctioned_country:
            sanctioned_countries[sanctioned_country] = sanctioned_countries.get(sanctioned_country, 0) + 1

        if boolish(data.get("is_sanctioned")):
            sanctioned_count += 1

        if boolish(data.get("is_restricted_overlay")):
            restricted_overlay_count += 1

        if boolish(data.get("is_policy_restricted")):
            policy_restricted_count += 1

        if boolish(data.get("is_policy_watch")):
            policy_watch_count += 1

    return {
        "schema": "zzx-bitnodes-sanctioned-nodes-summary-v3",
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "sanctioned_nodes": sanctioned_count,
        "restricted_overlay_nodes": restricted_overlay_count,
        "policy_restricted_nodes": policy_restricted_count,
        "policy_watch_nodes": policy_watch_count,
        "map_encoding": {
            "sanctioned": "red circled marker and red table badge",
            "watch": "amber circled marker and amber table badge",
            "restricted_overlay": "red overlay marker with attribution-limited badge",
        },
        "countries": dict(sorted(countries.items(), key=lambda item: (-item[1], item[0]))),
        "sanctioned_countries": dict(sorted(sanctioned_countries.items(), key=lambda item: (-item[1], item[0]))),
        "risk_levels": dict(sorted(risk_levels.items(), key=lambda item: (-item[1], item[0]))),
        "recommended_actions": dict(sorted(actions.items(), key=lambda item: (-item[1], item[0]))),
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with local policy-based sanctioned/restricted jurisdiction classification.",
        allow_abbrev=False,
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--policy", default=str(DEFAULT_POLICY_PATH))
    parser.add_argument("--write-default-policy", action="store_true")
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
