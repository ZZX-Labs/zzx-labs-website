#!/usr/bin/env python3
"""
ZZX-Labs Bitnodes GeoIP enrichment helpers.

Supports optional MaxMind GeoLite2 City and ASN databases.

Expected files:

    data/geoip/GeoLite2-City.mmdb
    data/geoip/GeoLite2-ASN.mmdb

Dependency:

    geoip2

Install:

    python -m pip install geoip2
"""

from __future__ import annotations

import ipaddress
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_CITY_DB = Path("data/geoip/GeoLite2-City.mmdb")
DEFAULT_ASN_DB = Path("data/geoip/GeoLite2-ASN.mmdb")


@dataclass
class GeoIPRecord:
    city: str | None = None
    country_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    timezone: str | None = None
    asn: str | None = None
    organization: str | None = None

    def as_bitnodes_fields(self) -> list[Any]:
        return [
            self.city,
            self.country_code,
            self.latitude,
            self.longitude,
            self.timezone,
            self.asn,
            self.organization
        ]

    def as_dict(self) -> dict[str, Any]:
        return {
            "city": self.city,
            "country_code": self.country_code,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "timezone": self.timezone,
            "asn": self.asn,
            "organization": self.organization
        }


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            indent=2,
            ensure_ascii=False,
            sort_keys=True
        )

        handle.write("\n")


def is_ip_address(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return False


def strip_brackets(value: str) -> str:
    value = value.strip()

    if value.startswith("[") and "]" in value:
        return value[1:value.index("]")]

    return value


def extract_host(address: str) -> str:
    value = str(address).strip()

    if value.startswith("[") and "]:" in value:
        return value.split("]:", 1)[0].lstrip("[")

    if value.startswith("[") and value.endswith("]"):
        return value[1:-1]

    if ".onion" in value:
        return value.rsplit(":", 1)[0]

    if value.count(":") == 1:
        host, port = value.rsplit(":", 1)

        if port.isdigit():
            return host

    if value.count(":") > 1:
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


class GeoIPLookup:
    def __init__(
        self,
        city_db: str | Path | None = DEFAULT_CITY_DB,
        asn_db: str | Path | None = DEFAULT_ASN_DB,
        enabled: bool = True
    ) -> None:

        self.enabled = enabled
        self.city_db = Path(city_db) if city_db else None
        self.asn_db = Path(asn_db) if asn_db else None

        self.city_reader = None
        self.asn_reader = None

        if self.enabled:
            self.open()

    def open(self) -> None:
        if not self.enabled:
            return

        try:
            import geoip2.database  # type: ignore

            if self.city_db and self.city_db.exists():
                self.city_reader = geoip2.database.Reader(
                    str(self.city_db)
                )

            if self.asn_db and self.asn_db.exists():
                self.asn_reader = geoip2.database.Reader(
                    str(self.asn_db)
                )

        except Exception:
            self.city_reader = None
            self.asn_reader = None

    def close(self) -> None:
        for reader in (self.city_reader, self.asn_reader):
            try:
                if reader:
                    reader.close()
            except Exception:
                pass

        self.city_reader = None
        self.asn_reader = None

    def __enter__(self) -> "GeoIPLookup":
        if self.enabled and not (
            self.city_reader or self.asn_reader
        ):
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
                "latitude": response.location.latitude,
                "longitude": response.location.longitude,
                "timezone": response.location.time_zone
            }

        except Exception:
            return {}

    def lookup_asn(self, host: str) -> dict[str, Any]:
        if not self.asn_reader:
            return {}

        try:
            response = self.asn_reader.asn(host)

            return {
                "asn": normalize_asn(
                    response.autonomous_system_number
                ),
                "organization": response.autonomous_system_organization
            }

        except Exception:
            return {}

    def lookup(self, address_or_host: str) -> GeoIPRecord:
        host = extract_host(address_or_host)
        host = strip_brackets(host)

        if not host:
            return GeoIPRecord()

        if ".onion" in host.lower():
            return GeoIPRecord()

        if not is_ip_address(host):
            return GeoIPRecord()

        city_data = self.lookup_city(host)
        asn_data = self.lookup_asn(host)

        return GeoIPRecord(
            city=city_data.get("city"),
            country_code=city_data.get("country_code"),
            latitude=city_data.get("latitude"),
            longitude=city_data.get("longitude"),
            timezone=city_data.get("timezone"),
            asn=asn_data.get("asn"),
            organization=asn_data.get("organization")
        )


def enrich_node_array(
    address: str,
    values: list[Any],
    geoip: GeoIPLookup
) -> list[Any]:
    """
    Bitnodes-compatible node array:

        [
            protocol_version,
            user_agent,
            connected_since,
            services,
            height,
            hostname,
            city,
            country_code,
            latitude,
            longitude,
            timezone,
            asn,
            organization
        ]
    """

    padded = list(values)

    while len(padded) < 13:
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

    return padded[:13]


def enrich_nodes(
    nodes: dict[str, list[Any]],
    city_db: str | Path | None = DEFAULT_CITY_DB,
    asn_db: str | Path | None = DEFAULT_ASN_DB,
    enabled: bool = True
) -> dict[str, list[Any]]:

    if not enabled:
        return nodes

    output: dict[str, list[Any]] = {}

    with GeoIPLookup(
        city_db=city_db,
        asn_db=asn_db,
        enabled=enabled
    ) as lookup:

        for address, values in nodes.items():
            output[address] = enrich_node_array(
                address,
                values,
                lookup
            )

    return output


def enrich_snapshot_payload(
    payload: dict[str, Any],
    city_db: str | Path | None = DEFAULT_CITY_DB,
    asn_db: str | Path | None = DEFAULT_ASN_DB,
    enabled: bool = True
) -> dict[str, Any]:

    if "nodes" not in payload:
        return payload

    payload["nodes"] = enrich_nodes(
        payload["nodes"],
        city_db=city_db,
        asn_db=asn_db,
        enabled=enabled
    )

    return payload


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes node JSON with GeoIP metadata."
    )

    parser.add_argument(
        "--input",
        required=True,
        help=(
            "Input JSON file containing either "
            "{'nodes': {...}} or a raw node dictionary."
        )
    )

    parser.add_argument(
        "--output",
        required=True,
        help="Output JSON file."
    )

    parser.add_argument(
        "--city-db",
        default=str(DEFAULT_CITY_DB),
        help="Path to GeoLite2-City.mmdb."
    )

    parser.add_argument(
        "--asn-db",
        default=str(DEFAULT_ASN_DB),
        help="Path to GeoLite2-ASN.mmdb."
    )

    parser.add_argument(
        "--disable",
        action="store_true",
        help="Disable GeoIP enrichment."
    )

    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    payload = load_json(input_path)

    enabled = not args.disable

    if isinstance(payload, dict) and "nodes" in payload:

        payload = enrich_snapshot_payload(
            payload,
            city_db=args.city_db,
            asn_db=args.asn_db,
            enabled=enabled
        )

        output_payload = payload

    else:

        output_payload = enrich_nodes(
            payload,
            city_db=args.city_db,
            asn_db=args.asn_db,
            enabled=enabled
        )

    write_json(output_path, output_payload)

    print(
        f"geoip enrichment complete: "
        f"{output_path}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
