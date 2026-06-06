#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import re
import time
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_GEO_ROOT = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo"
DEFAULT_SOURCE_DIR = DEFAULT_GEO_ROOT / "sources"
DEFAULT_OUTPUT_DIR = DEFAULT_GEO_ROOT / "mariadb-gz"

GEONAMES_ADMIN1_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt"
GEONAMES_ADMIN2_URL = "https://download.geonames.org/export/dump/admin2Codes.txt"
GEONAMES_CITIES_URL = "https://download.geonames.org/export/dump/cities500.zip"
GEONAMES_COUNTRY_INFO_URL = "https://download.geonames.org/export/dump/countryInfo.txt"

SCHEMA = "zzx-bitnodes-geo-index-mariadb-gz-v4"

COUNTRY_TABLE = "bitnodes_geo_countries"
TERRITORY_TABLE = "bitnodes_geo_territories"
COUNTY_TABLE = "bitnodes_geo_counties"
CITY_TABLE = "bitnodes_geo_cities"
ALIAS_TABLE = "bitnodes_geo_aliases"
CONTROL_TABLE = "bitnodes_geo_index_control"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def utc_mysql() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0).isoformat(sep=" ")


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}:
        return ""

    return re.sub(r"\s+", " ", text)


def safe_int(value: Any, fallback: int = 0) -> int:
    try:
        if value in ("", None):
            return fallback
        return int(float(value))
    except Exception:
        return fallback


def safe_float(value: Any, fallback: float | None = None) -> float | None:
    try:
        if value in ("", None):
            return fallback
        out = float(value)
        if out != out:
            return fallback
        return out
    except Exception:
        return fallback


def sql_quote(value: Any) -> str:
    if value is None:
        return "NULL"

    if isinstance(value, bool):
        return "1" if value else "0"

    if isinstance(value, (int, float)):
        return str(value)

    text = str(value)
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "''")
    return f"'{text}'"


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True, default=str)


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)

    return digest.hexdigest()


def write_gzip_text(path: Path, text: str) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)

    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as handle:
        handle.write(text)

    return path.stat().st_size


def download(url: str, output: Path, *, force: bool = False) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)

    if output.exists() and not force:
        return output

    print(f"download: {url}")
    print(f"output:   {output}")

    urllib.request.urlretrieve(url, output)
    return output


def ensure_sources(source_dir: Path, *, download_sources: bool, force: bool) -> dict[str, Path]:
    source_dir.mkdir(parents=True, exist_ok=True)

    paths = {
        "admin1": source_dir / "admin1CodesASCII.txt",
        "admin2": source_dir / "admin2Codes.txt",
        "cities_zip": source_dir / "cities500.zip",
        "cities": source_dir / "cities500.txt",
        "country_info": source_dir / "countryInfo.txt",
    }

    if download_sources:
        download(GEONAMES_ADMIN1_URL, paths["admin1"], force=force)
        download(GEONAMES_ADMIN2_URL, paths["admin2"], force=force)
        download(GEONAMES_COUNTRY_INFO_URL, paths["country_info"], force=force)
        download(GEONAMES_CITIES_URL, paths["cities_zip"], force=force)

    if paths["cities_zip"].exists() and (force or not paths["cities"].exists()):
        with zipfile.ZipFile(paths["cities_zip"], "r") as archive:
            archive.extract("cities500.txt", source_dir)

    return paths


def parse_country_info(path: Path) -> dict[str, dict[str, Any]]:
    countries: dict[str, dict[str, Any]] = {}

    if not path.exists():
        return countries

    with path.open("r", encoding="utf-8") as handle:
        reader = csv.reader(handle, delimiter="\t")

        for row in reader:
            if not row or row[0].startswith("#") or len(row) < 19:
                continue

            code = clean(row[0]).upper()

            if not code:
                continue

            countries[code] = {
                "country_code": code,
                "country_name": clean(row[4]),
                "capital": clean(row[5]),
                "area_sq_km": safe_float(row[6]),
                "population": safe_int(row[7]),
                "continent_code": clean(row[8]),
                "tld": clean(row[9]),
                "currency_code": clean(row[10]),
                "currency_name": clean(row[11]),
                "phone": clean(row[12]),
                "postal_code_format": clean(row[13]),
                "postal_code_regex": clean(row[14]),
                "languages": clean(row[15]),
                "geoname_id": clean(row[16]),
                "neighbors": clean(row[17]),
                "equivalent_fips_code": clean(row[18]),
                "source": "GeoNames countryInfo",
            }

    return countries


def parse_admin1(path: Path) -> dict[str, dict[str, dict[str, Any]]]:
    output: dict[str, dict[str, dict[str, Any]]] = {}

    if not path.exists():
        return output

    with path.open("r", encoding="utf-8") as handle:
        reader = csv.reader(handle, delimiter="\t")

        for row in reader:
            if len(row) < 4:
                continue

            full_code = clean(row[0])

            if "." not in full_code:
                continue

            country, admin1 = full_code.split(".", 1)
            country = country.upper()
            admin1 = admin1.upper()

            output.setdefault(country, {})
            output[country][admin1] = {
                "country_code": country,
                "territory_code": admin1,
                "admin1_code": admin1,
                "code": admin1,
                "name": clean(row[1]),
                "ascii_name": clean(row[2]),
                "geoname_id": clean(row[3]),
                "aliases": sorted({clean(row[1]), clean(row[2])} - {""}),
                "source": "GeoNames admin1CodesASCII",
            }

    return output


def parse_admin2(path: Path) -> dict[str, dict[str, dict[str, dict[str, Any]]]]:
    output: dict[str, dict[str, dict[str, dict[str, Any]]]] = {}

    if not path.exists():
        return output

    with path.open("r", encoding="utf-8") as handle:
        reader = csv.reader(handle, delimiter="\t")

        for row in reader:
            if len(row) < 4:
                continue

            parts = clean(row[0]).split(".")

            if len(parts) < 3:
                continue

            country = parts[0].upper()
            admin1 = parts[1].upper()
            admin2 = ".".join(parts[2:]).upper()

            output.setdefault(country, {})
            output[country].setdefault(admin1, {})
            output[country][admin1][admin2] = {
                "country_code": country,
                "territory_code": admin1,
                "admin1_code": admin1,
                "county_code": admin2,
                "admin2_code": admin2,
                "code": admin2,
                "name": clean(row[1]),
                "ascii_name": clean(row[2]),
                "geoname_id": clean(row[3]),
                "aliases": sorted({clean(row[1]), clean(row[2])} - {""}),
                "source": "GeoNames admin2Codes",
            }

    return output


def parse_cities(path: Path) -> dict[str, dict[str, list[dict[str, Any]]]]:
    output: dict[str, dict[str, list[dict[str, Any]]]] = {}

    if not path.exists():
        return output

    with path.open("r", encoding="utf-8") as handle:
        reader = csv.reader(handle, delimiter="\t")

        for row in reader:
            if len(row) < 19:
                continue

            country = clean(row[8]).upper()
            admin1 = clean(row[10]).upper() or "UNKNOWN"
            admin2 = clean(row[11]).upper() or "UNKNOWN"

            if not country:
                continue

            alternate_names = [clean(item) for item in clean(row[3]).split(",") if clean(item)]

            city = {
                "geoname_id": clean(row[0]),
                "name": clean(row[1]),
                "city": clean(row[1]),
                "city_name": clean(row[1]),
                "ascii_name": clean(row[2]),
                "alternate_names": alternate_names[:50],
                "latitude": safe_float(row[4]),
                "longitude": safe_float(row[5]),
                "feature_class": clean(row[6]),
                "feature_code": clean(row[7]),
                "country_code": country,
                "cc2": clean(row[9]),
                "territory_code": admin1,
                "admin1_code": admin1,
                "county_code": admin2,
                "admin2_code": admin2,
                "admin3_code": clean(row[12]),
                "admin4_code": clean(row[13]),
                "population": safe_int(row[14]),
                "elevation": safe_int(row[15]),
                "dem": safe_int(row[16]),
                "timezone": clean(row[17]),
                "modified_at": clean(row[18]),
                "source": "GeoNames cities500",
            }

            output.setdefault(country, {})
            output[country].setdefault(admin1, [])
            output[country][admin1].append(city)

    return output


def create_sql_header() -> str:
    return f"""-- {SCHEMA}
-- generated_at: {utc_now()}
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS {COUNTRY_TABLE} (
  country_code VARCHAR(8) NOT NULL PRIMARY KEY,
  country_name VARCHAR(192) NOT NULL DEFAULT '',
  capital VARCHAR(192) NOT NULL DEFAULT '',
  continent_code VARCHAR(8) NOT NULL DEFAULT '',
  tld VARCHAR(32) NOT NULL DEFAULT '',
  currency_code VARCHAR(16) NOT NULL DEFAULT '',
  currency_name VARCHAR(128) NOT NULL DEFAULT '',
  phone VARCHAR(64) NOT NULL DEFAULT '',
  postal_code_format TEXT NULL,
  postal_code_regex TEXT NULL,
  languages TEXT NULL,
  geoname_id VARCHAR(32) NOT NULL DEFAULT '',
  neighbors TEXT NULL,
  population BIGINT NULL,
  area_sq_km DOUBLE NULL,
  payload_json LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {TERRITORY_TABLE} (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  country_code VARCHAR(8) NOT NULL,
  territory_code VARCHAR(32) NOT NULL,
  admin1_code VARCHAR(32) NOT NULL,
  territory_name VARCHAR(192) NOT NULL DEFAULT '',
  ascii_name VARCHAR(192) NOT NULL DEFAULT '',
  geoname_id VARCHAR(32) NOT NULL DEFAULT '',
  aliases_json LONGTEXT NULL,
  payload_json LONGTEXT NOT NULL,
  KEY idx_geo_territory_country (country_code),
  KEY idx_geo_territory_admin1 (country_code, admin1_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {COUNTY_TABLE} (
  id VARCHAR(96) NOT NULL PRIMARY KEY,
  country_code VARCHAR(8) NOT NULL,
  territory_code VARCHAR(32) NOT NULL,
  admin1_code VARCHAR(32) NOT NULL,
  county_code VARCHAR(64) NOT NULL,
  admin2_code VARCHAR(64) NOT NULL,
  county_name VARCHAR(192) NOT NULL DEFAULT '',
  ascii_name VARCHAR(192) NOT NULL DEFAULT '',
  geoname_id VARCHAR(32) NOT NULL DEFAULT '',
  aliases_json LONGTEXT NULL,
  payload_json LONGTEXT NOT NULL,
  KEY idx_geo_county_country (country_code),
  KEY idx_geo_county_admin1 (country_code, admin1_code),
  KEY idx_geo_county_admin2 (country_code, admin1_code, admin2_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {CITY_TABLE} (
  id VARCHAR(512) NOT NULL PRIMARY KEY,
  geoname_id VARCHAR(32) NOT NULL DEFAULT '',
  country_code VARCHAR(8) NOT NULL,
  admin1_code VARCHAR(32) NOT NULL,
  admin2_code VARCHAR(64) NOT NULL,
  city_name VARCHAR(255) NOT NULL DEFAULT '',
  ascii_name VARCHAR(255) NOT NULL DEFAULT '',
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  population BIGINT NULL,
  timezone_name VARCHAR(128) NOT NULL DEFAULT '',
  alternate_names_json LONGTEXT NULL,
  payload_json LONGTEXT NOT NULL,
  KEY idx_geo_city_country (country_code),
  KEY idx_geo_city_admin1 (country_code, admin1_code),
  KEY idx_geo_city_admin2 (country_code, admin1_code, admin2_code),
  KEY idx_geo_city_geo (latitude, longitude),
  KEY idx_geo_city_name (city_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {ALIAS_TABLE} (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  alias_family VARCHAR(64) NOT NULL,
  alias_text VARCHAR(255) NOT NULL,
  target_id VARCHAR(512) NOT NULL,
  country_code VARCHAR(8) NOT NULL DEFAULT '',
  payload_json LONGTEXT NULL,
  UNIQUE KEY uniq_geo_alias (alias_family, alias_text, target_id),
  KEY idx_geo_alias_lookup (alias_family, alias_text),
  KEY idx_geo_alias_country (country_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {CONTROL_TABLE} (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  generated_at DATETIME NOT NULL,
  schema_name VARCHAR(128) NOT NULL,
  source_dir TEXT NOT NULL,
  geo_root TEXT NOT NULL,
  country_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  territory_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  county_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  city_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  alias_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  manifest_json LONGTEXT NOT NULL,
  UNIQUE KEY uniq_geo_index_schema (schema_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

"""


def country_sql(item: dict[str, Any]) -> str:
    values = [
        item.get("country_code", ""),
        item.get("country_name", ""),
        item.get("capital", ""),
        item.get("continent_code", ""),
        item.get("tld", ""),
        item.get("currency_code", ""),
        item.get("currency_name", ""),
        item.get("phone", ""),
        item.get("postal_code_format", ""),
        item.get("postal_code_regex", ""),
        item.get("languages", ""),
        item.get("geoname_id", ""),
        item.get("neighbors", ""),
        safe_int(item.get("population")),
        safe_float(item.get("area_sq_km")),
        compact_json(item),
    ]

    return (
        f"INSERT INTO {COUNTRY_TABLE} "
        "(country_code,country_name,capital,continent_code,tld,currency_code,currency_name,phone,"
        "postal_code_format,postal_code_regex,languages,geoname_id,neighbors,population,area_sq_km,payload_json) "
        f"VALUES ({','.join(sql_quote(v) for v in values)}) "
        "ON DUPLICATE KEY UPDATE country_name=VALUES(country_name), capital=VALUES(capital), "
        "continent_code=VALUES(continent_code), tld=VALUES(tld), currency_code=VALUES(currency_code), "
        "currency_name=VALUES(currency_name), phone=VALUES(phone), postal_code_format=VALUES(postal_code_format), "
        "postal_code_regex=VALUES(postal_code_regex), languages=VALUES(languages), geoname_id=VALUES(geoname_id), "
        "neighbors=VALUES(neighbors), population=VALUES(population), area_sq_km=VALUES(area_sq_km), "
        "payload_json=VALUES(payload_json);\n"
    )


def territory_sql(country: str, code: str, item: dict[str, Any]) -> str:
    name = clean(item.get("name")) or clean(item.get("ascii_name")) or code
    record = {
        **item,
        "id": f"{country}:{code}",
        "territory_name": name,
        "admin1_code": code,
    }

    values = [
        record["id"],
        country,
        code,
        code,
        name,
        item.get("ascii_name", ""),
        item.get("geoname_id", ""),
        compact_json(item.get("aliases", [])),
        compact_json(record),
    ]

    return (
        f"INSERT INTO {TERRITORY_TABLE} "
        "(id,country_code,territory_code,admin1_code,territory_name,ascii_name,geoname_id,aliases_json,payload_json) "
        f"VALUES ({','.join(sql_quote(v) for v in values)}) "
        "ON DUPLICATE KEY UPDATE territory_name=VALUES(territory_name), ascii_name=VALUES(ascii_name), "
        "geoname_id=VALUES(geoname_id), aliases_json=VALUES(aliases_json), payload_json=VALUES(payload_json);\n"
    )


def county_sql(country: str, admin1: str, code: str, item: dict[str, Any]) -> str:
    name = clean(item.get("name")) or clean(item.get("ascii_name")) or code
    record = {
        **item,
        "id": f"{country}:{admin1}:{code}",
        "county_name": name,
        "admin2_code": code,
    }

    values = [
        record["id"],
        country,
        admin1,
        admin1,
        code,
        code,
        name,
        item.get("ascii_name", ""),
        item.get("geoname_id", ""),
        compact_json(item.get("aliases", [])),
        compact_json(record),
    ]

    return (
        f"INSERT INTO {COUNTY_TABLE} "
        "(id,country_code,territory_code,admin1_code,county_code,admin2_code,county_name,ascii_name,"
        "geoname_id,aliases_json,payload_json) "
        f"VALUES ({','.join(sql_quote(v) for v in values)}) "
        "ON DUPLICATE KEY UPDATE county_name=VALUES(county_name), ascii_name=VALUES(ascii_name), "
        "geoname_id=VALUES(geoname_id), aliases_json=VALUES(aliases_json), payload_json=VALUES(payload_json);\n"
    )


def city_sql(item: dict[str, Any]) -> str:
    country = item.get("country_code", "")
    admin1 = item.get("admin1_code", "")
    admin2 = item.get("admin2_code", "")
    name = item.get("name") or item.get("city") or ""
    geoname_id = item.get("geoname_id") or ""
    city_id = f"{country}:{admin1}:{admin2}:{geoname_id or name}"

    record = {
        **item,
        "id": city_id,
        "city": name,
        "city_name": name,
    }

    values = [
        city_id,
        geoname_id,
        country,
        admin1,
        admin2,
        name,
        item.get("ascii_name", ""),
        safe_float(item.get("latitude")),
        safe_float(item.get("longitude")),
        safe_int(item.get("population")),
        item.get("timezone", ""),
        compact_json(item.get("alternate_names", [])),
        compact_json(record),
    ]

    return (
        f"INSERT INTO {CITY_TABLE} "
        "(id,geoname_id,country_code,admin1_code,admin2_code,city_name,ascii_name,latitude,longitude,"
        "population,timezone_name,alternate_names_json,payload_json) "
        f"VALUES ({','.join(sql_quote(v) for v in values)}) "
        "ON DUPLICATE KEY UPDATE city_name=VALUES(city_name), ascii_name=VALUES(ascii_name), "
        "latitude=VALUES(latitude), longitude=VALUES(longitude), population=VALUES(population), "
        "timezone_name=VALUES(timezone_name), alternate_names_json=VALUES(alternate_names_json), "
        "payload_json=VALUES(payload_json);\n"
    )


def alias_sql(family: str, alias: str, target: str, country: str = "", payload: Any = None) -> str:
    values = [
        family,
        alias.lower(),
        target,
        country,
        compact_json(payload or {}),
    ]

    return (
        f"INSERT INTO {ALIAS_TABLE} "
        "(alias_family,alias_text,target_id,country_code,payload_json) "
        f"VALUES ({','.join(sql_quote(v) for v in values)}) "
        "ON DUPLICATE KEY UPDATE country_code=VALUES(country_code), payload_json=VALUES(payload_json);\n"
    )


def control_sql(
    *,
    generated_at: str,
    source_dir: Path,
    geo_root: Path,
    manifest: dict[str, Any],
) -> str:
    values = [
        generated_at,
        SCHEMA,
        str(source_dir),
        str(geo_root),
        safe_int(manifest.get("country_count")),
        safe_int(manifest.get("territory_count")),
        safe_int(manifest.get("county_count")),
        safe_int(manifest.get("city_count")),
        safe_int(manifest.get("alias_count")),
        compact_json(manifest),
    ]

    return (
        f"INSERT INTO {CONTROL_TABLE} "
        "(generated_at,schema_name,source_dir,geo_root,country_count,territory_count,county_count,"
        "city_count,alias_count,manifest_json) "
        f"VALUES ({','.join(sql_quote(v) for v in values)}) "
        "ON DUPLICATE KEY UPDATE generated_at=VALUES(generated_at), source_dir=VALUES(source_dir), "
        "geo_root=VALUES(geo_root), country_count=VALUES(country_count), territory_count=VALUES(territory_count), "
        "county_count=VALUES(county_count), city_count=VALUES(city_count), alias_count=VALUES(alias_count), "
        "manifest_json=VALUES(manifest_json);\n"
    )


def build_sql_lines(
    *,
    countries: dict[str, dict[str, Any]],
    admin1: dict[str, dict[str, dict[str, Any]]],
    admin2: dict[str, dict[str, dict[str, dict[str, Any]]]],
    cities: dict[str, dict[str, list[dict[str, Any]]]],
    only: str,
) -> tuple[list[str], dict[str, int]]:
    lines: list[str] = []
    counts = {
        "country_count": 0,
        "territory_count": 0,
        "county_count": 0,
        "city_count": 0,
        "alias_count": 0,
    }

    if only in {"all", "countries"}:
        for _code, item in sorted(countries.items()):
            lines.append(country_sql(item))
            counts["country_count"] += 1
            name = clean(item.get("country_name"))
            code = clean(item.get("country_code"))
            if name:
                lines.append(alias_sql("country", name, code, code, item))
                counts["alias_count"] += 1
            if code:
                lines.append(alias_sql("country", code, code, code, item))
                counts["alias_count"] += 1

    if only in {"all", "territories"}:
        for country, rows in sorted(admin1.items()):
            for code, item in sorted(rows.items()):
                target = f"{country}:{code}"
                lines.append(territory_sql(country, code, item))
                counts["territory_count"] += 1

                for alias in item.get("aliases", []):
                    alias = clean(alias)
                    if alias:
                        lines.append(alias_sql("territory", alias, target, country, item))
                        counts["alias_count"] += 1

    if only in {"all", "counties"}:
        for country, admin1_rows in sorted(admin2.items()):
            for admin1_code, county_rows in sorted(admin1_rows.items()):
                for county_code, item in sorted(county_rows.items()):
                    target = f"{country}:{admin1_code}:{county_code}"
                    lines.append(county_sql(country, admin1_code, county_code, item))
                    counts["county_count"] += 1

                    for alias in item.get("aliases", []):
                        alias = clean(alias)
                        if alias:
                            lines.append(alias_sql("county", alias, target, country, item))
                            counts["alias_count"] += 1

    if only in {"all", "cities"}:
        for country, admin1_rows in sorted(cities.items()):
            for _admin1_code, city_rows in sorted(admin1_rows.items()):
                city_rows = sorted(
                    city_rows,
                    key=lambda item: (
                        -safe_int(item.get("population")),
                        item.get("name") or "",
                    ),
                )

                for item in city_rows:
                    target = f"{item.get('country_code')}:{item.get('admin1_code')}:{item.get('admin2_code')}:{item.get('geoname_id') or item.get('name')}"
                    lines.append(city_sql(item))
                    counts["city_count"] += 1

                    names = [
                        clean(item.get("name")),
                        clean(item.get("ascii_name")),
                        *[clean(name) for name in item.get("alternate_names", [])],
                    ]

                    for alias in sorted(set(names) - {""}):
                        lines.append(alias_sql("city", alias, target, country, item))
                        counts["alias_count"] += 1

    if only == "aliases":
        _, counts = build_sql_lines(
            countries=countries,
            admin1=admin1,
            admin2=admin2,
            cities=cities,
            only="all",
        )

    return lines, counts


def split_lines(header: str, lines: list[str], max_bytes: int) -> list[list[str]]:
    shards: list[list[str]] = []
    current: list[str] = []

    for line in lines:
        current_size = len(header.encode("utf-8")) + sum(len(item.encode("utf-8")) for item in current)

        if current and current_size + len(line.encode("utf-8")) > max_bytes:
            shards.append(current)
            current = []

        current.append(line)

    if current:
        shards.append(current)

    return shards


def clean_output_dir(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    for item in output_dir.glob("*.sql.gz"):
        try:
            item.unlink()
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build local GeoNames-derived MariaDB .sql.gz indexes for Bitnodes geolocation enrichment.",
        allow_abbrev=False,
    )

    parser.add_argument("--geo-root", default=str(DEFAULT_GEO_ROOT))
    parser.add_argument("--source-dir", default="")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", default="all", choices=["all", "countries", "territories", "counties", "cities", "aliases"])
    parser.add_argument("--max-mb", type=float, default=24.0)
    parser.add_argument("--no-clean", action="store_true")
    parser.add_argument("--report", default="")

    args = parser.parse_args()

    geo_root = Path(args.geo_root).resolve()
    source_dir = Path(args.source_dir).resolve() if args.source_dir else geo_root / "sources"
    output_dir = Path(args.output_dir).resolve() if args.output_dir else geo_root / "mariadb-gz"
    max_bytes = int(args.max_mb * 1024 * 1024)

    if not args.no_clean:
        clean_output_dir(output_dir)

    source_paths = ensure_sources(
        source_dir,
        download_sources=args.download,
        force=args.force,
    )

    countries = parse_country_info(source_paths["country_info"])
    admin1 = parse_admin1(source_paths["admin1"])
    admin2 = parse_admin2(source_paths["admin2"])
    cities = parse_cities(source_paths["cities"])

    generated_at = utc_mysql()
    header = create_sql_header()

    lines, counts = build_sql_lines(
        countries=countries,
        admin1=admin1,
        admin2=admin2,
        cities=cities,
        only=args.only,
    )

    manifest = {
        "schema": SCHEMA,
        "generated_at": utc_now(),
        "geo_root": str(geo_root),
        "source_dir": str(source_dir),
        "output_dir": str(output_dir),
        "only": args.only,
        "storage": "mariadb-sql-gzip-shards",
        **counts,
        "line_count": len(lines),
        "shards": [],
    }

    control = control_sql(
        generated_at=generated_at,
        source_dir=source_dir,
        geo_root=geo_root,
        manifest=manifest,
    )

    shards = split_lines(header, lines + [control], max_bytes=max_bytes)

    for index, shard_lines in enumerate(shards):
        name = f"geo-index-{args.only}-{index:04d}.sql.gz"
        path = output_dir / name
        body = "".join(shard_lines)
        sql = (
            header
            + f"-- shard_index: {index}\n"
            + f"-- shard_name: {name}\n"
            + f"-- shard_sha256: {sha256_text(body)}\n"
            + body
        )

        size = write_gzip_text(path, sql)

        manifest["shards"].append(
            {
                "index": index,
                "file": name,
                "path": str(path),
                "size_bytes": size,
                "sha256": sha256_file(path),
            }
        )

    latest_sql = header + control
    latest_sql += f"-- latest_sha256:{sha256_text(latest_sql)}\n"

    latest_path = output_dir / "latest-geo-index.sql.gz"
    write_gzip_text(latest_path, latest_sql)

    if args.report:
        report_sql = header + control
        write_gzip_text(Path(args.report).resolve(), report_sql)

    print(f"geo mariadb gz indexes built: {output_dir}")
    print(f"shards: {len(manifest['shards'])}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
