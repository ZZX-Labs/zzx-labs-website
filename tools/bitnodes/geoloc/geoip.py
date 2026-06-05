#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


APP_ROOT = Path(__file__).resolve().parents[2]
BITNODES_ROOT = APP_ROOT / "bitcoin" / "bitnodes"
DEFAULT_GEOIP_DIR = BITNODES_ROOT / "data" / "geoip"

DEFAULT_CITY_DB = DEFAULT_GEOIP_DIR / "dbip-city-lite.mmdb"
DEFAULT_ASN_DB = DEFAULT_GEOIP_DIR / "dbip-asn-lite.mmdb"
DEFAULT_COUNTRY_DB = DEFAULT_GEOIP_DIR / "dbip-country-lite.mmdb"

SCHEMA = "zzx-bitnodes-geoip-v4"
DEFAULT_PORT = 8333
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
    ip_scope: str | None = None
    ip: str | None = None
    host: str | None = None
    confidence: str = "none"
    source: str = "none"

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": SCHEMA,
            "ip": self.ip,
            "host": self.host,
            "city": self.city,
            "country_code": self.country_code,
            "country": self.country_code,
            "country_name": self.country_name,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "lat": self.latitude,
            "lon": self.longitude,
            "lng": self.longitude,
            "timezone": self.timezone,
            "asn": self.asn,
            "organization": self.organization,
            "org": self.organization,
            "provider": self.provider,
            "isp": self.provider or self.organization,
            "network_type": self.network_type,
            "network": self.network_type,
            "ip_scope": self.ip_scope,
            "confidence": self.confidence,
            "source": self.source,
            "updated_at": utc_now(),
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
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
        sort_keys=not compact,
    )
    path.write_text(text + "\n", encoding="utf-8")


def deep_get(row: Mapping[str, Any], path: str) -> Any:
    cur: Any = row
    for part in path.split("."):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part)
    return cur


def first_present(row: Mapping[str, Any], keys: tuple[str, ...] | list[str]) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)
        if value not in ("", None):
            return value
    return None


def to_float(value: Any) -> float | None:
    try:
        if value in ("", None):
            return None
        parsed = float(value)
    except Exception:
        return None
    if not math.isfinite(parsed):
        return None
    return parsed


def valid_lat(value: Any) -> float | None:
    value = to_float(value)
    if value is None:
        return None
    return value if -90 <= value <= 90 else None


def valid_lon(value: Any) -> float | None:
    value = to_float(value)
    if value is None:
        return None
    return value if -180 <= value <= 180 else None


def existing_coordinates(node: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = first_present(
        node,
        (
            "latitude",
            "lat",
            "geo.latitude",
            "geo.lat",
            "geoip.latitude",
            "geoip.lat",
            "geoip_data.latitude",
            "geoip_data.lat",
            "geoloc.latitude",
            "geoloc.lat",
            "location.latitude",
            "location.lat",
            "metadata.latitude",
            "metadata.lat",
        ),
    )
    lon = first_present(
        node,
        (
            "longitude",
            "lon",
            "lng",
            "geo.longitude",
            "geo.lon",
            "geo.lng",
            "geoip.longitude",
            "geoip.lon",
            "geoip.lng",
            "geoip_data.longitude",
            "geoip_data.lon",
            "geoip_data.lng",
            "geoloc.longitude",
            "geoloc.lon",
            "geoloc.lng",
            "location.longitude",
            "location.lon",
            "location.lng",
            "metadata.longitude",
            "metadata.lon",
            "metadata.lng",
        ),
    )
    return valid_lat(lat), valid_lon(lon)


def strip_ipv6_brackets(value: str) -> str:
    value = str(value or "").strip()
    if value.startswith("[") and "]" in value:
        return value[1:value.index("]")]
    return value.strip("[]")


def parse_address_host_port(value: Any) -> tuple[str, int | None]:
    raw = str(value or "").strip()
    if not raw:
        return "", None

    if raw.startswith("[") and "]" in raw:
        host = raw[1:raw.index("]")]
        rest = raw[raw.index("]") + 1 :]
        if rest.startswith(":") and rest[1:].isdigit():
            return host, int(rest[1:])
        return host, None

    lower = raw.lower()

    if ".onion:" in lower or ".i2p:" in lower:
        host, port = raw.rsplit(":", 1)
        return host.strip("[]"), int(port) if port.isdigit() else None

    if lower.endswith(".onion") or lower.endswith(".i2p"):
        return raw.strip("[]"), None

    if raw.count(":") == 1 and "." in raw:
        host, port = raw.rsplit(":", 1)
        return host.strip("[]"), int(port) if port.isdigit() else None

    if raw.count(":") > 1:
        candidate = raw.strip("[]")
        try:
            ipaddress.ip_address(candidate)
            return candidate, None
        except ValueError:
            host, maybe_port = raw.rsplit(":", 1)
            if maybe_port.isdigit():
                return host.strip("[]"), int(maybe_port)

    return raw.strip("[]"), None


def extract_host_from_node(node: Mapping[str, Any]) -> str:
    for key in (
        "ip",
        "host",
        "hostname",
        "address",
        "node",
        "addr",
        "id",
        "metadata.ip",
        "metadata.host",
        "metadata.hostname",
    ):
        value = deep_get(node, key) if "." in key else node.get(key)
        if value not in ("", None):
            host, _port = parse_address_host_port(value)
            if host:
                return host
    return ""


def is_ip_address(value: str) -> bool:
    try:
        ipaddress.ip_address(strip_ipv6_brackets(value))
        return True
    except ValueError:
        return False


def normalize_ip(value: str) -> str | None:
    host = strip_ipv6_brackets(value)
    try:
        return str(ipaddress.ip_address(host))
    except ValueError:
        return None


def normalize_asn(value: Any) -> str | None:
    text = clean(value).upper()
    if not text:
        return None
    if text.startswith("AS") and text[2:].strip().isdigit():
        return "AS" + text[2:].strip()
    if text.isdigit():
        return f"AS{text}"
    match = re.search(r"\bAS\s*(\d{1,10})\b", text, re.IGNORECASE)
    if match:
        return f"AS{match.group(1)}"
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

    return "dns" if value else "unknown"


def ip_scope(host: str) -> str:
    try:
        ip = ipaddress.ip_address(strip_ipv6_brackets(host))
    except ValueError:
        return "non-ip"

    if ip.is_loopback:
        return "loopback"
    if ip.is_link_local:
        return "link-local"
    if ip.is_private:
        return "private"
    if ip.is_multicast:
        return "multicast"
    if ip.is_reserved:
        return "reserved"
    if ip.is_unspecified:
        return "unspecified"
    if ip.is_global:
        return "public"

    return "non-public"


def deterministic_point(seed: str, band: str = "public") -> tuple[float, float]:
    digest = hashlib.sha256(seed.encode("utf-8", errors="ignore")).digest()
    a = int.from_bytes(digest[:8], "big") / float(2**64 - 1)
    b = int.from_bytes(digest[8:16], "big") / float(2**64 - 1)

    if band == "tor":
        lat_min, lat_max = -58.0, 58.0
        lon_min, lon_max = -42.0, -18.0
    elif band == "i2p":
        lat_min, lat_max = -58.0, 58.0
        lon_min, lon_max = 18.0, 42.0
    elif band == "dns":
        lat_min, lat_max = -62.0, 62.0
        lon_min, lon_max = 55.0, 165.0
    else:
        lat_min, lat_max = -62.0, 72.0
        lon_min, lon_max = -170.0, 170.0

    lat = lat_min + (lat_max - lat_min) * a
    lon = lon_min + (lon_max - lon_min) * b

    return round(lat, 6), round(lon, 6)


def has_valid_coordinates(record: GeoIPRecord) -> bool:
    return valid_lat(record.latitude) is not None and valid_lon(record.longitude) is not None


def fallback_record(host: str, network_type: str, scope: str, reason: str) -> GeoIPRecord:
    band = network_type if network_type in {"tor", "i2p", "dns"} else "public"
    lat, lon = deterministic_point(host or reason, band=band)

    return GeoIPRecord(
        city=None,
        country_code="ZZ",
        country_name="Synthetic Map Fallback",
        latitude=lat,
        longitude=lon,
        timezone="Etc/UTC",
        asn=None,
        organization=None,
        provider=None,
        network_type=network_type,
        ip_scope=scope,
        ip=normalize_ip(host),
        host=host,
        confidence="synthetic",
        source=f"deterministic-fallback:{reason}",
    )


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
        self.open_error = ""

        if self.enabled:
            self.open()

    def open(self) -> None:
        if not self.enabled:
            return

        try:
            import geoip2.database  # type: ignore

            if self.city_db and self.city_db.exists() and self.city_db.stat().st_size > 0:
                self.city_reader = geoip2.database.Reader(str(self.city_db))

            if self.asn_db and self.asn_db.exists() and self.asn_db.stat().st_size > 0:
                self.asn_reader = geoip2.database.Reader(str(self.asn_db))

            if self.country_db and self.country_db.exists() and self.country_db.stat().st_size > 0:
                self.country_reader = geoip2.database.Reader(str(self.country_db))

        except Exception as exc:
            self.open_error = str(exc)
            self.city_reader = None
            self.asn_reader = None
            self.country_reader = None

        print(
            "[geoip] readers "
            f"city={bool(self.city_reader)} path={self.city_db} "
            f"asn={bool(self.asn_reader)} path={self.asn_db} "
            f"country={bool(self.country_reader)} path={self.country_db} "
            f"error={self.open_error or 'none'}",
            flush=True,
        )

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

    def __enter__(self) -> GeoIPLookup:
        if self.enabled and not (self.city_reader or self.asn_reader or self.country_reader):
            self.open()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def lookup_city(self, ip: str) -> dict[str, Any]:
        if not self.city_reader:
            return {}

        try:
            response = self.city_reader.city(ip)
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

    def lookup_country(self, ip: str) -> dict[str, Any]:
        if not self.country_reader:
            return {}

        try:
            response = self.country_reader.country(ip)
            return {
                "country_code": response.country.iso_code,
                "country_name": response.country.name,
            }
        except Exception:
            return {}

    def lookup_asn(self, ip: str) -> dict[str, Any]:
        if not self.asn_reader:
            return {}

        try:
            response = self.asn_reader.asn(ip)
            org = clean(response.autonomous_system_organization)
            return {
                "asn": normalize_asn(response.autonomous_system_number),
                "organization": org or None,
                "provider": org or None,
            }
        except Exception:
            return {}

    def lookup(self, address_or_host: Any, node: Mapping[str, Any] | None = None) -> GeoIPRecord:
        node = node or {}
        host = extract_host_from_node(node) if isinstance(node, Mapping) else ""
        if not host:
            host, _port = parse_address_host_port(address_or_host)

        host = strip_ipv6_brackets(host)

        if not host:
            return fallback_record("empty", "unknown", "empty", "empty-host")

        network_type = address_network(host)

        if network_type in {"tor", "i2p"}:
            return fallback_record(host, network_type, "overlay", network_type)

        ip = normalize_ip(host)

        if not ip:
            return fallback_record(host, network_type, "non-ip", "dns-unresolved")

        scope = ip_scope(ip)

        if scope != "public":
            return fallback_record(ip, network_type, scope, f"ip-{scope}")

        city_data = self.lookup_city(ip)
        country_data = self.lookup_country(ip)
        asn_data = self.lookup_asn(ip)

        source_parts = []

        if city_data:
            source_parts.append("city")
        if country_data:
            source_parts.append("country")
        if asn_data:
            source_parts.append("asn")

        record = GeoIPRecord(
            city=city_data.get("city"),
            country_code=city_data.get("country_code") or country_data.get("country_code"),
            country_name=city_data.get("country_name") or country_data.get("country_name"),
            latitude=valid_lat(city_data.get("latitude")),
            longitude=valid_lon(city_data.get("longitude")),
            timezone=city_data.get("timezone"),
            asn=asn_data.get("asn"),
            organization=asn_data.get("organization"),
            provider=asn_data.get("provider"),
            network_type=network_type,
            ip_scope=scope,
            ip=ip,
            host=host,
            confidence="high" if city_data else "medium" if country_data or asn_data else "none",
            source="+".join(source_parts) if source_parts else "none",
        )

        if has_valid_coordinates(record):
            return record

        fallback = fallback_record(ip, network_type, scope, "missing-city-coordinate")
        fallback.asn = record.asn
        fallback.organization = record.organization
        fallback.provider = record.provider
        fallback.country_code = record.country_code or fallback.country_code
        fallback.country_name = record.country_name or fallback.country_name
        fallback.ip = ip
        fallback.host = host
        fallback.source = f"{record.source}+{fallback.source}" if record.source != "none" else fallback.source

        return fallback


def ensure_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def set_if_empty(row: dict[str, Any], key: str, value: Any) -> None:
    if row.get(key) in ("", None) and value not in ("", None):
        row[key] = value


def mirror_geo_fields(output: dict[str, Any], data: dict[str, Any]) -> None:
    metadata = ensure_dict(output.get("metadata"))
    output["metadata"] = metadata

    output["geoip"] = data
    output["geoip_data"] = data

    geo = ensure_dict(output.get("geo"))
    geoloc = ensure_dict(output.get("geoloc"))
    location = ensure_dict(output.get("location"))

    for block in (geo, geoloc, location, metadata):
        for key, value in data.items():
            if key not in block or block.get(key) in ("", None):
                block[key] = value

    output["geo"] = geo
    output["geoloc"] = geoloc
    output["location"] = location

    for key in (
        "ip",
        "host",
        "city",
        "country_code",
        "country_name",
        "latitude",
        "longitude",
        "timezone",
        "asn",
        "organization",
        "org",
        "provider",
        "isp",
        "network",
        "network_type",
        "ip_scope",
    ):
        set_if_empty(output, key, data.get(key))

    set_if_empty(output, "country", data.get("country_code"))
    set_if_empty(output, "lat", data.get("latitude"))
    set_if_empty(output, "lon", data.get("longitude"))
    set_if_empty(output, "lng", data.get("longitude"))

    output["geoip_confidence"] = data.get("confidence")
    output["geoip_source"] = data.get("source")


def node_address(node: Mapping[str, Any]) -> str:
    return clean(
        node.get("address")
        or node.get("node")
        or node.get("addr")
        or node.get("ip")
        or node.get("host")
        or node.get("hostname")
        or node.get("id")
        or ""
    )


def enrich_node_dict(node: Mapping[str, Any], geoip: GeoIPLookup) -> dict[str, Any]:
    output = dict(node)
    address = node_address(output)
    record = geoip.lookup(address, output)
    data = record.as_dict()

    old_lat, old_lon = existing_coordinates(output)
    if old_lat is not None and old_lon is not None:
        data["latitude"] = old_lat
        data["longitude"] = old_lon
        data["lat"] = old_lat
        data["lon"] = old_lon
        data["lng"] = old_lon
        data["source"] = f"{data.get('source') or 'none'}+preserved-existing"

    mirror_geo_fields(output, data)

    output.setdefault("enrichment", {})
    output["enrichment"]["geoip"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "source": data.get("source"),
        "confidence": data.get("confidence"),
        "city_db": str(geoip.city_db) if geoip.city_db else "",
        "asn_db": str(geoip.asn_db) if geoip.asn_db else "",
        "country_db": str(geoip.country_db) if geoip.country_db else "",
        "readers": {
            "city": bool(geoip.city_reader),
            "asn": bool(geoip.asn_reader),
            "country": bool(geoip.country_reader),
        },
    }

    return output


def enrich_node_array(address: str, values: list[Any], geoip: GeoIPLookup) -> list[Any]:
    padded = list(values)

    while len(padded) < 20:
        padded.append(None)

    metadata = padded[19] if isinstance(padded[19], Mapping) else {}

    node_view = {
        "address": address,
        "hostname": padded[5],
        "city": padded[6],
        "country_code": padded[7],
        "latitude": padded[8],
        "longitude": padded[9],
        "timezone": padded[10],
        "asn": padded[11],
        "organization": padded[12],
        "provider": padded[13],
        "county": padded[14],
        "zip": padded[15],
        "w3w": padded[16],
        "geohash": padded[17],
        "asn_location": padded[18],
        "metadata": metadata,
    }

    record = geoip.lookup(address, node_view)
    data = record.as_dict()

    old_lat = valid_lat(padded[8]) or valid_lat(metadata.get("latitude")) or valid_lat(deep_get(metadata, "geoip.latitude"))
    old_lon = valid_lon(padded[9]) or valid_lon(metadata.get("longitude")) or valid_lon(deep_get(metadata, "geoip.longitude"))

    if old_lat is not None and old_lon is not None:
        data["latitude"] = old_lat
        data["longitude"] = old_lon
        data["lat"] = old_lat
        data["lon"] = old_lon
        data["lng"] = old_lon
        data["source"] = f"{data.get('source') or 'none'}+preserved-existing"

    if padded[6] in ("", None):
        padded[6] = data.get("city")

    if padded[7] in ("", None):
        padded[7] = data.get("country_code")

    if padded[8] in ("", None):
        padded[8] = data.get("latitude")

    if padded[9] in ("", None):
        padded[9] = data.get("longitude")

    if padded[10] in ("", None):
        padded[10] = data.get("timezone")

    if padded[11] in ("", None):
        padded[11] = data.get("asn")

    if padded[12] in ("", None):
        padded[12] = data.get("organization")

    if padded[13] in ("", None):
        padded[13] = data.get("provider")

    metadata = ensure_dict(metadata)
    metadata["geoip"] = data
    metadata["geoip_data"] = data
    metadata["geoloc"] = {**ensure_dict(metadata.get("geoloc")), **data}
    metadata["location"] = {**ensure_dict(metadata.get("location")), **data}
    metadata["latitude"] = data.get("latitude")
    metadata["longitude"] = data.get("longitude")
    metadata["lat"] = data.get("latitude")
    metadata["lon"] = data.get("longitude")
    metadata["lng"] = data.get("longitude")
    metadata["network_type"] = data.get("network_type")
    metadata["network"] = data.get("network_type")
    metadata["ip_scope"] = data.get("ip_scope")
    metadata["geoip_confidence"] = data.get("confidence")
    metadata["geoip_source"] = data.get("source")
    metadata["ip"] = data.get("ip")
    metadata["host"] = data.get("host")
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
                enrich_node_dict(node, lookup) if isinstance(node, Mapping) else node
                for node in nodes
            ]

        if isinstance(nodes, Mapping):
            output: dict[str, Any] = {}

            for address, values in nodes.items():
                if isinstance(values, list):
                    output[address] = enrich_node_array(str(address), values, lookup)
                elif isinstance(values, Mapping):
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

    payload = dict(payload)
    payload["nodes"] = enrich_nodes(
        payload["nodes"],
        city_db=city_db,
        asn_db=asn_db,
        country_db=country_db,
        enabled=enabled,
    )

    payload.setdefault("metadata", {})
    payload["metadata"]["geoip_enriched_at"] = utc_now()
    payload["metadata"]["geoip_schema"] = SCHEMA

    return payload


def summarize_payload(payload: Any) -> dict[str, Any]:
    nodes: list[Any] = []

    if isinstance(payload, Mapping):
        raw_nodes = payload.get("nodes", payload.get("results", []))
        if isinstance(raw_nodes, Mapping):
            nodes = list(raw_nodes.values())
        elif isinstance(raw_nodes, list):
            nodes = raw_nodes
    elif isinstance(payload, list):
        nodes = payload

    total = len(nodes)
    geocoded = 0
    high = 0
    medium = 0
    overlay = 0
    synthetic = 0
    none = 0

    for node in nodes:
        geo = None
        lat = None
        lon = None

        if isinstance(node, Mapping):
            geo = node.get("geoip") or node.get("geoip_data")
            lat, lon = existing_coordinates(node)
        elif isinstance(node, list):
            if len(node) > 9:
                lat = valid_lat(node[8])
                lon = valid_lon(node[9])
            if len(node) > 19 and isinstance(node[19], Mapping):
                geo = node[19].get("geoip") or node[19].get("geoip_data")

        if lat is not None and lon is not None:
            geocoded += 1

        confidence = clean(geo.get("confidence")).lower() if isinstance(geo, Mapping) else ""

        if confidence == "high":
            high += 1
        elif confidence == "medium":
            medium += 1
        elif confidence == "overlay":
            overlay += 1
        elif confidence == "synthetic":
            synthetic += 1
        else:
            none += 1

    return {
        "schema": "zzx-bitnodes-geoip-summary-v4",
        "generated_at": utc_now(),
        "total_nodes": total,
        "geocoded_nodes": geocoded,
        "confidence_counts": {
            "high": high,
            "medium": medium,
            "overlay": overlay,
            "synthetic": synthetic,
            "none": none,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrich Bitnodes node JSON with GeoIP metadata.")

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--city-db", default=str(DEFAULT_CITY_DB))
    parser.add_argument("--asn-db", default=str(DEFAULT_ASN_DB))
    parser.add_argument("--country-db", default=str(DEFAULT_COUNTRY_DB))
    parser.add_argument("--disable", action="store_true")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input))
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

    write_json(Path(args.output), output_payload, compact=args.compact)

    summary = summarize_payload(output_payload)

    if args.summary:
        write_json(Path(args.summary), summary, compact=args.compact)

    print(
        "geoip enrichment complete: "
        f"{args.output} "
        f"nodes={summary['total_nodes']} "
        f"geocoded={summary['geocoded_nodes']} "
        f"confidence={summary['confidence_counts']}",
        flush=True,
    )

    if enabled and summary["total_nodes"] and summary["geocoded_nodes"] == 0:
        raise SystemExit("geoip enrichment produced zero coordinate-bearing nodes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
