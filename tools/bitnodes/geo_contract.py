#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import ipaddress
import json
import math
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping

try:
    import geoip2.database  # type: ignore
except Exception:  # pragma: no cover
    geoip2 = None

ROOT = Path(__file__).resolve().parents[2]
BITNODES_ROOT = ROOT / "bitcoin" / "bitnodes"
DEFAULT_GEOIP = BITNODES_ROOT / "data" / "geoip"
DEFAULT_GEO_ROOT = BITNODES_ROOT / "data" / "geo"

SCHEMA = "zzx-bitnodes-ip-geo-contract-v1"
UNKNOWN = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na", "zz"}
SYNTHETIC_MARKERS = (
    "synthetic",
    "deterministic-fallback",
    "workflow-map-ready-fallback",
)


def clean(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    return "" if text.lower() in UNKNOWN else text


def finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def valid_latlon(lat: Any, lon: Any) -> tuple[float | None, float | None]:
    lat_f = finite(lat)
    lon_f = finite(lon)
    if lat_f is None or lon_f is None:
        return None, None
    if not (-90 <= lat_f <= 90 and -180 <= lon_f <= 180):
        return None, None
    return lat_f, lon_f


def deep_get(row: Mapping[str, Any], dotted: str) -> Any:
    cur: Any = row
    for part in dotted.split("."):
        if not isinstance(cur, Mapping):
            return None
        cur = cur.get(part)
    return cur


def first(row: Mapping[str, Any], keys: Iterable[str]) -> Any:
    for key in keys:
        value = deep_get(row, key) if "." in key else row.get(key)
        if value not in (None, ""):
            return value
    return None


def country_flag(code: Any) -> str:
    iso = clean(code).upper()
    if not re.fullmatch(r"[A-Z]{2}", iso):
        return ""
    return "".join(chr(127397 + ord(ch)) for ch in iso)


def parse_host(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.startswith("[") and "]" in raw:
        return raw[1:raw.index("]")]
    lower = raw.lower()
    if lower.endswith(".onion") or lower.endswith(".i2p"):
        return raw
    if ".onion:" in lower or ".i2p:" in lower:
        return raw.rsplit(":", 1)[0]
    if raw.count(":") == 1 and "." in raw:
        host, port = raw.rsplit(":", 1)
        if port.isdigit():
            return host
    if raw.count(":") > 1:
        stripped = raw.strip("[]")
        try:
            ipaddress.ip_address(stripped)
            return stripped
        except ValueError:
            host, maybe_port = raw.rsplit(":", 1)
            if maybe_port.isdigit():
                return host.strip("[]")
    return raw.strip("[]")


def extract_host(address: str, row: Mapping[str, Any]) -> str:
    for value in (
        row.get("ip"),
        row.get("host"),
        row.get("hostname"),
        row.get("address"),
        row.get("node"),
        row.get("addr"),
        address,
    ):
        host = parse_host(value)
        if host:
            return host
    return ""


def public_ip(host: str) -> str | None:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return None
    if not ip.is_global:
        return None
    return str(ip)


def network_type(host: str) -> str:
    lower = host.lower()
    if lower.endswith(".onion"):
        return "tor"
    if lower.endswith(".i2p"):
        return "i2p"
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return "dns" if host else "unknown"
    if ip.version == 4:
        return "ipv4"
    if ip.version == 6 and ip in ipaddress.ip_network("fc00::/8"):
        return "cjdns"
    return "ipv6"


def normalize_city_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", clean(value).casefold()).strip()


@dataclass(frozen=True)
class CityCandidate:
    country: str
    admin1: str
    admin2: str
    name: str
    ascii_name: str
    lat: float | None
    lon: float | None
    population: int


class GeoNamesCrosswalk:
    def __init__(self, geo_root: Path) -> None:
        self.geo_root = geo_root
        source = geo_root / "sources"
        self.admin1_path = source / "admin1CodesASCII.txt"
        self.admin2_path = source / "admin2Codes.txt"
        self.cities_path = source / "cities500.txt"
        self.admin1_names: dict[tuple[str, str], str] = {}
        self.admin2_names: dict[tuple[str, str, str], str] = {}
        self.cities: dict[tuple[str, str, str], list[CityCandidate]] = {}
        self.cities_country: dict[tuple[str, str], list[CityCandidate]] = {}
        self.loaded = False

    def load(self) -> None:
        if self.loaded:
            return
        self.loaded = True

        if self.admin1_path.exists():
            with self.admin1_path.open("r", encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    parts = line.rstrip("\n").split("\t")
                    if len(parts) < 2 or "." not in parts[0]:
                        continue
                    country, admin1 = parts[0].split(".", 1)
                    self.admin1_names[(country.upper(), admin1.upper())] = clean(parts[1])

        if self.admin2_path.exists():
            with self.admin2_path.open("r", encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    parts = line.rstrip("\n").split("\t")
                    if len(parts) < 2:
                        continue
                    code_parts = parts[0].split(".")
                    if len(code_parts) < 3:
                        continue
                    country = code_parts[0].upper()
                    admin1 = code_parts[1].upper()
                    admin2 = ".".join(code_parts[2:]).upper()
                    self.admin2_names[(country, admin1, admin2)] = clean(parts[1])

        if self.cities_path.exists():
            with self.cities_path.open("r", encoding="utf-8", errors="replace") as handle:
                reader = csv.reader(handle, delimiter="\t")
                for row in reader:
                    if len(row) < 19:
                        continue
                    country = clean(row[8]).upper()
                    admin1 = clean(row[10]).upper()
                    admin2 = clean(row[11]).upper()
                    if not country:
                        continue
                    lat = finite(row[4])
                    lon = finite(row[5])
                    try:
                        population = int(float(row[14] or 0))
                    except Exception:
                        population = 0
                    candidate = CityCandidate(
                        country=country,
                        admin1=admin1,
                        admin2=admin2,
                        name=clean(row[1]),
                        ascii_name=clean(row[2]),
                        lat=lat,
                        lon=lon,
                        population=population,
                    )
                    names = {normalize_city_key(row[1]), normalize_city_key(row[2])}
                    for name in names - {""}:
                        self.cities.setdefault((country, admin1, name), []).append(candidate)
                        self.cities_country.setdefault((country, name), []).append(candidate)

    @staticmethod
    def distance2(candidate: CityCandidate, lat: float | None, lon: float | None) -> float:
        if lat is None or lon is None or candidate.lat is None or candidate.lon is None:
            return float("inf")
        return (candidate.lat - lat) ** 2 + (candidate.lon - lon) ** 2

    def resolve_city(self, country: str, admin1: str, city: str, lat: float | None, lon: float | None) -> CityCandidate | None:
        self.load()
        key = normalize_city_key(city)
        if not country or not key:
            return None
        candidates = self.cities.get((country, admin1, key), []) if admin1 else []
        if not candidates:
            candidates = self.cities_country.get((country, key), [])
        if not candidates:
            return None
        return min(candidates, key=lambda row: (self.distance2(row, lat, lon), -row.population, row.name))

    def region_name(self, country: str, admin1: str) -> str:
        self.load()
        return self.admin1_names.get((country, admin1), "")

    def county_name(self, country: str, admin1: str, admin2: str) -> str:
        self.load()
        return self.admin2_names.get((country, admin1, admin2), "")


class Lookup:
    def __init__(self, city_db: Path, country_db: Path, asn_db: Path, geo_root: Path) -> None:
        if geoip2 is None:
            raise RuntimeError("geoip2 package is unavailable")
        self.city_reader = geoip2.database.Reader(str(city_db)) if city_db.exists() else None
        self.country_reader = geoip2.database.Reader(str(country_db)) if country_db.exists() else None
        self.asn_reader = geoip2.database.Reader(str(asn_db)) if asn_db.exists() else None
        self.geonames = GeoNamesCrosswalk(geo_root)

    def close(self) -> None:
        for reader in (self.city_reader, self.country_reader, self.asn_reader):
            try:
                if reader:
                    reader.close()
            except Exception:
                pass

    def __enter__(self) -> "Lookup":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def lookup(self, ip: str) -> dict[str, Any]:
        country_code = ""
        country_name = ""
        city = ""
        region = ""
        admin1 = ""
        county = ""
        admin2 = ""
        postal = ""
        timezone = ""
        lat: float | None = None
        lon: float | None = None
        accuracy_radius: int | None = None
        asn = ""
        organization = ""
        sources: list[str] = []
        county_source = ""

        city_response = None
        if self.city_reader:
            try:
                city_response = self.city_reader.city(ip)
            except Exception:
                city_response = None

        if city_response is not None:
            country_code = clean(getattr(city_response.country, "iso_code", "")).upper()
            country_name = clean(getattr(city_response.country, "name", ""))
            city = clean(getattr(city_response.city, "name", ""))
            lat, lon = valid_latlon(
                getattr(city_response.location, "latitude", None),
                getattr(city_response.location, "longitude", None),
            )
            timezone = clean(getattr(city_response.location, "time_zone", ""))
            accuracy_radius_raw = getattr(city_response.location, "accuracy_radius", None)
            try:
                accuracy_radius = int(accuracy_radius_raw) if accuracy_radius_raw is not None else None
            except Exception:
                accuracy_radius = None
            postal = clean(getattr(city_response.postal, "code", ""))

            subdivisions = []
            try:
                subdivisions = list(city_response.subdivisions)
            except Exception:
                subdivisions = []

            if subdivisions:
                first_sub = subdivisions[0]
                admin1 = clean(getattr(first_sub, "iso_code", "")).upper()
                region = clean(getattr(first_sub, "name", ""))

            if len(subdivisions) > 1:
                last_sub = subdivisions[-1]
                candidate_code = clean(getattr(last_sub, "iso_code", "")).upper()
                candidate_name = clean(getattr(last_sub, "name", ""))
                if candidate_code and candidate_code != admin1:
                    admin2 = candidate_code
                    county = candidate_name
                    county_source = "dbip-subdivision-admin2"

            sources.append("dbip-city")

        if self.country_reader and not country_code:
            try:
                response = self.country_reader.country(ip)
                country_code = clean(getattr(response.country, "iso_code", "")).upper()
                country_name = clean(getattr(response.country, "name", ""))
                sources.append("dbip-country")
            except Exception:
                pass

        if self.asn_reader:
            try:
                response = self.asn_reader.asn(ip)
                number = getattr(response, "autonomous_system_number", None)
                asn = f"AS{int(number)}" if number is not None else ""
                organization = clean(getattr(response, "autonomous_system_organization", ""))
                sources.append("dbip-asn")
            except Exception:
                pass

        if country_code and admin1 and not region:
            region = self.geonames.region_name(country_code, admin1)

        if country_code and city:
            city_match = self.geonames.resolve_city(country_code, admin1, city, lat, lon)
            if city_match:
                if not admin1 and city_match.admin1:
                    admin1 = city_match.admin1
                if not region and admin1:
                    region = self.geonames.region_name(country_code, admin1)
                if not admin2 and city_match.admin2 and city_match.admin2 != "UNKNOWN":
                    admin2 = city_match.admin2
                    county = self.geonames.county_name(country_code, admin1, admin2)
                    if county:
                        county_source = "geonames-city-admin2-crosswalk"
                sources.append("geonames-city-crosswalk")

        if country_code and admin1 and admin2 and not county:
            county = self.geonames.county_name(country_code, admin1, admin2)
            if county:
                county_source = "geonames-admin2"

        return {
            "ip": ip,
            "country_code": country_code or None,
            "country_name": country_name or None,
            "country_flag": country_flag(country_code),
            "region": region or None,
            "admin1_code": admin1 or None,
            "county": county or None,
            "admin2_code": admin2 or None,
            "city": city or None,
            "postal_code": postal or None,
            "timezone": timezone or None,
            "latitude": lat,
            "longitude": lon,
            "accuracy_radius_km": accuracy_radius,
            "asn": asn or None,
            "organization": organization or None,
            "geo_source": "+".join(dict.fromkeys(sources)) or "none",
            "county_source": county_source or None,
        }


def synthetic_existing(row: Mapping[str, Any]) -> bool:
    values = [
        row.get("geoip_confidence"),
        row.get("geoip_source"),
        deep_get(row, "geoip.confidence"),
        deep_get(row, "geoip.source"),
        deep_get(row, "metadata.geoip_confidence"),
        deep_get(row, "metadata.geoip_source"),
    ]
    text = " ".join(str(value or "").lower() for value in values)
    return any(marker in text for marker in SYNTHETIC_MARKERS)


def existing_geo(row: Mapping[str, Any]) -> dict[str, Any]:
    if synthetic_existing(row):
        return {}
    lat, lon = valid_latlon(
        first(row, ("latitude", "lat", "geo.latitude", "geoip.latitude", "geoloc.latitude", "location.latitude")),
        first(row, ("longitude", "lon", "lng", "geo.longitude", "geoip.longitude", "geoloc.longitude", "location.longitude")),
    )
    country = clean(first(row, ("country_code", "country", "geo.country_code", "geoip.country_code", "location.country_code"))).upper()
    if not re.fullmatch(r"[A-Z]{2}", country):
        country = ""
    return {
        "country_code": country or None,
        "country_name": clean(first(row, ("country_name", "geo.country_name", "geoip.country_name", "location.country_name"))) or None,
        "country_flag": country_flag(country),
        "region": clean(first(row, ("region", "region_name", "state", "geo.region", "geoip.region", "location.region"))) or None,
        "admin1_code": clean(first(row, ("admin1_code", "state_code", "region_code", "geo.admin1_code", "geoip.admin1_code"))).upper() or None,
        "county": clean(first(row, ("county", "county_name", "district", "admin2", "geo.county", "geoip.county", "location.county"))) or None,
        "admin2_code": clean(first(row, ("admin2_code", "county_code", "district_code", "geo.admin2_code", "geoip.admin2_code"))).upper() or None,
        "city": clean(first(row, ("city", "city_name", "geo.city", "geoip.city", "location.city"))) or None,
        "postal_code": clean(first(row, ("postal_code", "zip", "zip_code", "geoip.postal_code"))) or None,
        "timezone": clean(first(row, ("timezone", "geoip.timezone"))) or None,
        "latitude": lat,
        "longitude": lon,
        "asn": clean(first(row, ("asn", "geoip.asn"))) or None,
        "organization": clean(first(row, ("organization", "org", "geoip.organization"))) or None,
        "geo_source": "existing-real-fields",
        "county_source": clean(first(row, ("county_source", "county_data.county_source"))) or None,
    }


def node_address(row: Mapping[str, Any], fallback: str = "") -> str:
    return clean(row.get("address") or row.get("node") or row.get("addr") or row.get("endpoint") or row.get("host") or fallback)


def list_to_row(address: str, value: list[Any]) -> dict[str, Any]:
    padded = list(value) + [None] * max(0, 20 - len(value))
    return {
        "address": address,
        "protocol_version": padded[0],
        "user_agent": padded[1],
        "connected_since": padded[2],
        "services": padded[3],
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
        "county": padded[14],
        "postal_code": padded[15],
        "metadata": padded[19] if isinstance(padded[19], dict) else {},
    }


def node_pairs(payload: Mapping[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    raw = payload.get("nodes")
    out: list[tuple[str, dict[str, Any]]] = []
    if isinstance(raw, dict):
        for address, value in raw.items():
            if isinstance(value, Mapping):
                row = dict(value)
                row.setdefault("address", address)
                out.append((str(address), row))
            elif isinstance(value, list):
                out.append((str(address), list_to_row(str(address), value)))
    elif isinstance(raw, list):
        for value in raw:
            if not isinstance(value, Mapping):
                continue
            row = dict(value)
            address = node_address(row)
            if address:
                out.append((address, row))
    return out


def prefer(primary: dict[str, Any], secondary: dict[str, Any]) -> dict[str, Any]:
    out = dict(secondary)
    for key, value in primary.items():
        if value not in (None, ""):
            out[key] = value
    return out


def apply_geo(row: dict[str, Any], geo: dict[str, Any], host: str, ip: str | None) -> dict[str, Any]:
    out = dict(row)
    network = network_type(host)
    country = clean(geo.get("country_code")).upper()
    lat, lon = valid_latlon(geo.get("latitude"), geo.get("longitude"))

    out["ip"] = ip
    out["network"] = clean(out.get("network")) or network
    out["country"] = country or None
    out["country_code"] = country or None
    out["country_name"] = geo.get("country_name") or None
    out["country_flag"] = geo.get("country_flag") or country_flag(country)
    out["region"] = geo.get("region") or None
    out["admin1_code"] = geo.get("admin1_code") or None
    out["county"] = geo.get("county") or None
    out["county_name"] = geo.get("county") or None
    out["admin2"] = geo.get("county") or None
    out["admin2_code"] = geo.get("admin2_code") or None
    out["city"] = geo.get("city") or None
    out["postal_code"] = geo.get("postal_code") or None
    out["timezone"] = geo.get("timezone") or out.get("timezone") or None
    out["latitude"] = lat
    out["longitude"] = lon
    out["lat"] = lat
    out["lon"] = lon
    out["lng"] = lon
    if geo.get("asn"):
        out["asn"] = geo.get("asn")
    if geo.get("organization"):
        out["organization"] = geo.get("organization")

    country_available = bool(re.fullmatch(r"[A-Z]{2}", country))
    city_available = country_available and bool(clean(out.get("city")))
    county_available = city_available and bool(clean(out.get("county"))) and bool(clean(out.get("admin2_code")))
    coord_available = lat is not None and lon is not None

    contract = {
        "schema": SCHEMA,
        "ip": ip,
        "network": network,
        "public_ip": bool(ip),
        "country_available": country_available,
        "city_available": city_available,
        "county_available": county_available,
        "coordinates_available": coord_available,
        "country_code": country or None,
        "country_name": out.get("country_name"),
        "country_flag": out.get("country_flag"),
        "region": out.get("region"),
        "admin1_code": out.get("admin1_code"),
        "county": out.get("county"),
        "admin2_code": out.get("admin2_code"),
        "city": out.get("city"),
        "latitude": lat,
        "longitude": lon,
        "accuracy_radius_km": geo.get("accuracy_radius_km"),
        "source": geo.get("geo_source") or "none",
        "county_source": geo.get("county_source"),
        "synthetic": False,
    }
    out["geo_contract"] = contract
    out["geo_source"] = contract["source"]
    out["geo_confidence"] = "real-ip-approximate" if country_available else "unavailable"
    out["geo_available"] = country_available

    # Replace legacy synthetic containers with the canonical real-only view.
    canonical_geo = {
        "country_code": contract["country_code"],
        "country": contract["country_code"],
        "country_name": contract["country_name"],
        "country_flag": contract["country_flag"],
        "region": contract["region"],
        "admin1_code": contract["admin1_code"],
        "county": contract["county"],
        "admin2_code": contract["admin2_code"],
        "city": contract["city"],
        "latitude": lat,
        "longitude": lon,
        "lat": lat,
        "lon": lon,
        "source": contract["source"],
        "confidence": out["geo_confidence"],
        "synthetic": False,
    }
    out["geo"] = dict(canonical_geo)
    out["geoloc"] = dict(canonical_geo)
    out["location"] = dict(canonical_geo)
    out["geoip"] = dict(canonical_geo)
    out["geoip_data"] = dict(canonical_geo)
    out["geoip_source"] = contract["source"]
    out["geoip_confidence"] = out["geo_confidence"]
    return out


def build(payload: Mapping[str, Any], lookup: Lookup) -> tuple[dict[str, Any], dict[str, Any]]:
    pairs = node_pairs(payload)
    rows: list[dict[str, Any]] = []
    counters = {
        "nodes": 0,
        "public_ip": 0,
        "country": 0,
        "city": 0,
        "county": 0,
        "coordinates": 0,
        "overlay_or_non_ip": 0,
        "non_public_ip": 0,
    }

    for address, row in pairs:
        counters["nodes"] += 1
        host = extract_host(address, row)
        ip = public_ip(host)
        existing = existing_geo(row)

        if ip:
            counters["public_ip"] += 1
            fresh = lookup.lookup(ip)
            # Existing real fields are only a fallback for the same public-IP
            # node. Fresh DB-IP/GeoNames values win whenever present.
            geo = prefer(fresh, existing)
        else:
            # Tor/I2P/DNS/private/reserved endpoints do not expose a public IP
            # that can be geolocated. Never retain or invent geographic fields
            # for these rows, even if a legacy dataset carried synthetic values.
            geo = {}
            try:
                parsed = ipaddress.ip_address(host)
                if not parsed.is_global:
                    counters["non_public_ip"] += 1
            except ValueError:
                counters["overlay_or_non_ip"] += 1

        normalized = apply_geo(row, geo, host, ip)
        contract = normalized["geo_contract"]
        counters["country"] += int(bool(contract["country_available"]))
        counters["city"] += int(bool(contract["city_available"]))
        counters["county"] += int(bool(contract["county_available"]))
        counters["coordinates"] += int(bool(contract["coordinates_available"]))
        rows.append(normalized)

    out = dict(payload)
    out["schema"] = SCHEMA
    out["geo_contract_version"] = 1
    out["nodes"] = rows
    out["geo_summary"] = dict(counters)
    out["metadata"] = dict(out.get("metadata") or {})
    out["metadata"].update({
        "geo_contract": SCHEMA,
        "geo_contract_generated_at": int(time.time()),
        "geo_policy": "real public IP geolocation only; no synthetic coordinates",
    })
    report = {
        "schema": "zzx-bitnodes-ip-geo-contract-report-v1",
        "generated_at": int(time.time()),
        **counters,
        "country_coverage": counters["country"] / counters["nodes"] if counters["nodes"] else 0,
        "city_coverage": counters["city"] / counters["nodes"] if counters["nodes"] else 0,
        "county_coverage": counters["county"] / counters["nodes"] if counters["nodes"] else 0,
        "coordinate_coverage": counters["coordinates"] / counters["nodes"] if counters["nodes"] else 0,
    }
    return out, report


def write_json(path: Path, payload: Any, compact: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    kwargs = {"ensure_ascii": False, "separators": (",", ":")} if compact else {"ensure_ascii": False, "indent": 2}
    path.write_text(json.dumps(payload, **kwargs) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize Bitnodes IP geography into a real-only country/city/county contract.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", default="")
    parser.add_argument("--city-db", default=str(DEFAULT_GEOIP / "dbip-city-lite.mmdb"))
    parser.add_argument("--country-db", default=str(DEFAULT_GEOIP / "dbip-country-lite.mmdb"))
    parser.add_argument("--asn-db", default=str(DEFAULT_GEOIP / "dbip-asn-lite.mmdb"))
    parser.add_argument("--geo-root", default=str(DEFAULT_GEO_ROOT))
    parser.add_argument("--minimum-country", type=int, default=1)
    parser.add_argument("--minimum-city", type=int, default=0)
    parser.add_argument("--minimum-county", type=int, default=0)
    parser.add_argument("--minimum-coordinates", type=int, default=1)
    parser.add_argument("--compact", action="store_true")
    args = parser.parse_args()

    source = Path(args.input)
    payload = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(payload, Mapping):
        raise SystemExit("input must be a JSON object")

    with Lookup(Path(args.city_db), Path(args.country_db), Path(args.asn_db), Path(args.geo_root)) as lookup:
        output, report = build(payload, lookup)

    for label, minimum in (
        ("country", args.minimum_country),
        ("city", args.minimum_city),
        ("county", args.minimum_county),
        ("coordinates", args.minimum_coordinates),
    ):
        if int(report.get(label) or 0) < max(0, int(minimum)):
            raise SystemExit(f"geo contract has too few {label} rows: {report.get(label)} < {minimum}")

    write_json(Path(args.output), output, args.compact)
    if args.report:
        write_json(Path(args.report), report, args.compact)
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
