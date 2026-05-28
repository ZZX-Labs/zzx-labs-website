#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ipaddress
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GEOIP_DIR = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geoip"

DEFAULT_CITY_DB = DEFAULT_GEOIP_DIR / "dbip-city-lite.mmdb"
DEFAULT_ASN_DB = DEFAULT_GEOIP_DIR / "dbip-asn-lite.mmdb"
DEFAULT_COUNTRY_DB = DEFAULT_GEOIP_DIR / "dbip-country-lite.mmdb"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}


@dataclass
class GeoIPRecord:
    city: str | None = None
    country_code: str | None = None
    country_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    timezone: str | None = None
    asn: str | None = None
    organization: str | None = None
    provider: str | None = None
    network_type: str | None = None
    confidence: str = "none"
    source: str = "none"

    def as_bitnodes_fields(self) -> list[Any]:
        return [
            self.city,
            self.country_code,
            self.latitude,
            self.longitude,
            self.timezone,
            self.asn,
            self.organization,
        ]

    def as_dict(self) -> dict[str, Any]:
        return {
            "city": self.city,
            "country_code": self.country_code,
            "country_name": self.country_name,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "timezone": self.timezone,
            "asn": self.asn,
            "organization": self.organization,
            "provider": self.provider,
            "network_type": self.network_type,
            "confidence": self.confidence,
            "source": self.source,
        }


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


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
        json.dump(payload, handle, indent=2, ensure_ascii=False, sort_keys=True)
        handle.write("\n")


def is_ip_address(value: str) -> bool:
    try:
        ipaddress.ip_address(value.strip("[]"))
        return True
    except ValueError:
        return False


def strip_brackets(value: str) -> str:
    value = str(value or "").strip()

    if value.startswith("[") and "]" in value:
        return value[1:value.index("]")]

    return value


def extract_host(address: str) -> str:
    value = str(address or "").strip()

    if value.startswith("[") and "]:" in value:
        return value.split("]:", 1)[0].lstrip("[")

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1]

    lower = value.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        return value.rsplit(":", 1)[0]

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)

        if port.isdigit():
            return host

    if value.count(":") > 1:
        try:
            ipaddress.ip_address(value)
            return value
        except ValueError:
            host, maybe_port = value.rsplit(":", 1)

            if maybe_port.isdigit():
                return host

    return value


def normalize_asn(value: Any) -> str | None:
    if value in ("", None):
        return None

    text = str(value).strip().upper()

    if not text:
        return None

    if text.startswith("AS"):
        return text

    if text.isdigit():
        return f"AS{text}"

    return text


def address_network(host: str) -> str:
    value = str(host or "").strip().lower()

    if value.endswith(".onion"):
        return "tor"

    if value.endswith(".i2p"):
        return "i2p"

    try:
        ip = ipaddress.ip_address(value.strip("[]"))

        if ip.version == 4:
            return "ipv4"

        if ip.version == 6:
            if ip in ipaddress.ip_network("fc00::/8"):
                return "cjdns"

            return "ipv6"

    except ValueError:
        pass

    return "dns"


def ip_scope(host: str) -> str:
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return "non-ip"

    if ip.is_private:
        return "private"

    if ip.is_loopback:
        return "loopback"

    if ip.is_link_local:
        return "link-local"

    if ip.is_multicast:
        return "multicast"

    if ip.is_reserved:
        return "reserved"

    if ip.is_unspecified:
        return "unspecified"

    return "public"


class GeoIPLookup:
    def __init__(
        self,
        city_db: str | Path | None = DEFAULT_CITY_DB,
        asn_db: str | Path | None = DEFAULT_ASN_DB,
        country_db: str | Path | None = DEFAULT_COUNTRY_DB,
        enabled: bool = True,
    ) -> None:
        self.enabled = enabled
        self.city_db = Path(city_db) if city_db else None
        self.asn_db = Path(asn_db) if asn_db else None
        self.country_db = Path(country_db) if country_db else None

        self.city_reader = None
        self.asn_reader = None
        self.country_reader = None

        if self.enabled:
            self.open()

    def open(self) -> None:
        if not self.enabled:
            return

        try:
            import geoip2.database  # type: ignore

            if self.city_db and self.city_db.exists():
                self.city_reader = geoip2.database.Reader(str(self.city_db))

            if self.asn_db and self.asn_db.exists():
                self.asn_reader = geoip2.database.Reader(str(self.asn_db))

            if self.country_db and self.country_db.exists():
                self.country_reader = geoip2.database.Reader(str(self.country_db))

        except Exception:
            self.city_reader = None
            self.asn_reader = None
            self.country_reader = None

    def close(self) -> None:
        for reader in (self.city_reader, self.asn_reader, self.country_reader):
            try:
                if reader:
                    reader.close()
            except Exception:
                pass

        self.city_reader = None
        self.asn_reader = None
        self.country_reader = None

    def __enter__(self) -> "GeoIPLookup":
        if self.enabled and not (self.city_reader or self.asn_reader or self.country_reader):
            self.open()

        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def lookup_city(self, host: str) -> dict[str, Any]:
        if not self.city_reader:
            return {}

        try:
            response = self.city_reader.city(host)

            return {
                "city": response.city.name,
                "country_code": response.country.iso_code,
                "country_name": response.country.name,
                "latitude": response.location.latitude,
                "longitude": response.location.longitude,
                "timezone": response.location.time_zone,
            }

        except Exception:
            return {}

    def lookup_country(self, host: str) -> dict[str, Any]:
        if not self.country_reader:
            return {}

        try:
            response = self.country_reader.country(host)

            return {
                "country_code": response.country.iso_code,
                "country_name": response.country.name,
            }

        except Exception:
            return {}

    def lookup_asn(self, host: str) -> dict[str, Any]:
        if not self.asn_reader:
            return {}

        try:
            response = self.asn_reader.asn(host)
            org = clean(response.autonomous_system_organization)

            return {
                "asn": normalize_asn(response.autonomous_system_number),
                "organization": org or None,
                "provider": org or None,
            }

        except Exception:
            return {}

    def lookup(self, address_or_host: str) -> GeoIPRecord:
        host = strip_brackets(extract_host(address_or_host))

        if not host:
            return GeoIPRecord(network_type="unknown", source="empty", confidence="none")

        network_type = address_network(host)

        if network_type in {"tor", "i2p"}:
            return GeoIPRecord(network_type=network_type, source=network_type, confidence="overlay")

        if not is_ip_address(host):
            return GeoIPRecord(network_type=network_type, source="dns-unresolved", confidence="none")

        scope = ip_scope(host)

        if scope != "public":
            return GeoIPRecord(network_type=network_type, source=f"ip-{scope}", confidence="none")

        city_data = self.lookup_city(host)
        country_data = self.lookup_country(host)
        asn_data = self.lookup_asn(host)

        source_parts = []
        if city_data:
            source_parts.append("city")
        if country_data:
            source_parts.append("country")
        if asn_data:
            source_parts.append("asn")

        return GeoIPRecord(
            city=city_data.get("city"),
            country_code=city_data.get("country_code") or country_data.get("country_code"),
            country_name=city_data.get("country_name") or country_data.get("country_name"),
            latitude=city_data.get("latitude"),
            longitude=city_data.get("longitude"),
            timezone=city_data.get("timezone"),
            asn=asn_data.get("asn"),
            organization=asn_data.get("organization"),
            provider=asn_data.get("provider"),
            network_type=network_type,
            confidence="high" if city_data else "medium" if country_data or asn_data else "none",
            source="+".join(source_parts) if source_parts else "none",
        )


def enrich_node_dict(node: dict[str, Any], geoip: GeoIPLookup) -> dict[str, Any]:
    output = dict(node)
    address = clean(output.get("address") or output.get("node") or output.get("addr") or output.get("host"))
    record = geoip.lookup(address)

    data = record.as_dict()
    output["geoip_data"] = data

    for key in ("city", "country_code", "latitude", "longitude", "timezone", "asn", "organization", "provider"):
        if output.get(key) in ("", None):
            output[key] = data.get(key)

    if output.get("country") in ("", None):
        output["country"] = data.get("country_code")

    if output.get("network_type") in ("", None):
        output["network_type"] = data.get("network_type")

    output["geoip_confidence"] = data.get("confidence")
    output["geoip_source"] = data.get("source")

    output.setdefault("enrichment", {})
    output["enrichment"]["geoip"] = {
        "status": "ok",
        "updated_at": utc_now(),
        "source": data.get("source"),
        "confidence": data.get("confidence"),
    }

    return output


def enrich_node_array(address: str, values: list[Any], geoip: GeoIPLookup) -> list[Any]:
    padded = list(values)

    while len(padded) < 20:
        padded.append(None)

    record = geoip.lookup(address)

    if padded[6] in ("", None):
        padded[6] = record.city

    if padded[7] in ("", None):
        padded[7] = record.country_code

    if padded[8] in ("", None):
        padded[8] = record.latitude

    if padded[9] in ("", None):
        padded[9] = record.longitude

    if padded[10] in ("", None):
        padded[10] = record.timezone

    if padded[11] in ("", None):
        padded[11] = record.asn

    if padded[12] in ("", None):
        padded[12] = record.organization

    if len(padded) > 13 and padded[13] in ("", None):
        padded[13] = record.provider

    if len(padded) > 19:
        metadata = padded[19] if isinstance(padded[19], dict) else {}
        metadata["geoip"] = record.as_dict()
        metadata["network_type"] = record.network_type
        padded[19] = metadata

    return padded


def enrich_nodes(
    nodes: Any,
    context: dict[str, Any] | None = None,
    city_db: str | Path | None = None,
    asn_db: str | Path | None = None,
    country_db: str | Path | None = None,
    enabled: bool = True,
) -> Any:
    context = context or {}

    city_db = city_db or context.get("city_db") or context.get("geoip_city_db") or DEFAULT_CITY_DB
    asn_db = asn_db or context.get("asn_db") or context.get("geoip_asn_db") or DEFAULT_ASN_DB
    country_db = country_db or context.get("country_db") or context.get("geoip_country_db") or DEFAULT_COUNTRY_DB

    if not enabled:
        return nodes

    with GeoIPLookup(
        city_db=city_db,
        asn_db=asn_db,
        country_db=country_db,
        enabled=enabled,
    ) as lookup:
        if isinstance(nodes, list):
            return [
                enrich_node_dict(node, lookup) if isinstance(node, dict) else node
                for node in nodes
            ]

        if isinstance(nodes, dict):
            output: dict[str, Any] = {}

            for address, values in nodes.items():
                if isinstance(values, list):
                    output[address] = enrich_node_array(address, values, lookup)
                elif isinstance(values, dict):
                    item = dict(values)
                    item.setdefault("address", address)
                    output[address] = enrich_node_dict(item, lookup)
                else:
                    output[address] = values

            return output

    return nodes


def enrich_snapshot_payload(
    payload: dict[str, Any],
    city_db: str | Path | None = DEFAULT_CITY_DB,
    asn_db: str | Path | None = DEFAULT_ASN_DB,
    country_db: str | Path | None = DEFAULT_COUNTRY_DB,
    enabled: bool = True,
) -> dict[str, Any]:
    if "nodes" not in payload:
        return payload

    payload["nodes"] = enrich_nodes(
        payload["nodes"],
        city_db=city_db,
        asn_db=asn_db,
        country_db=country_db,
        enabled=enabled,
    )

    payload.setdefault("metadata", {})
    payload["metadata"]["geoip_enriched_at"] = utc_now()

    return payload


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes node JSON with GeoIP metadata."
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--city-db", default=str(DEFAULT_CITY_DB))
    parser.add_argument("--asn-db", default=str(DEFAULT_ASN_DB))
    parser.add_argument("--country-db", default=str(DEFAULT_COUNTRY_DB))
    parser.add_argument("--disable", action="store_true")

    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    payload = read_json(input_path)

    enabled = not args.disable

    if isinstance(payload, dict) and "nodes" in payload:
        output_payload = enrich_snapshot_payload(
            payload,
            city_db=args.city_db,
            asn_db=args.asn_db,
            country_db=args.country_db,
            enabled=enabled,
        )
    else:
        output_payload = enrich_nodes(
            payload,
            city_db=args.city_db,
            asn_db=args.asn_db,
            country_db=args.country_db,
            enabled=enabled,
        )

    write_json(output_path, output_payload)

    print(f"geoip enrichment complete: {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
