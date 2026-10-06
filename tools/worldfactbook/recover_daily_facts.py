#!/usr/bin/env python3
"""Source-backed, resumable recovery of the CIA World Factbook daily facts.

The private working store retains source evidence and every competing version.
Only dated records are exported to small, public, static monthly JSON files.
Neither a Wayback capture date nor a date without a parsed article is treated as
the original publication date. `verify --strict` is the coverage gate.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

MONTHS = "January February March April May June July August September October November December".split()
DAY = re.compile(r"^(?:" + "|".join(MONTHS) + r")\s+\d{1,2},\s+\d{4}$")
WAYBACK = "https://web.archive.org"
ARCHIVE_URL = "https://www.cia.gov/the-world-factbook/daily-facts-archive/"
SOURCES = (
    ARCHIVE_URL,
    "https://www.cia.gov/the-world-factbook/",
    "https://www.cia.gov/library/publications/the-world-factbook/index.html",
    "https://www.cia.gov/library/publications/the-world-factbook/",
    "https://www.cia.gov/cia/publications/factbook/index.html",
)
USER_AGENT = "ZZX-WorldFactbook-Daily-Recovery/1.0 (archival preservation)"
MAX_CAPTURE_BYTES = 12 * 1024 * 1024


def dump(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def read(path: Path, fallback: object = None) -> object:
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else fallback


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def neat(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def iso_day(label: str) -> str:
    from datetime import datetime
    return datetime.strptime(neat(label), "%B %d, %Y").date().isoformat()


def text_lines(text: str) -> list[str]:
    return [neat(line) for line in text.replace("\f", "\n").splitlines()]


def parse_archive_text(text: str, *, max_records: int = 40) -> list[dict]:
    """Read explicit daily headings, keeping captions separate from primary text.

    A single archive snapshot normally holds thirty entries. The generous cap is
    deliberately below a whole-site navigation dump mistakenly parsed as facts.
    """
    lines = text_lines(text)
    headings = [(i, iso_day(line)) for i, line in enumerate(lines) if DAY.fullmatch(line)]
    result = []
    for number, (begin, published) in enumerate(headings[:max_records]):
        end = headings[number + 1][0] if number + 1 < len(headings) else len(lines)
        block = lines[begin + 1:end]
        while block and not block[0]:
            block.pop(0)
        if len(block) < 2 or len(block[0]) > 150:
            continue
        title = block.pop(0)
        while block and not block[0]:
            block.pop(0)
        paragraphs, paragraph = [], []
        for line in block:
            if not line:
                if paragraph:
                    paragraphs.append(neat(" ".join(paragraph)))
                    paragraph = []
                continue
            if line.lower().startswith(("the wayback machine -", "view 30-day archive", "back to top")):
                break
            paragraph.append(line)
        if paragraph:
            paragraphs.append(neat(" ".join(paragraph)))
        # Plain text pasted from the website can include a second photo caption.
        # The Fact of the Day body is the first actual paragraph, not both.
        body = paragraphs[0] if paragraphs else ""
        if len(body) >= 35 and title and not title.lower().startswith("references "):
            row = {"date": published, "title": title, "body": body}
            if len(paragraphs) > 1:
                row["associated_caption"] = paragraphs[1][:1800]
            result.append(row)
    return result


def parse_homepage_text(text: str) -> list[dict]:
    lines = text_lines(text)
    for i, line in enumerate(lines):
        if line.lower() != "fact of the day":
            continue
        sample = "\n".join(lines[i + 1:i + 75])
        rows = parse_archive_text(sample, max_records=1)
        if rows:
            return rows
    return []


class PageText(HTMLParser):
    BLOCK = {"article", "section", "div", "p", "h1", "h2", "h3", "h4", "li", "br", "header", "footer", "time"}
    SKIP = {"style", "script", "noscript", "svg", "template"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.SKIP:
            self.skip += 1
        elif not self.skip and tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        elif not self.skip and tag in self.BLOCK:
            self.parts.append("\n\n" if tag in {"p", "article", "h1", "h2", "h3", "h4"} else "\n")

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.parts.append(data)

    def text(self) -> str:
        # Don't collapse block boundaries before trying to identify date labels.
        return "\n".join(text_lines("".join(self.parts)))


def parse_html(raw: bytes, original: str) -> list[dict]:
    page = PageText()
    page.feed(raw.decode("utf-8", "replace"))
    rendered = page.text()
    if "daily-facts-archive" in original.lower():
        return parse_archive_text(rendered)
    return parse_homepage_text(rendered)


def pdf_text(path: Path) -> str:
    try:
        process = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, check=True)
        return process.stdout.decode("utf-8", "replace")
    except (FileNotFoundError, subprocess.CalledProcessError):
        try:
            from pypdf import PdfReader
            return "\n\f\n".join(page.extract_text(extraction_mode="layout") or ""
                                   for page in PdfReader(path).pages)
        except ImportError:
            try:
                import fitz
                with fitz.open(path) as book:
                    return "\n\f\n".join(page.get_text(sort=True) for page in book)
            except ImportError as exc:
                raise RuntimeError("PDF text extraction requires pdftotext, pypdf, or PyMuPDF") from exc


def source_url(pdf: str, fallback: str) -> str:
    match = re.search(r"https://web\.archive\.org/web/\d{14}/https?://[^\s]+", pdf)
    return match.group(0) if match else fallback


def record_id(row: dict) -> str:
    return digest((row["date"] + "\0" + neat(row["title"]) + "\0" + neat(row["body"])).encode("utf-8"))[:20]


def put_record(store: Path, row: dict, evidence: dict) -> bool:
    published = date.fromisoformat(row["date"])
    if not row.get("title") or len(row.get("body", "")) < 35:
        return False
    ident = record_id(row)
    target = store / "records" / published.isoformat() / f"{ident}.json"
    previous = read(target, {})
    sources = {json.dumps(item, sort_keys=True, ensure_ascii=False) for item in previous.get("evidence", [])}
    sources.add(json.dumps(evidence, sort_keys=True, ensure_ascii=False))
    payload = {
        "date": published.isoformat(), "id": ident, "title": neat(row["title"]),
        "body": neat(row["body"]), "date_basis": "explicit CIA page label",
        "evidence": [json.loads(item) for item in sorted(sources)],
    }
    if row.get("associated_caption"):
        payload["associated_caption"] = neat(row["associated_caption"])
    dump(target, payload)
    return not bool(previous)


def seed(store: Path, archive_pdf: Path, homepage_pdf: Path | None = None, transcription: Path | None = None) -> dict:
    def preserve_pdf(path: Path) -> tuple[str, str]:
        sha = digest(path.read_bytes())
        target = store / "evidence" / f"{sha}.pdf"
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            shutil.copyfile(path, target)
        return sha, str(target.relative_to(store))

    archive = pdf_text(archive_pdf)
    observed = parse_archive_text(archive)
    url = source_url(archive, "")
    archive_sha, archive_path = preserve_pdf(archive_pdf)
    evidence = {"kind": "user-supplied Wayback PDF", "snapshot_url": url,
                "pdf_sha256": archive_sha, "pdf_private_path": archive_path}
    matches, discrepancies = 0, []
    if transcription:
        by_day = {row["date"]: row for row in parse_archive_text(transcription.read_text(encoding="utf-8"))}
        for row in observed:
            other = by_day.get(row["date"])
            if other and neat(other["title"]) == neat(row["title"]) and neat(other["body"]).startswith(neat(row["body"])):
                matches += 1
                caption = neat(other["body"])[len(neat(row["body"])):].strip()
                if caption or other.get("associated_caption"):
                    row["associated_caption"] = caption or other["associated_caption"]
            else:
                discrepancies.append(row["date"])
    added = sum(put_record(store, row, evidence) for row in observed)
    if homepage_pdf:
        homepage = pdf_text(homepage_pdf)
        homepage_sha, homepage_path = preserve_pdf(homepage_pdf)
        homepage_evidence = {"kind": "user-supplied Wayback homepage PDF",
                             "snapshot_url": source_url(homepage, ""),
                             "pdf_sha256": homepage_sha, "pdf_private_path": homepage_path}
        rows = parse_homepage_text(homepage)
        added += sum(put_record(store, row, homepage_evidence) for row in rows)
    result = {"archive_records": len(observed), "crosschecked_exact": matches,
              "transcription_discrepancies": discrepancies, "new_records": added,
              "homepage_records": len(rows) if homepage_pdf else 0}
    dump(store / "seed-report.json", result)
    return result


def bootstrap(store: Path, api: Path) -> dict:
    """Initialize a private checkpoint store from already published sourced shards."""
    index = read(api / "index.json", {})
    added = 0
    for relative in index.get("months", []):
        if not re.fullmatch(r"months/\d{4}-\d{2}\.json", relative):
            raise ValueError(f"Invalid public month path: {relative}")
        for row in read(api / relative, {}).get("records", []):
            if row.get("date_basis") != "explicit CIA page label" or not row.get("evidence"):
                continue
            for evidence in row["evidence"]:
                added += put_record(store, row, evidence)
    return {"imported_new_records": added, "private_total": len(records(store))}


def fetch(url: str, timeout: int = 50) -> bytes:
    last = None
    for attempt in range(4):
        try:
            with urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=timeout) as response:
                raw = response.read(MAX_CAPTURE_BYTES + 1)
                if len(raw) > MAX_CAPTURE_BYTES:
                    raise ValueError("capture exceeds maximum input size")
                return raw
        except (HTTPError, URLError, TimeoutError) as exc:
            last = exc
            if isinstance(exc, HTTPError) and exc.code not in (408, 429, 500, 502, 503, 504):
                raise
            if attempt != 3:
                time.sleep(1.5 * 2 ** attempt)
    raise RuntimeError(f"Unable to fetch {url}: {last}")


def cdx_rows(year: int, original: str) -> list[dict]:
    params = urlencode([
        ("url", original), ("matchType", "exact"), ("from", str(year)), ("to", str(year)),
        ("output", "json"), ("fl", "timestamp,original,digest,statuscode,mimetype"),
        ("filter", "statuscode:200"), ("filter", "mimetype:text/html"),
        ("collapse", "timestamp:8"), ("limit", "500"),
    ])
    data = json.loads(fetch(WAYBACK + "/cdx/search/cdx?" + params, timeout=90))
    if not isinstance(data, list) or not data:
        return []
    header = data[0]
    if len(data) >= 501:
        raise ValueError(f"CDX result may be truncated for {original} in {year}")
    return [dict(zip(header, row)) for row in data[1:] if isinstance(row, list)]


def recover(store: Path, first_year: int, final_year: int, max_captures: int, wait: float) -> dict:
    if not 1994 <= first_year <= final_year <= 2026:
        raise ValueError("recovery year range must be within the public web era, 1994–2026")
    attempted = added = 0
    errors = []
    for year in range(final_year, first_year - 1, -1):
        for original in SOURCES:
            key = digest(original.encode())[:12]
            query = store / "cdx" / str(year) / f"{key}.json"
            try:
                rows = read(query)
                if rows is None or datetime.now(timezone.utc).timestamp() - query.stat().st_mtime >= 86400:
                    rows = cdx_rows(year, original)
                    dump(query, rows)
            except Exception as exc:
                errors.append({"year": year, "url": original, "error": str(exc)})
                continue
            for cdx in sorted(rows, key=lambda row: row.get("timestamp", ""), reverse=True):
                timestamp = str(cdx.get("timestamp", ""))
                original_url = str(cdx.get("original", ""))
                if not re.fullmatch(r"\d{14}", timestamp) or not original_url.startswith("http"):
                    continue
                capture = f"{WAYBACK}/web/{timestamp}id_/{original_url}"
                checkpoint = store / "captures" / f"{timestamp}-{digest(original_url.encode())[:12]}.json"
                failure = store / "failures" / checkpoint.name
                if checkpoint.exists():
                    continue
                prior_failure = read(failure, {})
                if prior_failure.get("retry_after", "") > datetime.now(timezone.utc).isoformat():
                    continue
                if attempted >= max_captures:
                    unresolved = [read(path) for path in (store / "failures").glob("*.json")]
                    result = {"attempted": attempted, "new_records": added, "errors": errors + unresolved,
                              "more_captures_pending": True, "first_year": first_year, "final_year": final_year}
                    dump(store / "last-run.json", result)
                    return result
                attempted += 1
                try:
                    raw = fetch(capture)
                    sha = digest(raw)
                    evidence_file = store / "raw" / str(year) / f"{timestamp}-{sha[:16]}.html.gz"
                    evidence_file.parent.mkdir(parents=True, exist_ok=True)
                    with gzip.open(evidence_file, "wb", compresslevel=6) as out:
                        out.write(raw)
                    evidence = {"kind": "Wayback HTML", "snapshot_url": capture,
                                "capture_timestamp": timestamp, "html_sha256": sha,
                                "raw_path": str(evidence_file.relative_to(store))}
                    rows_found = parse_html(raw, original_url)
                    added += sum(put_record(store, item, evidence) for item in rows_found)
                    dump(checkpoint, {"snapshot_url": capture, "records": len(rows_found),
                                      "status": "parsed" if rows_found else "no dated fact found"})
                    failure.unlink(missing_ok=True)
                except Exception as exc:
                    # Cool down one capture without blocking all older captures.
                    problem = {"snapshot_url": capture, "error": str(exc),
                               "attempts": prior_failure.get("attempts", 0) + 1,
                               "retry_after": (datetime.now(timezone.utc) + timedelta(hours=22)).isoformat()}
                    dump(failure, problem)
                    errors.append(problem)
                if wait:
                    time.sleep(wait)
    unresolved = [read(path) for path in (store / "failures").glob("*.json")]
    result = {"attempted": attempted, "new_records": added,
              "errors": list({problem.get("snapshot_url", problem.get("url", str(n))): problem
                              for n, problem in enumerate(errors + unresolved)}.values()),
              "more_captures_pending": bool(errors or unresolved),
              "first_year": first_year, "final_year": final_year}
    dump(store / "last-run.json", result)
    return result


def records(store: Path) -> list[dict]:
    result = []
    for path in sorted((store / "records").glob("????-??-??/*.json")):
        row = read(path)
        if isinstance(row, dict) and row.get("date") and row.get("body"):
            result.append(row)
    return result


def audit(store: Path) -> dict:
    rows = records(store)
    dates = sorted({row["date"] for row in rows})
    bounds = read(store / "bounds.json", {})
    first = bounds.get("first_published_date")
    final = bounds.get("last_published_date")
    first_established = bool(first in dates and bounds.get("first_source_url") and bounds.get("reviewer"))
    final_established = bool(final in dates and bounds.get("last_source_url") and bounds.get("reviewer"))
    gaps = []
    if dates:
        cursor = date.fromisoformat(first if first_established else dates[0])
        end = date.fromisoformat(final if final_established else dates[-1])
        present = set(dates)
        while cursor <= end:
            if cursor.isoformat() not in present:
                gaps.append(cursor.isoformat())
            cursor += timedelta(days=1)
    versions = {}
    for row in rows:
        versions[row["date"]] = versions.get(row["date"], 0) + 1
    between = bool(dates) and not gaps and not any(count > 1 for count in versions.values())
    last_run = read(store / "last-run.json", {})
    scan_complete = bool(last_run.get("first_year", 9999) <= 1994 and
                         last_run.get("final_year", 0) >= 2026 and
                         not last_run.get("more_captures_pending", True) and not last_run.get("errors"))
    return {"schema": "zzx-daily-audit-v1", "first_observed_date": dates[0] if dates else None,
            "latest_observed_date": dates[-1] if dates else None,
            "first_publication_date_established": first_established,
            "final_publication_date_established": final_established,
            "observed_days": len(dates), "records": len(rows),
            "missing_days_between_observations": gaps,
            "conflicting_dates": [day for day, count in versions.items() if count > 1],
            "complete_between_observations": between,
            "cdx_scan_complete": scan_complete,
            "complete_historical_run": between and first_established and final_established and scan_complete,
            "recovery_errors": last_run.get("errors", [])}


def certify_bounds(store: Path, first: str, final: str, first_url: str, final_url: str, reviewer: str) -> dict:
    seen = {row["date"] for row in records(store)}
    if first not in seen or final not in seen or first > final:
        raise ValueError("First and last publication days must already have dated source records")
    if not all(value.startswith("https://") for value in (first_url, final_url)) or not reviewer.strip():
        raise ValueError("Two HTTPS boundary citations and a reviewer name are required")
    result = {"first_published_date": first, "last_published_date": final,
              "first_source_url": first_url, "last_source_url": final_url,
              "reviewer": reviewer.strip()}
    dump(store / "bounds.json", result)
    return result


def export(store: Path, api: Path, training: Path | None = None) -> dict:
    rows = records(store)
    by_month: dict[str, list[dict]] = {}
    for row in rows:
        by_month.setdefault(row["date"][:7], []).append(row)
    days = []
    for month, group in sorted(by_month.items()):
        target = api / "months" / f"{month}.json"
        public_rows = [{key: val for key, val in row.items() if key != "associated_caption"}
                       for row in sorted(group, key=lambda item: (item["date"], item["id"]))]
        # Avoid publishing the private raw_path. A source URL and hashes suffice.
        for row in public_rows:
            for evidence in row["evidence"]:
                evidence.pop("raw_path", None)
                evidence.pop("pdf_private_path", None)
        dump(target, {"schema": "zzx-daily-facts-month-v1", "month": month, "records": public_rows})
        if target.stat().st_size > 900_000:
            target.unlink()
            raise ValueError(f"Month file exceeds 900 kB: {month}")
        counts: dict[str, int] = {}
        for row in public_rows:
            counts[row["date"]] = counts.get(row["date"], 0) + 1
        days += [{"date": day, "month": month, "versions": count}
                 for day, count in sorted(counts.items())]
    report = audit(store)
    summary = {"schema": "zzx-daily-facts-index-v1", "coverage": {
        key: report[key] for key in ("first_observed_date", "latest_observed_date", "observed_days",
                                "records", "complete_between_observations", "first_publication_date_established",
                                "final_publication_date_established")},
        "days": days, "months": [f"months/{month}.json" for month in sorted(by_month)]}
    summary["gaps"] = len(report["missing_days_between_observations"])
    summary["coverage"]["complete_historical_run"] = report["complete_historical_run"]
    dump(api / "index.json", summary)
    dump(api / "coverage.json", report)
    if training:
        training.parent.mkdir(parents=True, exist_ok=True)
        with training.open("w", encoding="utf-8", newline="\n") as output:
            for row in rows:
                if row["date"] in report["conflicting_dates"]:
                    continue
                output.write(json.dumps({"date": row["date"], "title": row["title"],
                    "text": row["body"], "provenance": row["evidence"],
                    "usage": "historical style study; verify source facts for any future continuation"},
                    ensure_ascii=False, sort_keys=True) + "\n")
    return {"months": len(by_month), "days": len(days), "records": len(rows),
            "complete_between_observations": report["complete_between_observations"]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--store", type=Path, default=Path("daily-facts-private-store"))
    commands = parser.add_subparsers(dest="command", required=True)
    seeded = commands.add_parser("seed", help="Import user-supplied archived PDF evidence")
    seeded.add_argument("--archive-pdf", required=True, type=Path)
    seeded.add_argument("--homepage-pdf", type=Path)
    seeded.add_argument("--transcription", type=Path)
    prepared = commands.add_parser("bootstrap", help="Copy public dated records into a new private store")
    prepared.add_argument("--api", type=Path, default=Path("worldfactbook/api/daily-archive"))
    fetched = commands.add_parser("recover", help="Resume newest-to-oldest Wayback capture recovery")
    fetched.add_argument("--first-year", type=int, default=1994)
    fetched.add_argument("--final-year", type=int, default=2026)
    fetched.add_argument("--max-captures", type=int, default=200)
    fetched.add_argument("--wait", type=float, default=0.25)
    outputs = commands.add_parser("export", help="Write bounded public API and private model corpus")
    outputs.add_argument("--api", type=Path, default=Path("worldfactbook/api/daily-archive"))
    outputs.add_argument("--training", type=Path)
    checked = commands.add_parser("verify", help="Backtest daily coverage without filling gaps")
    checked.add_argument("--strict", action="store_true")
    certified = commands.add_parser("certify-bounds", help="Record externally reviewed first and final CIA publication days")
    certified.add_argument("--first-date", required=True)
    certified.add_argument("--last-date", required=True)
    certified.add_argument("--first-source", required=True)
    certified.add_argument("--last-source", required=True)
    certified.add_argument("--reviewer", required=True)
    args = parser.parse_args(argv)
    if args.command == "seed":
        result = seed(args.store, args.archive_pdf, args.homepage_pdf, args.transcription)
    elif args.command == "bootstrap":
        result = bootstrap(args.store, args.api)
    elif args.command == "recover":
        result = recover(args.store, args.first_year, args.final_year, args.max_captures, args.wait)
    elif args.command == "export":
        result = export(args.store, args.api, args.training)
    elif args.command == "certify-bounds":
        result = certify_bounds(args.store, args.first_date, args.last_date,
                                args.first_source, args.last_source, args.reviewer)
    else:
        result = audit(args.store)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.command == "verify" and args.strict and not result["complete_historical_run"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
