#!/usr/bin/env python3
"""
DeadOPop discovery/backfill scanner.

Purpose:
- continuously discover newly reported failed/defunct/shutdown/scam/rug/fraud/
  collapsed cryptoassets;
- progressively backfill historical reports from Bitcoin's early era onward;
- keep an evidence/candidate queue;
- automatically promote only high-confidence candidates;
- never infer "dead" merely because an asset is non-Bitcoin or has low volume.

The scanner is intentionally conservative. Unknown/ambiguous reports stay in the
candidate queue rather than being silently converted into a fraud allegation.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import os
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

USER_AGENT = "ZZX-Labs-DeadOPop/2.0 (+https://zzx-labs.io/)"
DEFAULT_TIMEOUT = 25
MAX_FEED_ITEMS = 100
MAX_SEEN_URLS = 100_000
MAX_CANDIDATES = 20_000

ALLOWED_STATUSES = {
    "bankrupt",
    "insolvent",
    "scam",
    "rug_pull",
    "fraud",
    "collapsed",
    "abandoned",
    "shutdown",
    "dead",
    "delisted_dead",
    "protocol_failure",
    "exchange_failure",
    "zeroed_out",
}

STATUS_RULES = [
    ("rug_pull", re.compile(r"\b(rug\s*pull|exit scam|liquidity (?:was )?drained)\b", re.I)),
    ("bankrupt", re.compile(r"\b(bankrupt(?:cy)?|chapter\s*11|liquidation)\b", re.I)),
    ("insolvent", re.compile(r"\b(insolven(?:t|cy)|unable to meet withdrawals)\b", re.I)),
    ("fraud", re.compile(r"\b(fraud|fraudulent|ponzi|pyramid scheme|deceived investors)\b", re.I)),
    ("scam", re.compile(r"\b(scam|fake token|fake coin|investment scheme)\b", re.I)),
    ("shutdown", re.compile(r"\b(shut(?:s|ting)? down|shutdown|ceases? operations?|winds? down|closed permanently)\b", re.I)),
    ("collapsed", re.compile(r"\b(collapse[ds]?|death spiral|depeg(?:ged|s)?|imploded?)\b", re.I)),
    ("abandoned", re.compile(r"\b(abandoned|development ceased|no longer maintained|project ended)\b", re.I)),
    ("delisted_dead", re.compile(r"\b(delisted|removed from all exchanges)\b", re.I)),
    ("protocol_failure", re.compile(r"\b(exploit|protocol failure|infinite mint|bridge failure)\b", re.I)),
    ("exchange_failure", re.compile(r"\b(exchange failure|exchange collapse|exchange bankruptcy)\b", re.I)),
    ("zeroed_out", re.compile(r"\b(went to zero|near zero|worthless|zeroed out)\b", re.I)),
]

STRONG_FAILURE_RE = re.compile(
    r"\b("
    r"rug\s*pull|exit scam|fraud|fraudulent|ponzi|pyramid scheme|scam|"
    r"bankrupt(?:cy)?|insolven(?:t|cy)|collapse[ds]?|death spiral|"
    r"shut(?:s|ting)? down|shutdown|ceases? operations?|abandoned|"
    r"went to zero|worthless|infinite mint"
    r")\b",
    re.I,
)

CRYPTO_CONTEXT_RE = re.compile(
    r"\b("
    r"crypto(?:currency)?|token|coin|stablecoin|ico|defi|dao|protocol|"
    r"blockchain|digital asset|exchange token"
    r")\b",
    re.I,
)

MONEY_RE = re.compile(
    r"(?:(?:US)?\$|USD\s*)\s*"
    r"([0-9]+(?:\.[0-9]+)?)\s*"
    r"(trillion|billion|million|thousand|tn|bn|b|m|k)?",
    re.I,
)

SYMBOL_RE = re.compile(r"(?:\(([A-Z0-9]{2,12})\)|\$([A-Z][A-Z0-9]{1,11})\b)")

ENTITY_PATTERNS = [
    re.compile(
        r"^(.{2,70}?)\s+(?:token|coin|stablecoin|protocol|dao|project|platform)\s+"
        r"(?:collapse[ds]?|fails?|shut(?:s)? down|rug\s*pull|scam|fraud|bankrupt)",
        re.I,
    ),
    re.compile(
        r"^(.{2,70}?)\s+(?:collapse[ds]?|implodes?|depegs?|shut(?:s)? down|"
        r"files? for bankruptcy|rug\s*pull)",
        re.I,
    ),
    re.compile(
        r"\b(?:founder|founders|operator|operators|creator|creators)\s+of\s+"
        r"([A-Z][A-Za-z0-9 .&'_-]{2,60})",
        re.I,
    ),
    re.compile(
        r"\b(?:called|named)\s+([A-Z][A-Za-z0-9 .&'_-]{2,60})"
        r"\s+(?:token|coin|project|platform|scheme)",
        re.I,
    ),
]

TRAILING_NOISE_RE = re.compile(
    r"\s*[-|:]\s*(?:Reuters|Bloomberg|CoinDesk|Decrypt|Forbes|BBC|CNN|"
    r"Yahoo|Google News|SEC|DOJ|CFTC|FBI).*$",
    re.I,
)

BAD_ENTITY_WORDS = {
    "crypto",
    "cryptocurrency",
    "bitcoin",
    "blockchain",
    "investors",
    "founder",
    "founders",
    "exchange",
    "token",
    "coin",
    "stablecoin",
    "project",
    "platform",
    "scheme",
    "fraud",
    "scam",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".",
        suffix=".tmp",
        dir=str(path.parent),
        text=True,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_bytes(url: str, timeout: int = DEFAULT_TIMEOUT, retries: int = 3) -> bytes:
    last_error = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.8",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(min(8, 2 ** attempt))
    raise RuntimeError(f"fetch failed after {retries} attempts: {url}: {last_error}")


def clean_text(value: str) -> str:
    value = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    value = re.sub(r"\s+", " ", value).strip()
    return value


def domain_of(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lower().split(":")[0]
    except Exception:
        return ""


def normalize_entity(value: str) -> str:
    value = TRAILING_NOISE_RE.sub("", clean_text(value))
    value = re.sub(r"^[\"'“”‘’]+|[\"'“”‘’]+$", "", value)
    value = re.sub(
        r"^(?:the|a|an)\s+",
        "",
        value,
        flags=re.I,
    ).strip(" -:,.")
    value = re.sub(
        r"\s+(?:token|coin|stablecoin|protocol|dao|project|platform)$",
        "",
        value,
        flags=re.I,
    ).strip()
    if len(value) < 2 or len(value) > 70:
        return ""
    if value.lower() in BAD_ENTITY_WORDS:
        return ""
    if len(value.split()) > 8:
        return ""
    return value


def guess_entity(title: str) -> tuple[str, str]:
    title = clean_text(title)

    for pattern in ENTITY_PATTERNS:
        match = pattern.search(title)
        if match:
            entity = normalize_entity(match.group(1))
            if entity:
                symbol_match = SYMBOL_RE.search(title)
                symbol = ""
                if symbol_match:
                    symbol = symbol_match.group(1) or symbol_match.group(2) or ""
                return entity, symbol

    symbol_match = SYMBOL_RE.search(title)
    if symbol_match:
        symbol = symbol_match.group(1) or symbol_match.group(2) or ""
        # A symbol alone is evidence, but not enough to auto-name a new asset.
        return "", symbol

    return "", ""


def guess_status(text: str) -> str:
    for status, pattern in STATUS_RULES:
        if pattern.search(text):
            return status
    return ""


def parse_money(text: str) -> list[float]:
    out = []
    multipliers = {
        "trillion": 1_000_000_000_000,
        "tn": 1_000_000_000_000,
        "billion": 1_000_000_000,
        "bn": 1_000_000_000,
        "b": 1_000_000_000,
        "million": 1_000_000,
        "m": 1_000_000,
        "thousand": 1_000,
        "k": 1_000,
        None: 1,
        "": 1,
    }
    for match in MONEY_RE.finditer(text):
        number = float(match.group(1))
        suffix = (match.group(2) or "").lower()
        value = number * multipliers.get(suffix, 1)
        if math.isfinite(value) and value >= 1_000:
            out.append(value)
    return out


def rss_items(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    items = []

    for item in root.findall(".//item")[:MAX_FEED_ITEMS]:
        title = clean_text(item.findtext("title") or "")
        link = clean_text(item.findtext("link") or "")
        description = clean_text(item.findtext("description") or "")
        published = clean_text(
            item.findtext("pubDate")
            or item.findtext("date")
            or ""
        )

        source_node = item.find("source")
        source_name = ""
        source_url = ""
        if source_node is not None:
            source_name = clean_text(source_node.text or "")
            source_url = clean_text(source_node.attrib.get("url", ""))

        if title and link:
            items.append(
                {
                    "title": title,
                    "link": link,
                    "description": description,
                    "published_at": published,
                    "source_name": source_name,
                    "source_url": source_url,
                }
            )

    if items:
        return items

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.findall(".//atom:entry", ns)[:MAX_FEED_ITEMS]:
        title = clean_text(entry.findtext("atom:title", default="", namespaces=ns))
        summary = clean_text(
            entry.findtext("atom:summary", default="", namespaces=ns)
            or entry.findtext("atom:content", default="", namespaces=ns)
        )
        published = clean_text(
            entry.findtext("atom:published", default="", namespaces=ns)
            or entry.findtext("atom:updated", default="", namespaces=ns)
        )
        link = ""
        link_node = entry.find("atom:link", ns)
        if link_node is not None:
            link = clean_text(link_node.attrib.get("href", ""))
        if title and link:
            items.append(
                {
                    "title": title,
                    "link": link,
                    "description": summary,
                    "published_at": published,
                    "source_name": "",
                    "source_url": "",
                }
            )

    return items


def google_news_url(query: str) -> str:
    encoded = urllib.parse.quote_plus(query)
    return (
        "https://news.google.com/rss/search"
        f"?q={encoded}&hl=en-US&gl=US&ceid=US:en"
    )


def candidate_from_item(item: dict, query_spec: dict, scan_tag: str) -> dict | None:
    title = item.get("title", "")
    description = item.get("description", "")
    text = f"{title} {description}"

    status = guess_status(text)
    if not status:
        return None

    # Require either crypto terminology in the article text or a query explicitly
    # scoped to digital assets.
    if not (
        CRYPTO_CONTEXT_RE.search(text)
        or query_spec.get("crypto_scoped") is True
    ):
        return None

    entity, symbol = guess_entity(title)
    money = parse_money(text)

    article_url = item.get("link", "")
    publisher_url = item.get("source_url", "")
    publisher_domain = domain_of(publisher_url) or domain_of(article_url)

    authoritative_domains = {
        str(x).lower()
        for x in query_spec.get("authoritative_domains", [])
    }

    authoritative = bool(
        query_spec.get("authoritative")
        or any(
            publisher_domain == domain
            or publisher_domain.endswith("." + domain)
            for domain in authoritative_domains
        )
    )

    evidence_id = hashlib.sha256(
        (
            article_url
            + "\n"
            + title
            + "\n"
            + query_spec.get("query", "")
        ).encode("utf-8")
    ).hexdigest()

    return {
        "evidence_id": evidence_id,
        "discovered_at": now_iso(),
        "scan_tag": scan_tag,
        "query": query_spec.get("query", ""),
        "title": title,
        "description": description,
        "url": article_url,
        "publisher": item.get("source_name", ""),
        "publisher_url": publisher_url,
        "publisher_domain": publisher_domain,
        "published_at": item.get("published_at", ""),
        "authoritative": authoritative,
        "status_guess": status,
        "asset_name_guess": entity,
        "symbol_guess": symbol,
        "reported_loss_candidates_usd": money,
        "requires_review": not bool(entity),
    }


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:80] or "unknown"


def entity_key(candidate: dict) -> str:
    name = candidate.get("asset_name_guess", "").strip().lower()
    symbol = candidate.get("symbol_guess", "").strip().lower()
    if name:
        return "name:" + re.sub(r"[^a-z0-9]+", "", name)
    if symbol:
        return "symbol:" + symbol
    return ""


def existing_registry_index(entries: list[dict]) -> dict[str, int]:
    index = {}
    for i, entry in enumerate(entries):
        for value in (
            entry.get("id"),
            entry.get("name"),
            entry.get("symbol"),
        ):
            if not value:
                continue
            norm = re.sub(r"[^a-z0-9]+", "", str(value).lower())
            if norm:
                index[norm] = i
    return index


def merge_sources(entry: dict, group: list[dict]) -> None:
    sources = list(entry.get("sources") or [])
    seen = {
        str(item.get("url") or "")
        for item in sources
        if isinstance(item, dict)
    }
    for candidate in group:
        url = str(candidate.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        sources.append(
            {
                "url": url,
                "label": (
                    candidate.get("publisher")
                    or candidate.get("title")
                    or "DeadOPop discovery evidence"
                )[:180],
            }
        )
    entry["sources"] = sources


def choose_loss(group: list[dict]) -> float | None:
    authoritative_amounts = []
    all_amounts = []
    for candidate in group:
        amounts = [
            float(x)
            for x in candidate.get("reported_loss_candidates_usd", [])
            if isinstance(x, (int, float)) and x > 0
        ]
        all_amounts.extend(amounts)
        if candidate.get("authoritative"):
            authoritative_amounts.extend(amounts)

    pool = authoritative_amounts or all_amounts
    if not pool:
        return None

    pool = sorted(pool)
    # Conservative median avoids automatically choosing the largest headline
    # number when articles quote several unrelated dollar figures.
    mid = len(pool) // 2
    if len(pool) % 2:
        return pool[mid]
    return (pool[mid - 1] + pool[mid]) / 2


def promote_candidates(
    registry: dict,
    candidates_doc: dict,
) -> tuple[int, int]:
    entries = registry.setdefault("entries", [])
    index = existing_registry_index(entries)

    groups = defaultdict(list)
    for candidate in candidates_doc.get("candidates", []):
        if candidate.get("promoted") is True:
            continue
        key = entity_key(candidate)
        if key:
            groups[key].append(candidate)

    added = 0
    updated = 0

    for key, group in groups.items():
        domains = {
            c.get("publisher_domain")
            for c in group
            if c.get("publisher_domain")
        }
        authoritative = any(c.get("authoritative") for c in group)
        strong = any(
            STRONG_FAILURE_RE.search(
                (c.get("title") or "")
                + " "
                + (c.get("description") or "")
            )
            for c in group
        )

        if not strong:
            continue

        # Automatic promotion threshold:
        # - one authoritative regulator/law-enforcement source, OR
        # - at least two independent publisher domains.
        if not (authoritative or len(domains) >= 2):
            continue

        representative = sorted(
            group,
            key=lambda c: (
                0 if c.get("authoritative") else 1,
                c.get("discovered_at", ""),
            ),
        )[0]

        name = representative.get("asset_name_guess", "").strip()
        symbol = representative.get("symbol_guess", "").strip()
        if not name:
            continue

        norm_name = re.sub(r"[^a-z0-9]+", "", name.lower())
        norm_symbol = re.sub(r"[^a-z0-9]+", "", symbol.lower())
        existing_i = index.get(norm_name)
        if existing_i is None and norm_symbol:
            existing_i = index.get(norm_symbol)

        status_votes = defaultdict(int)
        for candidate in group:
            status = candidate.get("status_guess")
            if status in ALLOWED_STATUSES:
                status_votes[status] += 1
        status = max(status_votes, key=status_votes.get)
        loss = choose_loss(group)

        if existing_i is not None:
            entry = entries[existing_i]
            merge_sources(entry, group)
            entry["last_evidence_at"] = now_iso()
            entry.setdefault("discovered_at", representative.get("discovered_at", ""))
            if not entry.get("estimated_value_lost_usd") and loss:
                entry["estimated_value_lost_usd"] = round(loss, 2)
                entry["loss_method"] = "reported_discovery_loss_estimate"
            updated += 1
        else:
            confidence = 0.85 if authoritative else 0.70
            entry = {
                "id": slugify(name),
                "symbol": symbol,
                "name": name,
                "status": status,
                "failure_date": "",
                "discovered_at": representative.get("discovered_at", ""),
                "last_evidence_at": now_iso(),
                "failure_reason": representative.get("title", ""),
                "peak_market_cap_usd": None,
                "terminal_market_cap_usd": None,
                "estimated_value_lost_usd": (
                    round(loss, 2) if loss else None
                ),
                "loss_method": (
                    "reported_discovery_loss_estimate"
                    if loss
                    else "pending_quantification"
                ),
                "confidence": confidence,
                "sources": [],
                "notes": (
                    "Automatically promoted by DeadOPop discovery after "
                    "meeting authoritative/multi-source evidence threshold. "
                    "Loss remains pending if no defensible amount was extracted."
                ),
            }
            merge_sources(entry, group)
            entries.append(entry)
            existing_i = len(entries) - 1
            index[norm_name] = existing_i
            if norm_symbol:
                index[norm_symbol] = existing_i
            added += 1

        for candidate in group:
            candidate["promoted"] = True
            candidate["promoted_at"] = now_iso()
            candidate["registry_id"] = entries[existing_i]["id"]

    registry["updated_at"] = now_iso()
    return added, updated


def scan_query(query_spec: dict, query: str, scan_tag: str) -> list[dict]:
    xml_bytes = fetch_bytes(google_news_url(query))
    out = []
    for item in rss_items(xml_bytes):
        candidate = candidate_from_item(item, query_spec, scan_tag)
        if candidate:
            out.append(candidate)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", type=Path, required=True)
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument(
        "--mode",
        choices=("current", "backfill"),
        default="current",
    )
    parser.add_argument("--start-year", type=int, default=2009)
    parser.add_argument("--end-year", type=int, default=0)
    parser.add_argument("--rolling-backfill", action="store_true")
    parser.add_argument("--promote", action="store_true")
    args = parser.parse_args()

    registry = load_json(args.registry, {"entries": []})
    candidates_doc = load_json(
        args.candidates,
        {"schema": "zzx-deadopop-candidates-v1", "candidates": []},
    )
    state = load_json(
        args.state,
        {
            "schema": "zzx-deadopop-scan-state-v1",
            "seen_evidence_ids": [],
            "backfill_year": args.start_year,
        },
    )
    sources = load_json(args.sources, {})

    if not isinstance(registry, dict) or not isinstance(registry.get("entries"), list):
        raise SystemExit("registry must be an object with an entries array")

    seen = set(state.get("seen_evidence_ids") or [])
    discovered = []

    query_specs = list(sources.get("google_news_queries") or [])
    if not query_specs:
        raise SystemExit("sources file contains no google_news_queries")

    current_year = datetime.now(timezone.utc).year
    end_year = args.end_year or current_year

    jobs = []

    if args.mode == "current":
        lookback = str(sources.get("current_lookback", "7d"))
        for spec in query_specs:
            base = str(spec.get("query") or "").strip()
            if base:
                jobs.append((spec, f"{base} when:{lookback}", "current"))

        if args.rolling_backfill:
            year = int(state.get("backfill_year") or args.start_year)
            if year < args.start_year or year > end_year:
                year = args.start_year

            for spec in query_specs:
                base = str(spec.get("query") or "").strip()
                if base:
                    historical_query = (
                        f"{base} after:{year}-01-01 "
                        f"before:{year + 1}-01-01"
                    )
                    jobs.append(
                        (spec, historical_query, f"backfill:{year}")
                    )

            state["backfill_year"] = (
                args.start_year if year >= end_year else year + 1
            )

    else:
        for year in range(args.start_year, end_year + 1):
            for spec in query_specs:
                base = str(spec.get("query") or "").strip()
                if base:
                    historical_query = (
                        f"{base} after:{year}-01-01 "
                        f"before:{year + 1}-01-01"
                    )
                    jobs.append(
                        (spec, historical_query, f"backfill:{year}")
                    )

    source_errors = []

    for spec, query, scan_tag in jobs:
        try:
            for candidate in scan_query(spec, query, scan_tag):
                evidence_id = candidate["evidence_id"]
                if evidence_id in seen:
                    continue
                seen.add(evidence_id)
                discovered.append(candidate)
        except Exception as exc:
            source_errors.append(
                {
                    "query": query,
                    "scan_tag": scan_tag,
                    "error": str(exc),
                }
            )

    candidates = list(candidates_doc.get("candidates") or [])
    candidates.extend(discovered)

    # Keep promoted items plus the most recent unpromoted items. This is a
    # bounded working queue, not an unbounded web archive.
    candidates = candidates[-MAX_CANDIDATES:]
    candidates_doc["candidates"] = candidates
    candidates_doc["updated_at"] = now_iso()

    added = updated = 0
    if args.promote:
        added, updated = promote_candidates(
            registry,
            candidates_doc,
        )

    # Recompute registry summary without inventing values for unquantified assets.
    entries = registry.get("entries", [])
    valued = [
        e for e in entries
        if isinstance(e.get("estimated_value_lost_usd"), (int, float))
        and math.isfinite(float(e["estimated_value_lost_usd"]))
        and float(e["estimated_value_lost_usd"]) > 0
    ]
    registry["summary"] = {
        "entry_count": len(entries),
        "valued_entry_count": len(valued),
        "unvalued_entry_count": len(entries) - len(valued),
        "combined_estimated_value_lost_usd": round(
            sum(float(e["estimated_value_lost_usd"]) for e in valued),
            2,
        ),
        "bitcoin_excluded": True,
    }

    state["last_scan_at"] = now_iso()
    state["last_scan_mode"] = args.mode
    state["last_discovered_count"] = len(discovered)
    state["last_promoted_added"] = added
    state["last_promoted_updated"] = updated
    state["source_errors"] = source_errors[-100:]
    state["seen_evidence_ids"] = list(seen)[-MAX_SEEN_URLS:]

    atomic_json(args.registry, registry)
    atomic_json(args.candidates, candidates_doc)
    atomic_json(args.state, state)

    print(
        "DeadOPop scan complete:",
        f"queries={len(jobs)}",
        f"discovered={len(discovered)}",
        f"promoted_new={added}",
        f"updated_existing={updated}",
        f"registry_entries={len(entries)}",
        f"valued={len(valued)}",
        f"source_errors={len(source_errors)}",
    )


if __name__ == "__main__":
    main()
