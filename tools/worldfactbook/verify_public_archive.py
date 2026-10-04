#!/usr/bin/env python3
"""Verify a GitHub Pages country JSON export with private SQL/media withheld.

Run the stricter verify_country_archive.py on the complete local audit tree
before creating this public-only package. A signed edition review is required
before any year may be marked complete in either tree.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path


def json_file(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def within(root: Path, relative: str) -> Path:
    path=(root/relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f"Archive path escapes root: {relative}")
    return path


def verify(repo: Path, update_portal: bool=False, allow_absent: bool=False):
    world=repo/"worldfactbook"
    archive=world/"api/country-archive"
    index_path=archive/"index.json"
    if not index_path.is_file():
        if not allow_absent:
            raise FileNotFoundError(f"Public country archive index is missing: {index_path}")
        # An export in progress must never be treated as a clean, absent archive.
        if archive.exists() and any(path.is_file() for path in archive.rglob("*")):
            raise FileNotFoundError(f"Public country archive has files but no index: {index_path}")
        return {"archive_status":"pending", "country_years":0,
                "populated_years":0, "complete_years":[]}
    index=json_file(index_path)
    assert (index["start_year"],index["end_year"])==(1962,2027)
    country_years={}
    for country in index["countries"]:
        code=country["code"]
        for entry in country["years"]:
            key=(entry["year"],code)
            if key in country_years:raise ValueError(f"Duplicate country/year {key}")
            country_years[key]=entry
    by_year={}
    for (year,code),entry in sorted(country_years.items()):
        path=within(world,entry["path"])
        country=json_file(path)
        if country["country"]!=code or country["year"]!=year:
            raise ValueError(f"Wrong identity in {path}")
        count=0
        for part in country["parts"]:
            shard=within(world,part["path"])
            raw=shard.read_bytes()
            if (len(raw)!=part["bytes"] or sha256(raw).hexdigest()!=part["sha256"] or
                    len(raw)>512_000):
                raise ValueError(f"Bad JSON shard: {shard}")
            obj=json.loads(raw)
            if obj["country"]!=code or obj["edition_year"]!=year:
                raise ValueError(f"Wrong identity in {shard}")
            if len(obj["fields"])!=part["fields"]:
                raise ValueError(f"Wrong field count in {shard}")
            count+=len(obj["fields"])
        if count!=entry["fields"] or count!=country["fields"]:
            raise ValueError(f"Country fields differ: {year}/{code}")
        for asset in country["media"]:
            path=within(world,asset["path"])
            if not all(asset.get(k) for k in ("rights","kind","locator")):
                raise ValueError(f"Unlabeled media in {year}/{code}")
            if asset["rights"].lower()=="source review required" and path.exists():
                raise ValueError(f"Unreviewed media published: {path}")
        by_year[year]=by_year.get(year,0)+count
    statuses={}
    for row in index["years"]:
        year=row["year"]
        manifest=json_file(within(world,row["path"]))
        if manifest["status"]!=row["status"] or row["fields"]!=by_year.get(year,0):
            raise ValueError(f"Edition count/status differs: {year}")
        if row["status"]=="complete":
            source=manifest["source"]
            approval=world/"manual/reviews"/f"{year}.json"
            if not approval.is_file():raise ValueError(f"Year {year}: missing signed review")
            review=json_file(approval)
            if (manifest["holds"] or manifest["issues"] or
                manifest["media_accounted"]!=manifest["media_expected"] or
                review.get("source_sha256")!=source["id"] or
                review.get("digest")!=manifest["extraction_digest"] or
                review.get("verified_fields")!=by_year[year] or
                review.get("verified_countries")!=source["country_count"] or
                review.get("reviewed_all_pages_and_media") is not True or
                (manifest["media_expected"] and review.get("media_rights_cleared") is not True)):
                raise ValueError(f"Year {year}: incomplete source review")
        statuses[year]=row["status"]
    portal=world/"api/portal-index.json"
    if update_portal and portal.is_file():
        obj=json_file(portal)
        for row in obj.get("editions",[]):
            year=int(row["year"])
            if year in statuses:
                row["status"]=statuses[year]
                row["country_archive_path"]=f"api/country-archive/editions/{year}.json"
        temporary=portal.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        temporary.replace(portal)
    return {"archive_status":"validated", "country_years":len(country_years),
        "populated_years":sum(bool(v) for v in by_year.values()),
        "complete_years":[y for y,s in statuses.items() if s=="complete"]}


if __name__=="__main__":
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo",type=Path,default=Path("."))
    ap.add_argument("--update-portal",action="store_true")
    ap.add_argument("--allow-absent",action="store_true",
                    help="Report a not-yet-exported archive as pending; reject partial exports")
    args=ap.parse_args()
    print(json.dumps(verify(args.repo,args.update_portal,args.allow_absent),indent=2))
