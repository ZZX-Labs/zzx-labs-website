#!/usr/bin/env python3
"""Recover legacy CIA World Factbook web features from Wayback captures.

This collector is deliberately separate from edition/book ingestion.  It indexes
historical World Leaders / Heads of State material, Fact of the Day, Image of the
Day, and other legacy Factbook portal pages without making the core edition crawl
wait for website archaeology.

Only recovered source text/metadata is emitted.  Missing captures remain missing;
no facts, leaders, dates, captions, or credits are synthesized.
"""
from __future__ import annotations

import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

UA = "ZZX-WorldFactbook-Legacy/1.0 (+https://zzx-labs.io/)"

HOMEPAGE_PATTERNS = (
    "www.cia.gov/cia/publications/factbook/index.html",
    "www.cia.gov/library/publications/the-world-factbook/index.html",
    "www.cia.gov/the-world-factbook/",
)
LEADER_PATTERNS = (
    "www.cia.gov/library/publications/world-leaders-1/*",
    "www.cia.gov/resources/world-leaders/*",
    "www.cia.gov/the-world-factbook/references/world-leaders/*",
)
LEGACY_PAGE_PATTERNS = (
    ("rank-order", "www.cia.gov/library/publications/the-world-factbook/rankorder/*"),
    ("appendix", "www.cia.gov/library/publications/the-world-factbook/appendix/*"),
    ("reference", "www.cia.gov/library/publications/the-world-factbook/docs/*"),
    ("maps", "www.cia.gov/library/publications/the-world-factbook/graphics/maps/*"),
    ("flags", "www.cia.gov/library/publications/the-world-factbook/graphics/flags/*"),
    ("graphics", "www.cia.gov/library/publications/the-world-factbook/graphics/*"),
    ("one-page-summary", "www.cia.gov/library/publications/resources/the-world-factbook/docs/one_page_summaries/*"),
    ("maps", "www.cia.gov/the-world-factbook/maps/*"),
    ("reference", "www.cia.gov/the-world-factbook/references/*"),
    ("field", "www.cia.gov/the-world-factbook/field/*"),
    ("about-archive", "www.cia.gov/the-world-factbook/about/archives/*"),
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def request_bytes(url: str, *, timeout: int = 60, attempts: int = 4) -> bytes:
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ConnectionError) as exc:
            last = exc
            if isinstance(exc, urllib.error.HTTPError) and exc.code not in {408, 425, 429, 500, 502, 503, 504}:
                raise
            if attempt + 1 >= attempts:
                raise
            time.sleep(min(8.0, 0.75 * (2 ** attempt)))
    raise RuntimeError(str(last or "request failed"))


def request_json(url: str, *, timeout: int = 60) -> object:
    return json.loads(request_bytes(url, timeout=timeout).decode("utf-8", "replace"))


def cdx(pattern: str, start_year: int, end_year: int, limit: int) -> list[dict]:
    params = urllib.parse.urlencode([
        ("url", pattern), ("from", str(start_year)), ("to", str(end_year)),
        ("output", "json"), ("filter", "statuscode:200"), ("filter", "mimetype:text/html"),
        ("collapse", "digest"), ("fl", "timestamp,original,digest,statuscode,mimetype"),
        ("limit", str(max(1, limit))),
    ])
    rows = request_json("https://web.archive.org/cdx/search/cdx?" + params, timeout=90)
    if not isinstance(rows, list) or len(rows) < 2:
        return []
    headers = rows[0]
    out: list[dict] = []
    for row in rows[1:]:
        if not isinstance(row, list):
            continue
        rec = dict(zip(headers, row))
        ts = str(rec.get("timestamp") or "")
        original = str(rec.get("original") or "")
        if len(ts) < 8 or not original:
            continue
        rec["snapshot_url"] = f"https://web.archive.org/web/{ts}id_/{original}"
        rec["date"] = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
        out.append(rec)
    return out


class PageParser(HTMLParser):
    BLOCK = {"p", "div", "section", "article", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "br", "dt", "dd"}
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.images: list[dict] = []
        self.links: list[dict] = []
        self.skip = 0
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        t = tag.lower(); a = {k.lower(): (v or "") for k, v in attrs}
        if t in {"script", "style", "noscript", "svg"}:
            self.skip += 1; return
        if self.skip: return
        if t in self.BLOCK: self.parts.append("\n")
        if t == "img":
            self.images.append({"src": a.get("src", ""), "alt": a.get("alt", ""), "title": a.get("title", "")})
        if t == "a" and a.get("href"):
            self.links.append({"href": a["href"], "title": a.get("title", "")})
    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        if t in {"script", "style", "noscript", "svg"} and self.skip:
            self.skip -= 1; return
        if not self.skip and t in self.BLOCK: self.parts.append("\n")
    def handle_data(self, data: str) -> None:
        if not self.skip: self.parts.append(data)
    def text(self) -> str:
        raw = html.unescape("".join(self.parts)).replace("\r", "")
        return "\n".join(re.sub(r"\s+", " ", x).strip() for x in raw.splitlines() if re.sub(r"\s+", " ", x).strip())


def parse_page(raw: bytes) -> tuple[str, list[dict], list[dict]]:
    p = PageParser(); p.feed(raw.decode("utf-8", "replace")); return p.text(), p.images, p.links


def labeled_block(text: str, label: str, max_chars: int = 1400) -> str:
    lines = text.splitlines()
    label_re = re.compile(label, re.I)
    for i, line in enumerate(lines):
        if not label_re.search(line):
            continue
        collected: list[str] = []
        for candidate in lines[i + 1:i + 16]:
            if len(candidate) < 3: continue
            if re.match(r"^(?:Image|Fact) of the Day\b", candidate, re.I) and collected: break
            if re.match(r"^[A-Z][A-Z /&-]{4,}$", candidate) and collected: break
            collected.append(candidate)
            if len(" ".join(collected)) >= max_chars: break
        value = " ".join(collected).strip()
        if value: return value[:max_chars]
    return ""


def resolve_url(base: str, src: str, timestamp: str) -> str:
    if not src: return ""
    absolute = urllib.parse.urljoin(base, src)
    if absolute.startswith("https://web.archive.org/web/"):
        return absolute
    return f"https://web.archive.org/web/{timestamp}id_/{absolute}"


def extract_homepage_record(rec: dict, raw: bytes) -> tuple[dict | None, dict | None]:
    text, images, _ = parse_page(raw)
    fact = labeled_block(text, r"\bFact of the Day\b", 1800)
    image_caption = labeled_block(text, r"\bImage of the Day\b", 900)
    image = None
    for row in images:
        hay = " ".join((row.get("alt", ""), row.get("title", ""))).lower()
        if "image of the day" in hay or (image_caption and row.get("alt")):
            image = row; break
    ts = str(rec.get("timestamp") or "")
    source = str(rec.get("original") or "")
    common = {"captured_at": ts, "date": rec.get("date"), "source_url": source, "snapshot_url": rec.get("snapshot_url"), "digest": rec.get("digest", "")}
    fact_row = ({**common, "fact": fact} if fact else None)
    image_row = None
    if image_caption or image:
        image = image or {}
        image_row = {**common, "caption": image_caption or image.get("alt", ""), "alt": image.get("alt", ""), "image_url": resolve_url(source, image.get("src", ""), ts)}
    return fact_row, image_row


def country_names(path: Path) -> list[str]:
    if not path.is_file(): return []
    data = json.loads(path.read_text(encoding="utf-8")); rows = data.get("countries") if isinstance(data, dict) else data
    names = []
    for row in rows or []:
        if not isinstance(row, dict): continue
        name = str(row.get("countryName") or row.get("name") or "").strip()
        if name: names.append(name)
    return sorted(set(names), key=len, reverse=True)


def extract_leader_blocks(text: str, names: list[str], rec: dict) -> list[dict]:
    lines = text.splitlines(); normalized = {n.lower(): n for n in names}; out = []
    for i, line in enumerate(lines):
        key = re.sub(r"\s+", " ", line.strip()).lower().rstrip(":")
        country = normalized.get(key)
        if not country: continue
        block: list[str] = []
        for x in lines[i + 1:i + 36]:
            xkey = re.sub(r"\s+", " ", x.strip()).lower().rstrip(":")
            if xkey in normalized and block: break
            block.append(x)
        body = "\n".join(block).strip()
        if len(body) < 8: continue
        out.append({"country": country, "captured_at": rec.get("timestamp"), "date": rec.get("date"), "text": body[:8000], "source_url": rec.get("original"), "snapshot_url": rec.get("snapshot_url"), "digest": rec.get("digest", "")})
    return out


def write_json(path: Path, obj: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def self_test() -> None:
    sample = b'''<html><body><h2>Fact of the Day</h2><p>Sample recovered fact.</p><h2>Image of the Day</h2><p>Sample caption.</p><img alt="Image of the Day: sample" src="/sample.jpg"></body></html>'''
    rec = {"timestamp": "20140506120000", "date": "2014-05-06", "original": "https://www.cia.gov/library/publications/the-world-factbook/index.html", "snapshot_url": "x", "digest": "d"}
    fact, image = extract_homepage_record(rec, sample)
    assert fact and "Sample recovered fact" in fact["fact"]
    assert image and image["image_url"].endswith("/sample.jpg")
    leaders = extract_leader_blocks("France\nPresident Example\nGermany\nChancellor Example", ["France", "Germany"], rec)
    assert len(leaders) == 2
    print("legacy feature self-test passed")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=".")
    ap.add_argument("--api-root", default="worldfactbook/api")
    ap.add_argument("--country-registry", default="__partials/widgets/global-power-grid/data/countries.json")
    ap.add_argument("--start-year", type=int, default=2000)
    ap.add_argument("--end-year", type=int, default=datetime.now(timezone.utc).year)
    ap.add_argument("--max-homepage-captures", type=int, default=6000)
    ap.add_argument("--max-leader-captures", type=int, default=4000)
    ap.add_argument("--max-feature-pages", type=int, default=2500)
    ap.add_argument("--sleep", type=float, default=0.08)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test: self_test(); return 0
    if args.start_year < 1996 or args.start_year > args.end_year:
        raise SystemExit("legacy web-feature range must be 1996 or later")

    repo = Path(args.repo_root).resolve(); api = repo / args.api_root
    names = country_names(repo / args.country_registry)
    facts: list[dict] = []; images: list[dict] = []; leaders: list[dict] = []; features: list[dict] = []; failures: list[dict] = []

    # Incremental by construction: every bounded year-window job merges the
    # records already committed by previous windows.  This makes a 2000-present
    # preservation run resumable instead of a single multi-hour transaction.
    def existing(rel: str, key: str) -> list[dict]:
        path = api / rel
        if not path.is_file(): return []
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            rows = payload.get(key) or payload.get("records") or []
            return [r for r in rows if isinstance(r, dict)]
        except Exception:
            return []
    facts.extend(existing("facts-of-the-day/index.json", "facts"))
    images.extend(existing("images-of-the-day/index.json", "images"))
    leaders.extend(existing("leaders/index.json", "records"))
    features.extend(existing("legacy-features/index.json", "records"))

    # Homepages are the best evidence for the daily rotating features.
    homepage_rows: list[dict] = []
    per_pattern = max(1, args.max_homepage_captures // len(HOMEPAGE_PATTERNS))
    for pattern in HOMEPAGE_PATTERNS:
        try: homepage_rows.extend(cdx(pattern, args.start_year, args.end_year, per_pattern))
        except Exception as exc: failures.append({"feature": "homepage", "pattern": pattern, "error": str(exc)})
    homepage_rows = list({(r.get("timestamp"), r.get("original"), r.get("digest")): r for r in homepage_rows}.values())
    for rec in sorted(homepage_rows, key=lambda r: str(r.get("timestamp"))):
        try:
            raw = request_bytes(str(rec["snapshot_url"]), timeout=75)
            fact, image = extract_homepage_record(rec, raw)
            if fact: facts.append(fact)
            if image: images.append(image)
        except Exception as exc:
            failures.append({"feature": "homepage", "snapshot_url": rec.get("snapshot_url"), "error": str(exc)})
        time.sleep(args.sleep)

    leader_rows: list[dict] = []
    per_pattern = max(1, args.max_leader_captures // len(LEADER_PATTERNS))
    for pattern in LEADER_PATTERNS:
        try: leader_rows.extend(cdx(pattern, args.start_year, args.end_year, per_pattern))
        except Exception as exc: failures.append({"feature": "leaders", "pattern": pattern, "error": str(exc)})
    leader_rows = list({(r.get("timestamp"), r.get("original"), r.get("digest")): r for r in leader_rows}.values())
    for rec in sorted(leader_rows, key=lambda r: str(r.get("timestamp"))):
        try:
            text, _, _ = parse_page(request_bytes(str(rec["snapshot_url"]), timeout=75))
            blocks = extract_leader_blocks(text, names, rec)
            if blocks:
                leaders.extend(blocks)
            elif len(text) >= 40:
                leaders.append({"country": "", "captured_at": rec.get("timestamp"), "date": rec.get("date"), "text": text[:12000], "source_url": rec.get("original"), "snapshot_url": rec.get("snapshot_url"), "digest": rec.get("digest", ""), "unresolved": True})
        except Exception as exc:
            failures.append({"feature": "leaders", "snapshot_url": rec.get("snapshot_url"), "error": str(exc)})
        time.sleep(args.sleep)

    per_pattern = max(1, args.max_feature_pages // len(LEGACY_PAGE_PATTERNS))
    for feature_type, pattern in LEGACY_PAGE_PATTERNS:
        try:
            rows = cdx(pattern, args.start_year, args.end_year, per_pattern)
            for r in rows:
                features.append({"feature_type": feature_type, "captured_at": r.get("timestamp"), "date": r.get("date"), "source_url": r.get("original"), "snapshot_url": r.get("snapshot_url"), "digest": r.get("digest", "")})
        except Exception as exc:
            failures.append({"feature": feature_type, "pattern": pattern, "error": str(exc)})

    facts = list({(r.get("date"), hashlib.sha256(str(r.get("fact", "")).encode()).hexdigest()): r for r in facts}.values())
    images = list({(r.get("date"), r.get("image_url"), r.get("caption")): r for r in images}.values())
    leaders = list({(r.get("captured_at"), r.get("country"), hashlib.sha256(str(r.get("text", "")).encode()).hexdigest()): r for r in leaders}.values())
    features = list({(r.get("feature_type"), r.get("captured_at"), r.get("source_url")): r for r in features}.values())

    generated = now_iso()
    dates = [str(r.get("date") or "") for r in facts + images + leaders + features if str(r.get("date") or "")[:4].isdigit()]
    observed_years = [int(d[:4]) for d in dates] + [args.start_year, args.end_year]
    coverage_start, coverage_end = min(observed_years), max(observed_years)
    write_json(api / "facts-of-the-day" / "index.json", {"schema": "zzx-worldfactbook-facts-of-the-day-v1", "generated_at": generated, "start_year": coverage_start, "end_year": coverage_end, "record_count": len(facts), "facts": sorted(facts, key=lambda r: (str(r.get("date")), str(r.get("captured_at"))))})
    write_json(api / "images-of-the-day" / "index.json", {"schema": "zzx-worldfactbook-images-of-the-day-v1", "generated_at": generated, "start_year": coverage_start, "end_year": coverage_end, "record_count": len(images), "images": sorted(images, key=lambda r: (str(r.get("date")), str(r.get("captured_at"))))})
    write_json(api / "leaders" / "index.json", {"schema": "zzx-worldfactbook-leaders-v1", "generated_at": generated, "start_year": coverage_start, "end_year": coverage_end, "record_count": len(leaders), "records": sorted(leaders, key=lambda r: (str(r.get("date")), str(r.get("country"))))})
    write_json(api / "legacy-features" / "index.json", {"schema": "zzx-worldfactbook-legacy-features-v1", "generated_at": generated, "start_year": coverage_start, "end_year": coverage_end, "record_count": len(features), "records": sorted(features, key=lambda r: (str(r.get("feature_type")), str(r.get("captured_at"))))})
    write_json(api / "legacy-features" / "crawl-report.json", {"schema": "zzx-worldfactbook-legacy-feature-report-v1", "generated_at": generated, "facts": len(facts), "images": len(images), "leaders": len(leaders), "feature_pages": len(features), "failures": failures})
    print(f"legacy features: facts={len(facts)} images={len(images)} leaders={len(leaders)} pages={len(features)} failures={len(failures)}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
