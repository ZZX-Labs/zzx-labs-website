#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib.util
import json
import math
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping


APP_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_GEO_ROOT = APP_ROOT / "bitcoin" / "bitnodes" / "data" / "geo"
DEFAULT_ZZXGCS_DIR = DEFAULT_GEO_ROOT / "zzxgcs"
DEFAULT_CACHE_PATH = DEFAULT_ZZXGCS_DIR / "zzxgcs-cache.json"

DEFAULT_ZZXGCS_REPO_DIR = Path(
    os.environ.get(
        "ZZXGCS_REPO_DIR",
        str(APP_ROOT / "private" / "zzxgcs"),
    )
)

DEFAULT_ZZXGCS_REPO_URL = os.environ.get("ZZXGCS_REPO_URL", "")
DEFAULT_ZZXGCS_WORDLIST_DIR = Path(
    os.environ.get(
        "ZZXGCS_WORDLIST_DIR",
        str(DEFAULT_ZZXGCS_REPO_DIR / "zzx_words"),
    )
)

SCHEMA = "zzx-bitnodes-zzxgcs-v3"
CACHE_SCHEMA = "zzx-gcs-cache-v3"
SUMMARY_SCHEMA = "zzx-bitnodes-zzxgcs-summary-v3"

UNKNOWN_VALUES = {"", "unknown", "none", "null", "undefined", "—", "-", "n/a", "na"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean(value: Any) -> str:
    text = str(value or "").strip()

    if text.lower() in UNKNOWN_VALUES:
        return ""

    return re.sub(r"\s+", " ", text)


def number(value: Any, fallback: float | None = None) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return fallback

    if not math.isfinite(n):
        return fallback

    return n


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

    text = json.dumps(
        payload,
        ensure_ascii=False,
        indent=None if compact else 2,
        separators=(",", ":") if compact else None,
        sort_keys=not compact,
        default=str,
    )

    path.write_text(text + "\n", encoding="utf-8")


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


def row_lat_lon(row: Mapping[str, Any]) -> tuple[float | None, float | None]:
    lat = number(
        first_value(
            row,
            "latitude",
            "lat",
            "geoloc.latitude",
            "city_data.latitude",
            "postal_data.latitude",
            "zip_data.latitude",
            "geo.latitude",
            "geo.lat",
            "geoip.latitude",
            "geoip.lat",
            "geoip_data.latitude",
            "location.latitude",
            "metadata.latitude",
        )
    )

    lon = number(
        first_value(
            row,
            "longitude",
            "lon",
            "lng",
            "geoloc.longitude",
            "city_data.longitude",
            "postal_data.longitude",
            "zip_data.longitude",
            "geo.longitude",
            "geo.lon",
            "geo.lng",
            "geoip.longitude",
            "geoip.lon",
            "geoip.lng",
            "geoip_data.longitude",
            "location.longitude",
            "metadata.longitude",
        )
    )

    if lat is None or lon is None:
        return None, None

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None, None

    return lat, lon


def detect_overlay(row: Mapping[str, Any]) -> str:
    network = clean(first_value(row, "network", "metadata.network")).lower()

    if (
        boolish(row.get("is_tor"))
        or boolish(row.get("suspected_tor"))
        or boolish(deep_get(row, "tor.is_tor"))
        or boolish(deep_get(row, "metadata.is_tor"))
        or boolish(deep_get(row, "metadata.tor.is_tor"))
        or network == "tor"
    ):
        return "tor"

    if (
        boolish(row.get("is_i2p"))
        or boolish(row.get("suspected_i2p"))
        or boolish(deep_get(row, "i2p.is_i2p"))
        or boolish(deep_get(row, "metadata.is_i2p"))
        or boolish(deep_get(row, "metadata.i2p.is_i2p"))
        or network == "i2p"
    ):
        return "i2p"

    return ""


def overlay_coordinates(row: Mapping[str, Any], lat: float | None, lon: float | None) -> tuple[float | None, float | None, str]:
    overlay = detect_overlay(row)

    if overlay == "tor":
        return 0.0, -32.0, "tor"

    if overlay == "i2p":
        return 0.0, 32.0, "i2p"

    return lat, lon, ""


def clamp_lat(lat: float) -> float:
    return max(-90.0, min(90.0, lat))


def wrap_lon(lon: float) -> float:
    while lon < -180.0:
        lon += 360.0

    while lon > 180.0:
        lon -= 360.0

    return lon


def cache_key(lat: float, lon: float, precision: int, volume: str, version: str, language: str) -> str:
    return f"{lat:.8f},{lon:.8f}:p{precision}:{volume}:{version}:{language}"


def load_cache(cache_path: Path) -> dict[str, Any]:
    cache = read_json(cache_path, fallback={})
    return cache if isinstance(cache, dict) else {}


def cache_entries(cache: Mapping[str, Any]) -> dict[str, Any]:
    entries = cache.get("entries")
    return dict(entries) if isinstance(entries, Mapping) else dict(cache)


def save_cache(cache_path: Path, entries: dict[str, Any], compact: bool = False) -> None:
    write_json(
        cache_path,
        {
            "schema": CACHE_SCHEMA,
            "updated_at": utc_now(),
            "entries": entries,
        },
        compact=compact,
    )


def run_command(command: list[str], cwd: Path | None = None) -> int:
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )

    if result.stdout.strip():
        print(result.stdout.strip(), flush=True)

    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr, flush=True)

    return result.returncode


def ensure_repo(repo_dir: Path, repo_url: str = "", branch: str = "", update: bool = False) -> bool:
    if repo_dir.exists() and (repo_dir / ".git").exists():
        if update:
            command = ["git", "pull", "--ff-only"]
            if branch:
                command.extend(["origin", branch])
            return run_command(command, cwd=repo_dir) == 0

        return True

    if repo_dir.exists() and any(repo_dir.iterdir()):
        return True

    if not repo_url:
        return False

    repo_dir.parent.mkdir(parents=True, exist_ok=True)

    command = ["git", "clone"]

    if branch:
        command.extend(["--branch", branch])

    command.extend([repo_url, str(repo_dir)])

    return run_command(command) == 0


def load_python_module(path: Path, module_name: str) -> Any | None:
    if not path.exists():
        return None

    spec = importlib.util.spec_from_file_location(module_name, str(path))

    if spec is None or spec.loader is None:
        return None

    module = importlib.util.module_from_spec(spec)

    try:
        spec.loader.exec_module(module)
    except Exception:
        return None

    return module


def discover_wordlist_paths(repo_dir: Path, wordlist_dir: Path, language: str, volume: str) -> list[Path]:
    candidates = [
        wordlist_dir / f"{language}_words.txt",
        wordlist_dir / f"{language}.txt",
        wordlist_dir / "english_words.txt",
        wordlist_dir / "words.txt",
        wordlist_dir / "wordlist.txt",
        repo_dir / "wordlists" / volume / f"{language}.txt",
        repo_dir / "wordlists" / volume / "english_words.txt",
        repo_dir / "wordlists" / volume / "words.txt",
        repo_dir / "wordlists" / f"{language}.txt",
        repo_dir / "wordlists" / "english_words.txt",
        repo_dir / "zzx_words" / f"{language}_words.txt",
        repo_dir / "zzx_words" / "english_words.txt",
    ]

    if wordlist_dir.exists():
        candidates.extend(sorted(wordlist_dir.glob("*.txt"))[:32])

    return [path for path in candidates if path.exists() and path.is_file()]


def normalize_word(value: str) -> str:
    text = clean(value).lower()
    text = re.sub(r"[^a-z0-9\-]+", "", text)
    return text


def load_words_from_paths(paths: list[Path], limit: int = 50000) -> list[str]:
    words: list[str] = []
    seen: set[str] = set()

    for path in paths:
        try:
            with path.open("r", encoding="utf-8", errors="ignore") as handle:
                for line in handle:
                    word = normalize_word(line)

                    if not word or word in seen:
                        continue

                    seen.add(word)
                    words.append(word)

                    if len(words) >= limit:
                        return words
        except Exception:
            continue

    return words


def repo_encode_from_module(
    repo_dir: Path,
    lat: float,
    lon: float,
    *,
    precision: int,
    volume: str,
    version: str,
    language: str,
) -> dict[str, Any] | None:
    module_candidates = [
        repo_dir / "zzxgcs.py",
        repo_dir / "zzx_gcs.py",
        repo_dir / "src" / "zzxgcs.py",
        repo_dir / "src" / "zzx_gcs.py",
        repo_dir / "zzxgcs" / "__init__.py",
        repo_dir / "zzxgcs" / "core.py",
        repo_dir / "zzxgcs" / "encoder.py",
    ]

    for path in module_candidates:
        module = load_python_module(path, "zzxgcs_private_runtime")

        if module is None:
            continue

        for fn_name in (
            "encode",
            "encode_lat_lon",
            "from_lat_lon",
            "zzxgcs_from_lat_lon",
            "coordinate_to_words",
        ):
            fn = getattr(module, fn_name, None)

            if not callable(fn):
                continue

            try:
                result = fn(
                    lat,
                    lon,
                    precision=precision,
                    volume=volume,
                    version=version,
                    language=language,
                )
            except TypeError:
                try:
                    result = fn(lat, lon)
                except Exception:
                    continue
            except Exception:
                continue

            if isinstance(result, Mapping):
                out = dict(result)
                address = clean(out.get("zzxgcs") or out.get("address") or out.get("uri"))
                words = out.get("words")

                if isinstance(words, str):
                    words = [word for word in words.replace("zzx://", "").split(".") if word]

                if address or isinstance(words, list):
                    out.setdefault("schema", SCHEMA)
                    out.setdefault("zzxgcs", address or "zzx://" + ".".join(str(word) for word in words))
                    out.setdefault("words", words if isinstance(words, list) else out["zzxgcs"].replace("zzx://", "").split("."))
                    out.setdefault("language", language)
                    out.setdefault("volume", volume)
                    out.setdefault("version", version)
                    out.setdefault("precision_words", len(out.get("words", [])))
                    out.setdefault("source", "zzxgcs-private-repo-module")
                    out.setdefault("confidence", "repo-high")
                    out.setdefault("looked_up_at", utc_now())
                    return out

            if isinstance(result, str) and result:
                address = result if result.startswith("zzx://") else "zzx://" + result
                return {
                    "schema": SCHEMA,
                    "zzxgcs": address,
                    "words": address.replace("zzx://", "").split("."),
                    "language": language,
                    "volume": volume,
                    "version": version,
                    "precision_words": len(address.replace("zzx://", "").split(".")),
                    "center_latitude": lat,
                    "center_longitude": lon,
                    "source": "zzxgcs-private-repo-module",
                    "confidence": "repo-high",
                    "looked_up_at": utc_now(),
                }

    return None


def grid_9m(lat: float, lon: float) -> dict[str, Any]:
    meters_per_degree_lat = 111_320.0
    meters_per_degree_lon = max(1.0, 111_320.0 * math.cos(math.radians(lat)))

    lat_step = 3.0 / meters_per_degree_lat
    lon_step = 3.0 / meters_per_degree_lon

    lat_index = math.floor((lat + 90.0) / lat_step)
    lon_index = math.floor((lon + 180.0) / lon_step)

    cell_south = lat_index * lat_step - 90.0
    cell_west = lon_index * lon_step - 180.0
    cell_north = clamp_lat(cell_south + lat_step)
    cell_east = wrap_lon(cell_west + lon_step)

    center_lat = (cell_south + cell_north) / 2.0
    center_lon = wrap_lon((cell_west + cell_east) / 2.0)

    return {
        "lat_index": int(lat_index),
        "lon_index": int(lon_index),
        "lat_step": lat_step,
        "lon_step": lon_step,
        "south": cell_south,
        "west": cell_west,
        "north": cell_north,
        "east": cell_east,
        "center_latitude": center_lat,
        "center_longitude": center_lon,
    }


def subsector_16(lat: float, lon: float, cell: Mapping[str, Any]) -> dict[str, Any]:
    south = float(cell["south"])
    west = float(cell["west"])
    lat_step = float(cell["lat_step"])
    lon_step = float(cell["lon_step"])

    rel_lat = (lat - south) / lat_step if lat_step else 0
    rel_lon = (lon - west) / lon_step if lon_step else 0

    row = max(0, min(3, int(math.floor(rel_lat * 4))))
    col = max(0, min(3, int(math.floor(rel_lon * 4))))

    index = row * 4 + col

    return {
        "subsector_index": index,
        "subsector_row": row,
        "subsector_col": col,
        "subsector_label": f"{row + 1}{col + 1}",
    }


def word_from_digest(digest: bytes, offset: int, prefix: str, wordlist: list[str] | None = None, modulo: int = 40000) -> str:
    value = int.from_bytes(digest[offset:offset + 4], "big")

    if wordlist:
        return wordlist[value % len(wordlist)]

    return f"{prefix}{value % modulo:05d}"


def zzxgcs_from_lat_lon(
    lat: float,
    lon: float,
    *,
    precision: int = 4,
    volume: str = "zzxgcs-v1",
    version: str = "1.0.0",
    language: str = "en",
    wordlist: list[str] | None = None,
    source: str = "zzx-gcs-local-deterministic",
) -> dict[str, Any]:
    lat = clamp_lat(lat)
    lon = wrap_lon(lon)

    precision_words = max(3, min(8, int(precision)))

    cell = grid_9m(lat, lon)
    sector = subsector_16(lat, lon, cell)

    basis = (
        f"{volume}|{version}|{language}|"
        f"{cell['lat_index']}|{cell['lon_index']}|"
        f"{sector['subsector_index']}"
    ).encode("utf-8")

    digest = hashlib.sha3_512(basis).digest()

    prefixes = ("a", "b", "c", "p", "land", "hint", "path", "mark")

    words = [
        word_from_digest(digest, index * 4, prefixes[index], wordlist=wordlist)
        for index in range(precision_words)
    ]

    if precision_words >= 4 and not wordlist:
        words[3] = f"p{sector['subsector_index']:02d}"

    address = "zzx://" + ".".join(words)

    return {
        "schema": SCHEMA,
        "zzxgcs": address,
        "words": words,
        "language": language,
        "volume": volume,
        "version": version,
        "precision_words": precision_words,
        "grid_meters": 3,
        "cell_area_square_meters": 9,
        "cell": cell,
        "subsector": sector,
        "center_latitude": cell["center_latitude"],
        "center_longitude": cell["center_longitude"],
        "source": source,
        "confidence": "deterministic-high" if wordlist else "synthetic-low",
        "wordlist_loaded": bool(wordlist),
        "wordlist_size": len(wordlist or []),
        "warning": "" if wordlist else "Uses deterministic synthetic ZZX-GCS tokens because no private repo wordlist was available.",
        "looked_up_at": utc_now(),
    }


def existing_zzxgcs(row: Mapping[str, Any]) -> str:
    return clean(
        first_value(
            row,
            "zzxgcs",
            "zzxgcs_data.zzxgcs",
            "zzxgcs_data.address",
            "geo.zzxgcs",
            "geoloc.zzxgcs",
            "metadata.zzxgcs",
            "metadata.zzxgcs_data.zzxgcs",
        )
    )


def resolve_zzxgcs(
    row: Mapping[str, Any],
    *,
    cache_path: Path = DEFAULT_CACHE_PATH,
    precision: int = 4,
    volume: str = "zzxgcs-v1",
    version: str = "1.0.0",
    language: str = "en",
    repo_dir: Path = DEFAULT_ZZXGCS_REPO_DIR,
    repo_url: str = DEFAULT_ZZXGCS_REPO_URL,
    repo_branch: str = "",
    wordlist_dir: Path = DEFAULT_ZZXGCS_WORDLIST_DIR,
    use_repo: bool = True,
    update_repo: bool = False,
    compact_cache: bool = False,
) -> dict[str, Any]:
    existing = existing_zzxgcs(row)

    lat, lon = row_lat_lon(row)
    lat, lon, overlay_network = overlay_coordinates(row, lat, lon)

    if existing:
        words = existing.replace("zzx://", "").split(".")
        return {
            "schema": SCHEMA,
            "zzxgcs": existing,
            "words": words,
            "language": language,
            "volume": volume,
            "version": version,
            "precision_words": len(words),
            "center_latitude": lat,
            "center_longitude": lon,
            "source": "explicit",
            "confidence": "explicit",
            "is_overlay": bool(overlay_network),
            "overlay_network": overlay_network,
            "looked_up_at": utc_now(),
        }

    if lat is None or lon is None:
        return {
            "schema": SCHEMA,
            "zzxgcs": "",
            "words": [],
            "language": language,
            "volume": volume,
            "version": version,
            "precision_words": precision,
            "center_latitude": None,
            "center_longitude": None,
            "source": "missing-coordinates",
            "confidence": "none",
            "is_overlay": bool(overlay_network),
            "overlay_network": overlay_network,
            "warning": "No latitude/longitude available for ZZX-GCS lookup.",
            "looked_up_at": utc_now(),
        }

    cache = load_cache(cache_path)
    entries = cache_entries(cache)
    key = cache_key(lat, lon, precision, volume, version, language)

    if key in entries and isinstance(entries[key], Mapping):
        cached = dict(entries[key])
        cached.setdefault("schema", SCHEMA)
        cached.setdefault("is_overlay", bool(overlay_network))
        cached.setdefault("overlay_network", overlay_network)
        cached["cache_hit"] = True
        return cached

    repo_ready = False
    wordlist: list[str] = []

    if use_repo:
        repo_ready = ensure_repo(repo_dir, repo_url=repo_url, branch=repo_branch, update=update_repo)

    if repo_ready and not overlay_network:
        repo_result = repo_encode_from_module(
            repo_dir,
            lat,
            lon,
            precision=precision,
            volume=volume,
            version=version,
            language=language,
        )

        if repo_result is not None:
            repo_result["cache_hit"] = False
            repo_result["repo_dir"] = str(repo_dir)
            repo_result["is_overlay"] = False
            repo_result["overlay_network"] = ""
            entries[key] = repo_result
            save_cache(cache_path, entries, compact=compact_cache)
            return repo_result

    if repo_ready:
        paths = discover_wordlist_paths(repo_dir, wordlist_dir, language, volume)
        wordlist = load_words_from_paths(paths)

    result = zzxgcs_from_lat_lon(
        lat,
        lon,
        precision=precision,
        volume=volume,
        version=version,
        language=language,
        wordlist=wordlist,
        source="zzxgcs-private-repo-wordlist" if wordlist else "zzx-gcs-local-deterministic",
    )

    result["cache_hit"] = False
    result["repo_ready"] = repo_ready
    result["repo_dir"] = str(repo_dir)
    result["wordlist_dir"] = str(wordlist_dir)
    result["is_overlay"] = bool(overlay_network)
    result["overlay_network"] = overlay_network

    if overlay_network:
        result["source"] = f"{overlay_network}-overlay-zzxgcs"
        result["confidence"] = "overlay-deterministic"

    entries[key] = result
    save_cache(cache_path, entries, compact=compact_cache)

    return result


def ensure_block(node: MutableMapping[str, Any], key: str) -> MutableMapping[str, Any]:
    block = node.get(key)

    if not isinstance(block, MutableMapping):
        block = {}
        node[key] = block

    return block


def enrich_node(node: MutableMapping[str, Any], context: Mapping[str, Any]) -> MutableMapping[str, Any]:
    cache_path = Path(context.get("zzxgcs_cache") or context.get("zzxgcs_cache_path") or DEFAULT_CACHE_PATH)
    precision = int(context.get("zzxgcs_precision") or context.get("precision") or 4)
    volume = str(context.get("zzxgcs_volume") or context.get("volume") or "zzxgcs-v1")
    version = str(context.get("zzxgcs_version") or context.get("version") or "1.0.0")
    language = str(context.get("zzxgcs_language") or context.get("language") or "en")
    repo_dir = Path(context.get("zzxgcs_repo_dir") or DEFAULT_ZZXGCS_REPO_DIR)
    repo_url = str(context.get("zzxgcs_repo_url") or DEFAULT_ZZXGCS_REPO_URL)
    repo_branch = str(context.get("zzxgcs_repo_branch") or "")
    wordlist_dir = Path(context.get("zzxgcs_wordlist_dir") or DEFAULT_ZZXGCS_WORDLIST_DIR)
    use_repo = bool(context.get("zzxgcs_use_repo", True))
    update_repo = bool(context.get("zzxgcs_update_repo", False))
    compact_cache = bool(context.get("compact", False))

    meta = resolve_zzxgcs(
        node,
        cache_path=cache_path,
        precision=precision,
        volume=volume,
        version=version,
        language=language,
        repo_dir=repo_dir,
        repo_url=repo_url,
        repo_branch=repo_branch,
        wordlist_dir=wordlist_dir,
        use_repo=use_repo,
        update_repo=update_repo,
        compact_cache=compact_cache,
    )

    metadata = ensure_block(node, "metadata")
    enrichment = ensure_block(node, "enrichment")

    node["zzxgcs_data"] = meta
    metadata["zzxgcs_data"] = meta

    node["zzxgcs"] = meta.get("zzxgcs", "")
    node["zzxgcs_source"] = meta.get("source", "")
    node["zzxgcs_confidence"] = meta.get("confidence", "")

    metadata["zzxgcs"] = node["zzxgcs"]
    metadata["zzxgcs_source"] = node["zzxgcs_source"]
    metadata["zzxgcs_confidence"] = node["zzxgcs_confidence"]

    if meta.get("is_overlay"):
        node["is_overlay"] = True
        node["overlay_network"] = meta.get("overlay_network", "")
        metadata["is_overlay"] = True
        metadata["overlay_network"] = meta.get("overlay_network", "")

    enrichment["zzxgcs_lookup"] = {
        "schema": SCHEMA,
        "status": "ok",
        "updated_at": utc_now(),
        "cache_path": str(cache_path),
        "repo_dir": str(repo_dir),
        "repo_enabled": use_repo,
        "source": meta.get("source", ""),
        "confidence": meta.get("confidence", ""),
        "cache_hit": bool(meta.get("cache_hit")),
    }

    return node


def enrich_nodes(nodes: Any, context: dict[str, Any] | None = None) -> Any:
    context = context or {}

    if isinstance(nodes, list):
        return [enrich_node(dict(node), context) if isinstance(node, Mapping) else node for node in nodes]

    if isinstance(nodes, Mapping):
        return {
            key: enrich_node(dict(value), context) if isinstance(value, Mapping) else value
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


def put_nodes(payload: Any, nodes: list[dict[str, Any]], context: dict[str, Any] | None = None) -> Any:
    context = context or {}

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
        output["metadata"]["zzxgcs_enriched_at"] = utc_now()
        output["metadata"]["zzxgcs_schema"] = SCHEMA
        output["metadata"]["zzxgcs_cache"] = str(context.get("zzxgcs_cache") or DEFAULT_CACHE_PATH)
        output["metadata"]["zzxgcs_volume"] = str(context.get("zzxgcs_volume") or "zzxgcs-v1")
        output["metadata"]["zzxgcs_version"] = str(context.get("zzxgcs_version") or "1.0.0")
        output["metadata"]["zzxgcs_repo_dir"] = str(context.get("zzxgcs_repo_dir") or DEFAULT_ZZXGCS_REPO_DIR)
        output["metadata"]["zzxgcs_repo_enabled"] = bool(context.get("zzxgcs_use_repo", True))

    return output


def enrich_payload(payload: Any, context: dict[str, Any] | None = None) -> Any:
    nodes = extract_nodes(payload)

    if not nodes:
        return payload

    return put_nodes(payload, enrich_nodes(nodes, context), context)


def iter_nodes(payload: Any) -> list[Mapping[str, Any]]:
    return extract_nodes(payload)


def summarize(nodes: list[Mapping[str, Any]]) -> dict[str, Any]:
    sources: dict[str, int] = {}
    confidence: dict[str, int] = {}

    resolved = 0
    repo_wordlist = 0
    repo_module = 0
    synthetic = 0
    cache_hits = 0
    overlay = 0
    tor = 0
    i2p = 0

    for node in nodes:
        data = node.get("zzxgcs_data", {})

        if not isinstance(data, Mapping):
            data = {}

        if clean(data.get("zzxgcs")) or clean(node.get("zzxgcs")):
            resolved += 1

        source = clean(data.get("source")) or "unknown"
        conf = clean(data.get("confidence")) or "unknown"

        sources[source] = sources.get(source, 0) + 1
        confidence[conf] = confidence.get(conf, 0) + 1

        if source == "zzxgcs-private-repo-wordlist":
            repo_wordlist += 1

        if source == "zzxgcs-private-repo-module":
            repo_module += 1

        if source == "zzx-gcs-local-deterministic":
            synthetic += 1

        if boolish(data.get("cache_hit")):
            cache_hits += 1

        overlay_network = clean(data.get("overlay_network")) or clean(node.get("overlay_network"))

        if boolish(data.get("is_overlay")) or boolish(node.get("is_overlay")):
            overlay += 1

        if overlay_network == "tor" or clean(node.get("network")).lower() == "tor":
            tor += 1

        if overlay_network == "i2p" or clean(node.get("network")).lower() == "i2p":
            i2p += 1

    return {
        "schema": SUMMARY_SCHEMA,
        "generated_at": utc_now(),
        "total_nodes": len(nodes),
        "resolved_zzxgcs_nodes": resolved,
        "missing_zzxgcs_nodes": max(0, len(nodes) - resolved),
        "repo_wordlist_nodes": repo_wordlist,
        "repo_module_nodes": repo_module,
        "synthetic_nodes": synthetic,
        "cache_hit_nodes": cache_hits,
        "overlay_zzxgcs_nodes": overlay,
        "tor_zzxgcs_nodes": tor,
        "i2p_zzxgcs_nodes": i2p,
        "sources": dict(sorted(sources.items(), key=lambda item: (-item[1], item[0]))),
        "confidence": dict(sorted(confidence.items(), key=lambda item: (-item[1], item[0]))),
    }


def enrich(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def process(payload: Any, context: dict[str, Any] | None = None) -> Any:
    return enrich_payload(payload, context)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Bitnodes records with ZZX-GCS grid-coordinate addresses.",
        allow_abbrev=False,
    )

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--summary", default="")
    parser.add_argument("--cache", default=str(DEFAULT_CACHE_PATH))
    parser.add_argument("--precision", type=int, default=4)
    parser.add_argument("--volume", default="zzxgcs-v1")
    parser.add_argument("--version", default="1.0.0")
    parser.add_argument("--language", default="en")
    parser.add_argument("--repo-dir", default=str(DEFAULT_ZZXGCS_REPO_DIR))
    parser.add_argument("--repo-url", default=DEFAULT_ZZXGCS_REPO_URL)
    parser.add_argument("--repo-branch", default="")
    parser.add_argument("--wordlist-dir", default=str(DEFAULT_ZZXGCS_WORDLIST_DIR))
    parser.add_argument("--no-repo", action="store_true")
    parser.add_argument("--update-repo", action="store_true")
    parser.add_argument("--compact", action="store_true")

    args = parser.parse_args()

    payload = read_json(Path(args.input), fallback={})

    enriched = enrich_payload(
        payload,
        {
            "zzxgcs_cache": args.cache,
            "zzxgcs_precision": args.precision,
            "zzxgcs_volume": args.volume,
            "zzxgcs_version": args.version,
            "zzxgcs_language": args.language,
            "zzxgcs_repo_dir": args.repo_dir,
            "zzxgcs_repo_url": args.repo_url,
            "zzxgcs_repo_branch": args.repo_branch,
            "zzxgcs_wordlist_dir": args.wordlist_dir,
            "zzxgcs_use_repo": not args.no_repo,
            "zzxgcs_update_repo": args.update_repo,
            "compact": args.compact,
        },
    )

    write_json(Path(args.output), enriched, compact=args.compact)

    if args.summary:
        write_json(Path(args.summary), summarize(iter_nodes(enriched)), compact=args.compact)

    print(f"zzx-gcs lookup enrichment complete: {len(iter_nodes(enriched))} nodes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
