#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GEO_ROOT = APP_ROOT / "tools" / "bitnodes" / "data" / "geo"

DEFAULT_SOURCE_DIR = DEFAULT_GEO_ROOT / "sources"
DEFAULT_TERRITORY_DIR = DEFAULT_GEO_ROOT / "territories"
DEFAULT_COUNTY_DIR = DEFAULT_GEO_ROOT / "counties"
DEFAULT_CITY_DIR = DEFAULT_GEO_ROOT / "cities"
DEFAULT_ALIAS_DIR = DEFAULT_GEO_ROOT / "aliases"
DEFAULT_MANIFEST_DIR = DEFAULT_GEO_ROOT / "manifests"

GEONAMES_ADMIN1_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt"
GEONAMES_ADMIN2_URL = "https://download.geonames.org/export/dump/admin2Codes.txt"
GEONAMES_CITIES_URL = "https://download.geonames.org/export/dump/cities500.zip"
GEONAMES_COUNTRY_INFO_URL = "https://download.geonames.org/export/dump/countryInfo.txt"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in {
        "",
        "unknown",
        "none",
        "null",
        "undefined",
        "—",
        "-",
        "n/a",
        "na",
    }:
        return ""

    return re.sub(r"\s+", " ", text)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as handle:
        json.dump(
            payload,
            handle,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        handle.write("\n")


def read_json(path: Path, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = {}

    if not path.exists():
        return fallback

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


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
            if not row or row[0].startswith("#"):
                continue

            if len(row) < 19:
                continue

            code = clean(row[0]).upper()

            if not code:
                continue

            countries[code] = {
                "country_code": code,
                "country_name": clean(row[4]),
                "capital": clean(row[5]),
                "area_sq_km": clean(row[6]),
                "population": clean(row[7]),
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
                "code": admin1,
                "name": clean(row[1]),
                "ascii_name": clean(row[2]),
                "geoname_id": clean(row[3]),
                "aliases": sorted({
                    clean(row[1]),
                    clean(row[2]),
                } - {""}),
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

            full_code = clean(row[0])
            parts = full_code.split(".")

            if len(parts) < 3:
                continue

            country = parts[0].upper()
            admin1 = parts[1].upper()
            admin2 = ".".join(parts[2:]).upper()

            output.setdefault(country, {})
            output[country].setdefault(admin1, {})
            output[country][admin1][admin2] = {
                "code": admin2,
                "admin1_code": admin1,
                "name": clean(row[1]),
                "ascii_name": clean(row[2]),
                "geoname_id": clean(row[3]),
                "aliases": sorted({
                    clean(row[1]),
                    clean(row[2]),
                } - {""}),
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
            admin1 = clean(row[10]).upper() or "Unknown"
            admin2 = clean(row[11]).upper() or "Unknown"

            if not country:
                continue

            alternate_names = [
                clean(item)
                for item in clean(row[3]).split(",")
                if clean(item)
            ]

            city = {
                "geoname_id": clean(row[0]),
                "name": clean(row[1]),
                "ascii_name": clean(row[2]),
                "alternate_names": alternate_names[:50],
                "latitude": clean(row[4]),
                "longitude": clean(row[5]),
                "feature_class": clean(row[6]),
                "feature_code": clean(row[7]),
                "country_code": country,
                "cc2": clean(row[9]),
                "admin1_code": admin1,
                "admin2_code": admin2,
                "admin3_code": clean(row[12]),
                "admin4_code": clean(row[13]),
                "population": clean(row[14]),
                "elevation": clean(row[15]),
                "dem": clean(row[16]),
                "timezone": clean(row[17]),
                "modified_at": clean(row[18]),
            }

            output.setdefault(country, {})
            output[country].setdefault(admin1, [])
            output[country][admin1].append(city)

    return output


def build_territory_indexes(
    admin1: dict[str, dict[str, dict[str, Any]]],
    countries: dict[str, dict[str, Any]],
    output_dir: Path,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_entries = []

    for country, subdivisions in sorted(admin1.items()):
        country_info = countries.get(country, {})

        payload = {
            "schema": "zzx-bitnodes-geo-territories-v1",
            "generated_at": utc_now(),
            "country_code": country,
            "country_name": country_info.get("country_name", country),
            "subdivision_label": "admin1",
            "source": "GeoNames admin1CodesASCII",
            "subdivisions": {},
            "aliases": {},
        }

        for code, item in sorted(subdivisions.items()):
            name = clean(item.get("name")) or clean(item.get("ascii_name")) or code

            payload["subdivisions"][code] = name

            for alias in item.get("aliases", []):
                alias_text = clean(alias)

                if alias_text:
                    payload["aliases"][alias_text] = code

        path = output_dir / f"{country}.json"
        write_json(path, payload)

        manifest_entries.append({
            "country_code": country,
            "country_name": payload["country_name"],
            "path": str(path.relative_to(output_dir.parent)),
            "subdivision_count": len(payload["subdivisions"]),
        })

    return {
        "schema": "zzx-bitnodes-geo-territories-manifest-v1",
        "generated_at": utc_now(),
        "entry_count": len(manifest_entries),
        "entries": manifest_entries,
    }


def build_county_indexes(
    admin2: dict[str, dict[str, dict[str, dict[str, Any]]]],
    countries: dict[str, dict[str, Any]],
    output_dir: Path,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_entries = []

    for country, admin1_items in sorted(admin2.items()):
        country_info = countries.get(country, {})

        payload = {
            "schema": "zzx-bitnodes-geo-counties-v1",
            "generated_at": utc_now(),
            "country_code": country,
            "country_name": country_info.get("country_name", country),
            "subdivision_label": "admin2",
            "source": "GeoNames admin2Codes",
            "admin1": {},
        }

        count = 0

        for admin1_code, county_items in sorted(admin1_items.items()):
            payload["admin1"][admin1_code] = {
                "counties": {},
                "aliases": {},
            }

            for county_code, item in sorted(county_items.items()):
                name = clean(item.get("name")) or clean(item.get("ascii_name")) or county_code

                payload["admin1"][admin1_code]["counties"][county_code] = name

                for alias in item.get("aliases", []):
                    alias_text = clean(alias)

                    if alias_text:
                        payload["admin1"][admin1_code]["aliases"][alias_text] = county_code

                count += 1

        path = output_dir / f"{country}.json"
        write_json(path, payload)

        manifest_entries.append({
            "country_code": country,
            "country_name": payload["country_name"],
            "path": str(path.relative_to(output_dir.parent)),
            "county_count": count,
        })

    return {
        "schema": "zzx-bitnodes-geo-counties-manifest-v1",
        "generated_at": utc_now(),
        "entry_count": len(manifest_entries),
        "entries": manifest_entries,
    }


def build_city_indexes(
    cities: dict[str, dict[str, list[dict[str, Any]]]],
    countries: dict[str, dict[str, Any]],
    output_dir: Path,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest_entries = []

    for country, admin1_items in sorted(cities.items()):
        country_info = countries.get(country, {})

        country_dir = output_dir / country
        country_dir.mkdir(parents=True, exist_ok=True)

        city_count = 0
        admin1_manifest = []

        for admin1_code, city_rows in sorted(admin1_items.items()):
            city_rows = sorted(
                city_rows,
                key=lambda item: (
                    -int(item.get("population") or 0),
                    item.get("name") or "",
                ),
            )

            payload = {
                "schema": "zzx-bitnodes-geo-cities-v1",
                "generated_at": utc_now(),
                "country_code": country,
                "country_name": country_info.get("country_name", country),
                "admin1_code": admin1_code,
                "source": "GeoNames cities500",
                "cities": city_rows,
            }

            path = country_dir / f"{admin1_code}.json"
            write_json(path, payload)

            city_count += len(city_rows)

            admin1_manifest.append({
                "admin1_code": admin1_code,
                "path": str(path.relative_to(output_dir.parent)),
                "city_count": len(city_rows),
            })

        manifest_entries.append({
            "country_code": country,
            "country_name": country_info.get("country_name", country),
            "city_count": city_count,
            "admin1": admin1_manifest,
        })

    return {
        "schema": "zzx-bitnodes-geo-cities-manifest-v1",
        "generated_at": utc_now(),
        "entry_count": len(manifest_entries),
        "entries": manifest_entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build local global GeoNames-derived JSON indexes for Bitnodes enrichment."
    )

    parser.add_argument(
        "--geo-root",
        default=str(DEFAULT_GEO_ROOT),
        help="Root directory for generated geo indexes.",
    )

    parser.add_argument(
        "--source-dir",
        default="",
        help="Directory containing downloaded GeoNames source files.",
    )

    parser.add_argument(
        "--download",
        action="store_true",
        help="Download GeoNames source files before building.",
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite downloaded source files and extracted city data.",
    )

    parser.add_argument(
        "--only",
        default="all",
        choices=["all", "territories", "counties", "cities"],
        help="Only build a specific index family.",
    )

    args = parser.parse_args()

    geo_root = Path(args.geo_root).resolve()
    source_dir = Path(args.source_dir).resolve() if args.source_dir else geo_root / "sources"

    territory_dir = geo_root / "territories"
    county_dir = geo_root / "counties"
    city_dir = geo_root / "cities"
    manifest_dir = geo_root / "manifests"

    source_paths = ensure_sources(
        source_dir,
        download_sources=args.download,
        force=args.force,
    )

    countries = parse_country_info(source_paths["country_info"])
    admin1 = parse_admin1(source_paths["admin1"])
    admin2 = parse_admin2(source_paths["admin2"])
    cities = parse_cities(source_paths["cities"])

    manifests = {
        "schema": "zzx-bitnodes-geo-index-build-v1",
        "generated_at": utc_now(),
        "geo_root": str(geo_root),
        "source_dir": str(source_dir),
        "indexes": {},
    }

    if args.only in {"all", "territories"}:
        territory_manifest = build_territory_indexes(
            admin1,
            countries,
            territory_dir,
        )

        write_json(manifest_dir / "territories.json", territory_manifest)
        manifests["indexes"]["territories"] = territory_manifest

    if args.only in {"all", "counties"}:
        county_manifest = build_county_indexes(
            admin2,
            countries,
            county_dir,
        )

        write_json(manifest_dir / "counties.json", county_manifest)
        manifests["indexes"]["counties"] = county_manifest

    if args.only in {"all", "cities"}:
        city_manifest = build_city_indexes(
            cities,
            countries,
            city_dir,
        )

        write_json(manifest_dir / "cities.json", city_manifest)
        manifests["indexes"]["cities"] = city_manifest

    write_json(manifest_dir / "geo-index.json", manifests)

    print(f"geo indexes built: {geo_root}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
