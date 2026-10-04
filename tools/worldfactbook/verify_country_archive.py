#!/usr/bin/env python3
"""Validate country shards before promoting a reviewed edition in the portal."""
from __future__ import annotations

import argparse
import gzip
from hashlib import sha256
import json
from pathlib import Path


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def safe_path(root,relative):
    path=(root/relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f"Path escaped archive: {relative}")
    if not path.is_file():
        raise ValueError(f"Missing shard: {relative}")
    return path


def verify(root:Path,update=False):
    world=root/"worldfactbook"
    api=world/"api"/"country-archive"
    index=read_json(api/"index.json")
    portal_path=world/"api"/"portal-index.json"
    portal=read_json(portal_path) if portal_path.is_file() else None
    by_year={int(row["year"]):row for row in (portal or {}).get("editions",[])}
    checked=[]
    for row in index["years"]:
        year=int(row["year"])
        manifest=read_json(safe_path(world,row["path"]))
        if manifest["status"]!=row["status"]:
            raise ValueError(f"Year {year}: index/edition status mismatch")
        selected=manifest.get("source")
        if not selected:
            if row["status"]!="missing":raise ValueError(f"Year {year}: missing source")
            continue
        countries=[country for country in index["countries"]
                   if any(int(item["year"])==year for item in country["years"])]
        total_fields=total_media=0
        for country in countries:
            entry=next(item for item in country["years"] if int(item["year"])==year)
            country_index=read_json(safe_path(world,entry["path"]))
            if country_index["source"]["id"]!=selected["id"]:
                raise ValueError(f"Year {year}: source variant mismatch for {country['code']}")
            count=0
            for part in country_index["parts"]:
                path=safe_path(world,part["path"])
                data=path.read_bytes()
                if len(data)!=part["bytes"] or sha256(data).hexdigest()!=part["sha256"]:
                    raise ValueError(f"Year {year}: bad JSON shard {part['path']}")
                fields=json.loads(data)["fields"]
                if len(fields)!=part["fields"]:raise ValueError(f"Year {year}: field count mismatch")
                count+=len(fields)
            if count!=entry["fields"] or count!=country_index["fields"]:
                raise ValueError(f"Year {year}: country field count mismatch")
            sql_count=0
            for part in country_index["sql_parts"]:
                path=safe_path(world,part["path"])
                data=path.read_bytes()
                if len(data)!=part["bytes"] or sha256(data).hexdigest()!=part["sha256"]:
                    raise ValueError(f"Year {year}: bad MariaDB shard {part['path']}")
                with gzip.open(path,"rt",encoding="utf-8") as fh:
                    lines=fh.read()
                sql_count+=lines.count("REPLACE INTO factbook_fields VALUES(")
            if sql_count!=count:
                raise ValueError(f"Year {year}: SQL/JSON field mismatch for {country['code']}")
            for media in country_index["media"]:
                safe_path(world,media["path"])
            total_fields+=count
            total_media+=len(country_index["media"])
        if total_fields!=selected["field_count"]:
            raise ValueError(f"Year {year}: expected {selected['field_count']}, found {total_fields}")
        if row["status"]=="complete":
            review=root/"worldfactbook"/"manual"/"reviews"/f"{year}.json"
            if not review.is_file():raise ValueError(f"Year {year}: review signature absent")
            approval=read_json(review)
            expected=manifest.get("media_expected") or 0
            if (manifest["holds"] or manifest["issues"] or
                manifest["media_accounted"]!=expected or
                approval.get("digest")!=manifest["extraction_digest"] or
                approval.get("source_sha256")!=selected["id"] or
                approval.get("verified_fields")!=total_fields or
                approval.get("verified_countries")!=selected["country_count"] or
                approval.get("reviewed_all_pages_and_media") is not True or
                (expected and approval.get("media_rights_cleared") is not True)):
                raise ValueError(f"Year {year}: reviewed 1:1 coverage check failed")
        if year in by_year:
            existing=by_year[year]
            existing["status"]="complete" if row["status"]=="complete" else (
                "partial" if existing.get("chunks",0) or total_fields else "missing")
            existing["country_archive_path"]=row["path"]
        checked.append({"year":year,"status":row["status"],"countries":len(countries),
                        "fields":total_fields,"media":total_media})
    if update and portal:
        tmp=portal_path.with_name(portal_path.name+".tmp")
        tmp.write_text(json.dumps(portal,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        tmp.replace(portal_path)
    return checked


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--repo",type=Path,default=Path("."))
    parser.add_argument("--update-portal",action="store_true")
    args=parser.parse_args()
    rows=verify(args.repo,args.update_portal)
    print(json.dumps({"validated_years":len(rows),
        "complete_years":[row["year"] for row in rows if row["status"]=="complete"],
        "country_years":sum(row["countries"] for row in rows)},indent=2))


if __name__=="__main__":main()
