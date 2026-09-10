#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import dataclasses
import datetime as dt
import hashlib
import html
from html.parser import HTMLParser
import io
import json
import math
from pathlib import Path
import re
import tarfile
import time
from typing import Iterable
import urllib.parse
import urllib.request
import zipfile

UA = "ZZX-Labs-WorldFactbook-Archive/2.0 (+https://zzx-labs.io)"
IA_SEARCH = "https://archive.org/advancedsearch.php"
IA_METADATA = "https://archive.org/metadata/{identifier}"
IA_DOWNLOAD = "https://archive.org/download/{identifier}/{filename}"
IA_ITEM = "https://archive.org/details/{identifier}"
CDX = "https://web.archive.org/cdx/search/cdx"
WAYBACK = "https://web.archive.org/web/{timestamp}id_/{original}"
SCHEMA = "zzx-global-power-grid-factbook-history-v2"
INDEX_SCHEMA = "zzx-worldfactbook-reference-index-v2"
PARSER_VERSION = 2

COUNTRY_ALIASES = {
    "US": ["United States", "United States of America"],
    "RU": ["Russia", "Russian Federation"],
    "KR": ["South Korea", "Korea South", "Republic of Korea"],
    "KP": ["North Korea", "Korea North", "Democratic People's Republic of Korea"],
    "CZ": ["Czech Republic", "Czechia"],
    "MM": ["Burma", "Myanmar"],
    "SZ": ["Swaziland", "Eswatini"],
    "MK": ["Macedonia", "North Macedonia"],
    "CV": ["Cape Verde", "Cabo Verde"],
    "TL": ["East Timor", "Timor-Leste"],
    "TR": ["Turkey", "Turkiye", "Türkiye"],
    "CI": ["Cote d'Ivoire", "Côte d'Ivoire", "Ivory Coast"],
    "LA": ["Laos", "Lao People's Democratic Republic"],
    "VN": ["Vietnam", "Viet Nam"],
    "BN": ["Brunei", "Brunei Darussalam"],
    "BO": ["Bolivia", "Bolivia Plurinational State"],
    "VE": ["Venezuela", "Venezuela Bolivarian Republic"],
    "TZ": ["Tanzania", "United Republic of Tanzania"],
    "MD": ["Moldova", "Republic of Moldova"],
    "SY": ["Syria", "Syrian Arab Republic"],
    "IR": ["Iran", "Islamic Republic of Iran"],
}

STRUCTURE_MARKERS = (
    "background",
    "geography",
    "people",
    "government",
    "economy",
    "communications",
    "transportation",
    "military",
    "electricity",
)

MIX_TERMS = {
    "coal": r"coal",
    "naturalGas": r"natural\s+gas",
    "oil": r"(?:petroleum(?:\s+and\s+other\s+liquids)?|oil)",
    "nuclear": r"nuclear",
    "hydro": r"hydro(?:electric(?:ity)?)?",
    "solar": r"solar",
    "wind": r"wind",
    "geothermal": r"geothermal",
    "biomass": r"biomass",
    "waste": r"waste",
    "tidal": r"tidal",
    "fossilFuels": r"fossil\s+fuels",
    "renewablesOther": r"other\s+renewable(?:s|\s+sources)?",
}


def utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def norm(value: object) -> str:
    import unicodedata

    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def finite(value: object) -> float | None:
    if value is None:
        return None
    try:
        n = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def get_bytes(url: str, timeout: int = 120, accept: str = "*/*") -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": accept},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def get_json(url: str, timeout: int = 45) -> object:
    return json.loads(get_bytes(url, timeout, "application/json").decode("utf-8", "replace"))


def cache_get(url: str, cache_dir: Path, max_bytes: int = 700 * 1024 * 1024) -> bytes:
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(url.encode()).hexdigest()
    body = cache_dir / key
    meta = cache_dir / f"{key}.json"

    if body.exists():
        return body.read_bytes()

    data = get_bytes(url)
    if len(data) > max_bytes:
        raise ValueError(f"source exceeds limit: {len(data)} bytes: {url}")

    body.write_bytes(data)
    meta.write_text(
        json.dumps({"url": url, "bytes": len(data), "retrieved_at": utcnow()}, indent=2) + "\n",
        encoding="utf-8",
    )
    return data


class TextExtractor(HTMLParser):
    BLOCK = {
        "title", "p", "div", "section", "article", "li", "tr", "td", "th",
        "h1", "h2", "h3", "h4", "h5", "br", "dt", "dd",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        t = tag.lower()
        if t in {"script", "style", "svg", "noscript"}:
            self.skip += 1
        elif not self.skip and t in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        if t in {"script", "style", "svg", "noscript"} and self.skip:
            self.skip -= 1
        elif not self.skip and t in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.parts.append(data)

    def text(self) -> str:
        raw = html.unescape("".join(self.parts)).replace("\r", "")
        return "\n".join(
            re.sub(r"\s+", " ", line).strip()
            for line in raw.splitlines()
            if re.sub(r"\s+", " ", line).strip()
        )


def html_to_text(data: bytes) -> str:
    parser = TextExtractor()
    try:
        parser.feed(data.decode("utf-8", "replace"))
        return parser.text()
    except Exception:
        return re.sub(r"<[^>]+>", " ", data.decode("utf-8", "replace"))


def scale(word: str | None) -> float:
    return {
        "trillion": 1e12,
        "billion": 1e9,
        "million": 1e6,
        "thousand": 1e3,
    }.get((word or "").lower(), 1.0)


def energy_kwh(number: str, magnitude: str | None, unit: str) -> float | None:
    n = finite(number)
    if n is None:
        return None
    n *= scale(magnitude)
    u = unit.lower()
    if u == "twh":
        n *= 1e9
    elif u == "gwh":
        n *= 1e6
    elif u == "mwh":
        n *= 1e3
    elif u == "wh":
        n /= 1e3
    return n


def power_kw(number: str, magnitude: str | None, unit: str) -> float | None:
    n = finite(number)
    if n is None:
        return None
    n *= scale(magnitude)
    u = unit.lower()
    if u == "tw":
        n *= 1e9
    elif u == "gw":
        n *= 1e6
    elif u == "mw":
        n *= 1e3
    elif u == "w":
        n /= 1e3
    return n


ENERGY_RE = r"([0-9][0-9,.]*)\s*(trillion|billion|million|thousand)?\s*(TWh|GWh|MWh|kWh|Wh)\b"
POWER_RE = r"([0-9][0-9,.]*)\s*(trillion|billion|million|thousand)?\s*(TW|GW|MW|kW|W)\b"


def observation_year(raw: str) -> int | None:
    years = [int(y) for y in re.findall(r"\b((?:19|20)\d{2})\b", raw)]
    return years[-1] if years else None


def find_energy(text: str, label: str) -> dict[str, object] | None:
    match = re.search(
        rf"(?:electricity\s*[-–—:]?\s*)?{label}\s*:?\s*{ENERGY_RE}[^\n]{{0,120}}",
        text,
        re.I,
    )
    if not match:
        return None

    value = energy_kwh(match.group(1), match.group(2), match.group(3))
    if value is None:
        return None

    raw = match.group(0).strip()
    return {"value": value, "raw": raw, "observation_year": observation_year(raw)}


def find_capacity(text: str) -> dict[str, object] | None:
    match = re.search(
        rf"(?:electricity\s*[-–—:]?\s*)?(?:installed\s+(?:generating\s+)?capacity|installed\s+generating\s+capacity)\s*:?\s*{POWER_RE}[^\n]{{0,120}}",
        text,
        re.I,
    )
    if not match:
        return None

    value = power_kw(match.group(1), match.group(2), match.group(3))
    if value is None:
        return None

    raw = match.group(0).strip()
    return {"value": value, "raw": raw, "observation_year": observation_year(raw)}


def find_mix(text: str) -> dict[str, float]:
    lower = text.lower()
    match = re.search(r"electricity\s*(?:-|—|–|:)?\s*(?:from|generation sources|source)", lower, re.I)
    scope = text[match.start():match.start() + 9000] if match else text[:9000]
    out: dict[str, float] = {}

    for key, term in MIX_TERMS.items():
        found = re.search(rf"{term}\s*:?\s*([0-9]{{1,3}}(?:\.[0-9]+)?)\s*%", scope, re.I)
        if found:
            n = finite(found.group(1))
            if n is not None and 0 <= n <= 100:
                out[key] = n

    return out


@dataclasses.dataclass(frozen=True)
class Country:
    code: str
    name: str
    official: str
    aliases: tuple[str, ...]


class Resolver:
    def __init__(self, registry: dict[str, object]):
        self.countries: list[Country] = []
        self.alias_to_country: dict[str, Country] = {}

        for row in registry.get("countries", []):
            if not isinstance(row, dict):
                continue
            code = str(row.get("country") or "").upper()
            if not re.fullmatch(r"[A-Z]{2}", code):
                continue

            name = str(row.get("countryName") or row.get("name") or code)
            official = str(row.get("officialName") or name)
            aliases = {name, official, *COUNTRY_ALIASES.get(code, [])}
            country = Country(code, name, official, tuple(sorted(aliases)))
            self.countries.append(country)

            for alias in aliases:
                normalized = norm(alias)
                if normalized:
                    self.alias_to_country[normalized] = country

    def resolve_name(self, value: object) -> Country | None:
        normalized = norm(value)
        if not normalized:
            return None
        return self.alias_to_country.get(normalized)

    def structural_score(self, lines: list[str], index: int) -> int:
        scope = "\n".join(lines[index:index + 2200]).lower()
        if "electricity" not in scope:
            return 0
        return sum(marker in scope for marker in STRUCTURE_MARKERS)

    def explicit_page(self, filename: str, text: str) -> tuple[Country | None, str, str]:
        head = "\n".join(text.splitlines()[:100])
        patterns = [
            r"CIA\s*[-–—:]{1,3}\s*The World Factbook\s*[-–—:]{1,3}\s*([^\n|]+)",
            r"The World Factbook\s*[-–—:]{1,3}\s*([^\n|]+)",
            r"([^\n|]+)\s*[-–—|]\s*The World Factbook",
            r"^\s*Country\s*[:\-]\s*([^\n]+)",
        ]

        for pattern in patterns:
            match = re.search(pattern, head, re.I | re.M)
            if not match:
                continue
            raw = match.group(1).strip()
            country = self.resolve_name(raw)
            if country:
                return country, raw, "page-title"

        lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]
        for index, line in enumerate(lines[:40]):
            country = self.resolve_name(line)
            if country and self.structural_score(lines, index) >= 4:
                return country, line, "country-page-heading"

        path = urllib.parse.unquote(filename).replace("\\", "/")
        slug_match = re.search(r"/countries/([^/]+)/?", path, re.I)
        if slug_match:
            slug = slug_match.group(1).replace("-", " ")
            country = self.resolve_name(slug)
            if country:
                return country, slug, "filename-country"

        stem = norm(Path(path).stem)
        country = self.resolve_name(stem)
        if country:
            return country, country.name, "filename-country"

        return None, "", ""

    def book_sections(self, text: str) -> list[tuple[Country, str]]:
        lines = [re.sub(r"\s+", " ", line).strip() for line in text.replace("\r", "").splitlines()]
        best: dict[str, tuple[int, Country, int]] = {}

        for index, line in enumerate(lines):
            country = self.resolve_name(line)
            if not country:
                continue
            score = self.structural_score(lines, index)
            if score < 4:
                continue
            previous = best.get(country.code)
            if previous is None or score > previous[2]:
                best[country.code] = (index, country, score)

        anchors = sorted(best.values(), key=lambda item: item[0])
        sections: list[tuple[Country, str]] = []

        for i, (start, country, _) in enumerate(anchors):
            end = anchors[i + 1][0] if i + 1 < len(anchors) else len(lines)
            body = "\n".join(lines[start:end])
            if "electricity" in body.lower():
                sections.append((country, body))

        return sections


def detect_edition_year(requested_year: int, *values: object) -> int:
    candidates: list[int] = []
    for value in values:
        for match in re.findall(r"\b((?:19|20)\d{2})\b", str(value or "")):
            year = int(match)
            if 1962 <= year <= 2025 and abs(year - requested_year) <= 2:
                candidates.append(year)
    return candidates[0] if candidates else requested_year


def record_from_section(
    country: Country,
    edition_year: int,
    text: str,
    source: dict[str, object],
    country_basis: str,
) -> dict[str, object] | None:
    generation = find_energy(text, r"(?:production|generation)(?!\s+sources)")
    consumption = find_energy(text, r"consumption")
    capacity = find_capacity(text)
    mix = find_mix(text)

    if not generation and not consumption and not capacity and not mix:
        return None

    years = [
        item.get("observation_year")
        for item in (generation, consumption, capacity)
        if item and isinstance(item.get("observation_year"), int)
    ]

    return {
        "country": country.code,
        "country_name": country.name,
        "edition_year": edition_year,
        "year": edition_year,
        "observation_year": max(years) if years else edition_year,
        "field_observation_years": {
            "electricity_generation_kwh": generation.get("observation_year") if generation else None,
            "electricity_consumption_kwh": consumption.get("observation_year") if consumption else None,
            "installed_capacity_kw": capacity.get("observation_year") if capacity else None,
        },
        "electricity_generation_kwh": generation.get("value") if generation else None,
        "electricity_consumption_kwh": consumption.get("value") if consumption else None,
        "installed_capacity_kw": capacity.get("value") if capacity else None,
        "generation_by_source_pct": mix,
        "source": "CIA World Factbook public archive",
        "source_provider": source.get("provider"),
        "source_url": source.get("source_url") or source.get("container_url"),
        "source_identifier": source.get("identifier"),
        "source_file": source.get("source_file"),
        "field_provenance": {
            "electricity_generation_kwh": generation.get("raw") if generation else None,
            "electricity_consumption_kwh": consumption.get("raw") if consumption else None,
            "installed_capacity_kw": capacity.get("raw") if capacity else None,
        },
        "quality": {
            "status": "verified",
            "parser_version": PARSER_VERSION,
            "country_basis": country_basis,
            "field_basis": "explicit-electricity-label",
        },
    }


def parse_page(
    resolver: Resolver,
    requested_year: int,
    filename: str,
    text: str,
    source: dict[str, object],
) -> tuple[dict[str, object] | None, dict[str, object] | None]:
    country, entity, basis = resolver.explicit_page(filename, text)
    if not country:
        return None, None

    edition_year = detect_edition_year(
        requested_year,
        source.get("title"),
        source.get("source_file"),
        text[:4000],
    )

    page = {
        "edition_year": edition_year,
        "country": country.code,
        "country_name": country.name,
        "source_entity": entity or country.name,
        "country_basis": basis,
        "provider": source.get("provider"),
        "item_identifier": source.get("identifier"),
        "item_url": source.get("item_url"),
        "container_url": source.get("container_url"),
        "inner_path": filename,
        "source_url": source.get("source_url") or source.get("container_url"),
        "capture_timestamp": source.get("capture_timestamp"),
    }

    return record_from_section(country, edition_year, text, source, basis), page


def parse_book(
    resolver: Resolver,
    requested_year: int,
    filename: str,
    text: str,
    source: dict[str, object],
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    edition_year = detect_edition_year(
        requested_year,
        source.get("title"),
        source.get("source_file"),
        text[:5000],
    )
    records: list[dict[str, object]] = []
    pages: list[dict[str, object]] = []

    for country, body in resolver.book_sections(text):
        record = record_from_section(country, edition_year, body, source, "book-section-heading")
        if not record:
            continue
        records.append(record)
        pages.append({
            "edition_year": edition_year,
            "country": country.code,
            "country_name": country.name,
            "source_entity": country.name,
            "country_basis": "book-section-heading",
            "provider": source.get("provider"),
            "item_identifier": source.get("identifier"),
            "item_url": source.get("item_url"),
            "container_url": source.get("container_url"),
            "inner_path": filename,
            "source_url": source.get("source_url") or source.get("container_url"),
            "capture_timestamp": source.get("capture_timestamp"),
        })

    return records, pages


def score_record(row: dict[str, object]) -> float:
    score = sum(
        row.get(key) is not None
        for key in (
            "electricity_generation_kwh",
            "electricity_consumption_kwh",
            "installed_capacity_kw",
        )
    )
    score += min(1.0, len(row.get("generation_by_source_pct") or {}) / 6)
    basis = str((row.get("quality") or {}).get("country_basis") or "")
    if basis in {"page-title", "country-page-heading", "filename-country"}:
        score += 0.5
    return score


def merge_records(existing: Iterable[dict[str, object]], new: Iterable[dict[str, object]]) -> list[dict[str, object]]:
    by_key: dict[tuple[str, int], dict[str, object]] = {}

    for row in [*existing, *new]:
        quality = row.get("quality") or {}
        if str(quality.get("status") or "").lower() != "verified":
            continue
        try:
            key = (str(row["country"]), int(row.get("edition_year") or row["year"]))
        except Exception:
            continue
        previous = by_key.get(key)
        if previous is None or score_record(row) > score_record(previous):
            by_key[key] = row

    return sorted(
        by_key.values(),
        key=lambda row: (int(row.get("edition_year") or row["year"]), str(row["country"])),
    )


def merge_pages(existing: Iterable[dict[str, object]], new: Iterable[dict[str, object]]) -> list[dict[str, object]]:
    by_key: dict[tuple[object, ...], dict[str, object]] = {}
    for row in [*existing, *new]:
        key = (
            row.get("edition_year"),
            row.get("country"),
            row.get("provider"),
            row.get("inner_path"),
            row.get("capture_timestamp"),
        )
        by_key[key] = row
    return sorted(
        by_key.values(),
        key=lambda row: (
            int(row.get("edition_year") or 0),
            str(row.get("country") or ""),
            str(row.get("inner_path") or ""),
        ),
    )


def ia_search(year: int, rows: int = 50) -> list[dict[str, object]]:
    query = f'(title:"World Factbook" OR title:"The World Factbook" OR title:"CIA World Factbook") AND year:{year}'
    params = [
        ("q", query),
        ("fl[]", "identifier"),
        ("fl[]", "title"),
        ("fl[]", "date"),
        ("fl[]", "year"),
        ("fl[]", "mediatype"),
        ("fl[]", "downloads"),
        ("rows", str(rows)),
        ("page", "1"),
        ("output", "json"),
    ]
    payload = get_json(IA_SEARCH + "?" + urllib.parse.urlencode(params))
    docs = [row for row in payload.get("response", {}).get("docs", []) if row.get("identifier")]
    return sorted(docs, key=lambda row: float(row.get("downloads") or 0), reverse=True)


def ia_file_score(file: dict[str, object], year: int) -> float:
    name = str(file.get("name") or "")
    lower = name.lower()
    size = finite(file.get("size"))
    if size is not None and size > 700 * 1024 * 1024:
        return -1e9

    if lower.endswith(".zip"):
        score = 900
    elif lower.endswith(".tar.gz") or lower.endswith(".tgz"):
        score = 850
    elif lower.endswith("_hocr.html"):
        score = 650
    elif lower.endswith("_djvu.txt"):
        score = 600
    elif lower.endswith(".txt"):
        score = 400
    elif lower.endswith(".html") or lower.endswith(".htm"):
        score = 300
    else:
        return -1e9

    if "factbook" in lower:
        score += 90
    if str(year) in lower:
        score += 35
    if any(bad in lower for bad in ("meta.xml", "files.xml", "torrent", "sqlite")):
        score -= 600
    if size is not None and size < 1024:
        score -= 150
    return score


def ia_candidates(year: int, max_items: int = 6) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    for doc in ia_search(year)[:max_items]:
        identifier = str(doc["identifier"])
        metadata = get_json(IA_METADATA.format(identifier=urllib.parse.quote(identifier)))
        ranked = sorted(metadata.get("files", []), key=lambda file: ia_file_score(file, year), reverse=True)
        ranked = [file for file in ranked if ia_file_score(file, year) > 0][:6]
        if ranked:
            out.append({"doc": doc, "files": ranked})
    return out


def archive_members(data: bytes, filename: str) -> Iterable[tuple[str, bytes]]:
    lower = filename.lower()

    if lower.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for info in archive.infolist():
                if info.is_dir() or info.file_size > 5 * 1024 * 1024:
                    continue
                if not info.filename.lower().endswith((".html", ".htm", ".txt")):
                    continue
                try:
                    yield info.filename, archive.read(info)
                except Exception:
                    continue
        return

    if lower.endswith(".tar.gz") or lower.endswith(".tgz"):
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as archive:
            for member in archive.getmembers():
                if not member.isfile() or member.size > 5 * 1024 * 1024:
                    continue
                if not member.name.lower().endswith((".html", ".htm", ".txt")):
                    continue
                file = archive.extractfile(member)
                if file:
                    yield member.name, file.read()
        return

    yield filename, data


def extract_ia_file(
    requested_year: int,
    doc: dict[str, object],
    file: dict[str, object],
    resolver: Resolver,
    cache_dir: Path,
) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, object]]:
    identifier = str(doc["identifier"])
    filename = str(file["name"])
    encoded = "/".join(urllib.parse.quote(part) for part in filename.split("/"))
    url = IA_DOWNLOAD.format(identifier=urllib.parse.quote(identifier), filename=encoded)
    data = cache_get(url, cache_dir)
    source_base = {
        "provider": "internet-archive",
        "identifier": identifier,
        "item_url": IA_ITEM.format(identifier=identifier),
        "container_url": url,
        "source_url": url,
        "title": doc.get("title"),
    }

    records: list[dict[str, object]] = []
    pages: list[dict[str, object]] = []

    members = list(archive_members(data, filename))
    archive_has_many_members = len(members) > 3

    for inner_name, inner_data in members:
        lower = inner_name.lower()
        if any(part in lower for part in ("/maps/", "/flags/", "/appendix/", "/rankorder/", "/fields/")):
            continue

        text = html_to_text(inner_data) if lower.endswith((".html", ".htm")) else inner_data.decode("utf-8", "replace")
        source = {**source_base, "source_file": inner_name}

        record, page = parse_page(resolver, requested_year, inner_name, text, source)
        if page:
            pages.append(page)
        if record:
            records.append(record)
            continue

        # Standalone OCR/hOCR files are usually the entire annual book. The
        # v1 parser treated them as one country page, which caused the corrupt
        # nation assignments now being purged. Segment them by strong country
        # headings before extracting electricity fields.
        if not archive_has_many_members or len(text) > 150_000:
            book_records, book_pages = parse_book(
                resolver,
                requested_year,
                inner_name,
                text,
                source,
            )
            records.extend(book_records)
            pages.extend(book_pages)

    merged = merge_records([], records)
    ref = {
        "edition_year": detect_edition_year(requested_year, doc.get("title"), filename),
        "provider": "internet-archive",
        "identifier": identifier,
        "item_url": source_base["item_url"],
        "artifact_url": url,
        "file": filename,
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
        "extracted_country_pages": len(pages),
        "electricity_records": len(merged),
        "parser_version": PARSER_VERSION,
        "retrieved_at": utcnow(),
    }
    return merged, pages, ref


def cdx(pattern: str, year: int, limit: int) -> list[dict[str, str]]:
    params = [
        ("url", pattern),
        ("output", "json"),
        ("fl", "timestamp,original,statuscode,mimetype,digest"),
        ("filter", "statuscode:200"),
        ("from", str(year)),
        ("to", str(year)),
        ("collapse", "urlkey"),
        ("limit", str(limit)),
    ]
    payload = get_json(CDX + "?" + urllib.parse.urlencode(params))
    if not isinstance(payload, list) or len(payload) < 2:
        return []
    headers = payload[0]
    return [dict(zip(headers, row)) for row in payload[1:]]


def wayback_pages(year: int, max_pages: int) -> list[dict[str, str]]:
    patterns = [
        "https://www.cia.gov/library/publications/the-world-factbook/geos/*.html",
        "https://www.cia.gov/cia/publications/factbook/geos/*.html",
        "http://www.odci.gov/cia/publications/factbook/geos/*.html",
        "https://www.cia.gov/the-world-factbook/countries/*/",
    ]
    found: dict[str, dict[str, str]] = {}

    for pattern in patterns:
        try:
            rows = cdx(pattern, year, max_pages)
        except Exception:
            continue
        for row in rows:
            original = row.get("original") or ""
            if original and original not in found:
                found[original] = row
            if len(found) >= max_pages:
                break
        if len(found) >= max_pages:
            break

    return list(found.values())[:max_pages]


def extract_wayback_year(
    year: int,
    resolver: Resolver,
    cache_dir: Path,
    workers: int,
    max_pages: int,
) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, object] | None]:
    captures = wayback_pages(year, max_pages)
    if not captures:
        return [], [], None

    def fetch_capture(capture: dict[str, str]):
        url = WAYBACK.format(timestamp=capture["timestamp"], original=capture["original"])
        data = cache_get(url, cache_dir, max_bytes=6 * 1024 * 1024)
        text = html_to_text(data)
        source = {
            "provider": "wayback",
            "identifier": None,
            "item_url": None,
            "container_url": url,
            "source_url": url,
            "source_file": urllib.parse.urlparse(capture["original"]).path,
            "capture_timestamp": capture["timestamp"],
            "title": "",
        }
        return parse_page(
            resolver,
            year,
            urllib.parse.urlparse(capture["original"]).path,
            text,
            source,
        )

    records: list[dict[str, object]] = []
    pages: list[dict[str, object]] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = [pool.submit(fetch_capture, capture) for capture in captures]
        for future in concurrent.futures.as_completed(futures):
            try:
                record, page = future.result()
            except Exception:
                continue
            if page:
                pages.append(page)
            if record:
                records.append(record)

    merged = merge_records([], records)
    ref = {
        "edition_year": year,
        "provider": "wayback",
        "discovered_country_pages": len(captures),
        "extracted_country_pages": len(pages),
        "electricity_records": len(merged),
        "parser_version": PARSER_VERSION,
        "retrieved_at": utcnow(),
    }
    return merged, pages, ref


def load_json(path: Path, default: object) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def ledger_document(records: list[dict[str, object]], start_year: int, end_year: int) -> dict[str, object]:
    years = [int(row["edition_year"]) for row in records if row.get("edition_year")]
    return {
        "schema": SCHEMA,
        "source": "CIA World Factbook public copies: Internet Archive + Wayback Machine",
        "generated_at": utcnow(),
        "scan_start_year": start_year,
        "scan_end_year": end_year,
        "quality_policy": "Only explicit electricity fields with strong country attribution are published.",
        "record_count": len(records),
        "country_count": len({row["country"] for row in records}),
        "earliest_edition": min(years) if years else None,
        "latest_edition": max(years) if years else None,
        "records": records,
    }


def sync(args: argparse.Namespace) -> dict[str, object]:
    registry = load_json(args.country_registry, {"countries": []})
    resolver = Resolver(registry)

    existing_ledger = load_json(args.electricity_output, {"schema": SCHEMA, "records": []})
    existing_index = load_json(args.reference_output, {"schema": INDEX_SCHEMA, "editions": [], "pages": []})

    # v1 output is intentionally not carried forward. Its whole-book parser
    # could bind one country's electricity values to another country.
    if args.rebuild or existing_ledger.get("schema") != SCHEMA:
        records: list[dict[str, object]] = []
    else:
        records = merge_records([], list(existing_ledger.get("records") or []))

    if args.rebuild or existing_index.get("schema") != INDEX_SCHEMA:
        editions: list[dict[str, object]] = []
        pages: list[dict[str, object]] = []
    else:
        editions = list(existing_index.get("editions") or [])
        pages = list(existing_index.get("pages") or [])

    complete_years = {
        int(row["edition_year"])
        for row in editions
        if int(row.get("electricity_records") or 0) >= args.min_records_per_edition
        and int(row.get("parser_version") or 0) >= PARSER_VERSION
    }

    errors: list[str] = []
    scanned: list[dict[str, object]] = []

    for requested_year in range(args.end_year, args.start_year - 1, -1):
        if requested_year in complete_years and not args.force:
            continue

        year_records: list[dict[str, object]] = []
        year_pages: list[dict[str, object]] = []
        year_refs: list[dict[str, object]] = []

        if args.internet_archive:
            try:
                for candidate in ia_candidates(requested_year, args.max_ia_items):
                    doc = candidate["doc"]
                    for file in candidate["files"]:
                        try:
                            candidate_records, candidate_pages, ref = extract_ia_file(
                                requested_year,
                                doc,
                                file,
                                resolver,
                                args.cache_dir / "internet-archive",
                            )
                        except Exception as exc:
                            errors.append(
                                f"{requested_year} IA {doc.get('identifier')}/{file.get('name')}: {exc}"
                            )
                            continue

                        year_refs.append(ref)
                        year_records = merge_records(year_records, candidate_records)
                        year_pages = merge_pages(year_pages, candidate_pages)

                        if len(year_records) >= args.min_records_per_edition:
                            break
                    if len(year_records) >= args.min_records_per_edition:
                        break
            except Exception as exc:
                errors.append(f"{requested_year} IA discovery: {exc}")

        if len(year_records) < args.min_records_per_edition and args.wayback:
            try:
                wb_records, wb_pages, ref = extract_wayback_year(
                    requested_year,
                    resolver,
                    args.cache_dir / "wayback",
                    args.workers,
                    args.max_wayback_pages,
                )
                year_records = merge_records(year_records, wb_records)
                year_pages = merge_pages(year_pages, wb_pages)
                if ref:
                    year_refs.append(ref)
            except Exception as exc:
                errors.append(f"{requested_year} Wayback: {exc}")

        if year_records:
            records = merge_records(records, year_records)
            pages = merge_pages(pages, year_pages)
            editions = [
                row for row in editions
                if int(row.get("edition_year") or -1) != requested_year
            ] + year_refs

        scanned.append({
            "year": requested_year,
            "electricity_records": len(year_records),
            "country_pages": len(year_pages),
            "references": len(year_refs),
        })

        ledger = ledger_document(records, args.start_year, args.end_year)
        index = {
            "schema": INDEX_SCHEMA,
            "generated_at": utcnow(),
            "scan_start_year": args.start_year,
            "scan_end_year": args.end_year,
            "editions": sorted(
                editions,
                key=lambda row: (int(row.get("edition_year") or 0), str(row.get("provider") or "")),
            ),
            "pages": pages,
        }

        write_json(args.electricity_output, ledger)
        write_json(args.reference_output, index)
        if args.power_grid_output:
            write_json(args.power_grid_output, ledger)
        if args.widget_output:
            write_json(args.widget_output, ledger)

        time.sleep(max(0.0, args.sleep))

    return {
        "schema": "zzx-worldfactbook-sync-report-v2",
        "records": len(records),
        "countries": len({row["country"] for row in records}),
        "editions": len(editions),
        "pages": len(pages),
        "scanned": scanned,
        "errors": errors,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--country-registry", type=Path, required=True)
    parser.add_argument("--electricity-output", type=Path, required=True)
    parser.add_argument("--reference-output", type=Path, required=True)
    parser.add_argument("--power-grid-output", type=Path)
    parser.add_argument("--widget-output", type=Path)
    parser.add_argument("--cache-dir", type=Path, default=Path(".cache/worldfactbook-v2"))
    parser.add_argument("--start-year", type=int, default=1962)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument("--max-ia-items", type=int, default=6)
    parser.add_argument("--min-records-per-edition", type=int, default=20)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--max-wayback-pages", type=int, default=320)
    parser.add_argument("--sleep", type=float, default=0.15)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--rebuild", action="store_true")
    parser.add_argument("--internet-archive", action="store_true", default=True)
    parser.add_argument("--no-internet-archive", action="store_false", dest="internet_archive")
    parser.add_argument("--wayback", action="store_true", default=True)
    parser.add_argument("--no-wayback", action="store_false", dest="wayback")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.start_year > args.end_year:
        raise SystemExit("start year must be <= end year")
    print(json.dumps(sync(args), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
