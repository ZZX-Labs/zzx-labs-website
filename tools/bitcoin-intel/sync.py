
#!/usr/bin/env python3
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

UA="ZZX-Labs-Bitcoin-Intel-Mirror/1.0"

REPOS=[
    "bitcoin/bitcoin",
    "bitcoin/bips",
    "lightning/bolts",
    "lightningnetwork/lnd",
]

NEWS=[
    ("ap","AP","https://apnews.com/hub/bitcoin?rss=1"),
    ("wired","WIRED","https://www.wired.com/feed/tag/cryptocurrency/latest/rss"),
    ("ars","ARS","https://feeds.arstechnica.com/arstechnica/technology-lab"),
    ("404","404","https://www.404media.co/rss/"),
]

HN_QUERY="https://hn.algolia.com/api/v1/search?"+urllib.parse.urlencode({
    "query":"bitcoin OR lightning OR mempool OR satoshi",
    "tags":"story",
    "hitsPerPage":"20",
})

def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def get(url,token=None,accept="application/json"):
    headers={"User-Agent":UA,"Accept":accept}
    if token:
        headers["Authorization"]=f"Bearer {token}"
        headers["X-GitHub-Api-Version"]="2022-11-28"
    req=urllib.request.Request(url,headers=headers)
    with urllib.request.urlopen(req,timeout=45) as r:
        return r.read()

def get_json(url,token=None):
    return json.loads(get(url,token).decode("utf-8","replace"))

def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def text(node,names):
    for name in names:
        found=node.find(name)
        if found is not None and found.text:
            return found.text.strip()
    return ""

def local_name(tag):
    return tag.rsplit("}",1)[-1].lower()

def child_text(node,names):
    wanted={n.lower() for n in names}
    for child in list(node):
        if local_name(child.tag) in wanted and child.text:
            return child.text.strip()
    return ""

def child_link(node):
    for child in list(node):
        if local_name(child.tag)!="link":
            continue
        href=(child.attrib.get("href") or "").strip()
        if href:return href
        if child.text and child.text.strip():return child.text.strip()
    return ""

def parse_rss(data,source_id,label):
    root=ET.fromstring(data)
    rows=[]

    candidates=[
        node for node in root.iter()
        if local_name(node.tag) in {"item","entry"}
    ]

    for node in candidates[:30]:
        title=child_text(node,["title"])
        url=child_link(node)
        date=child_text(node,["pubDate","published","updated"])

        if not title or not url:
            continue

        ts=0
        if date:
            try:
                from email.utils import parsedate_to_datetime
                ts=int(parsedate_to_datetime(date).timestamp()*1000)
            except Exception:
                try:
                    ts=int(datetime.fromisoformat(date.replace("Z","+00:00")).timestamp()*1000)
                except Exception:
                    ts=0

        host=urllib.parse.urlparse(url).hostname or label
        host=re.sub(r"^www\.","",host)

        rows.append({
            "id":f"{source_id}:{url}",
            "source":label,
            "title":title,
            "url":url,
            "ts":ts,
            "detail":host,
        })

    return rows

def mirror_repo(root,repo,token):
    api=f"https://api.github.com/repos/{repo}"
    meta=get_json(api,token)
    commits=get_json(f"{api}/commits?per_page=20",token)
    releases=get_json(f"{api}/releases?per_page=5",token)

    base=root/"bitcoin/github/api/repos"/repo

    write_json(base/"repo.json",{
        "schema":"zzx-github-repo-mirror-v1",
        "generated_at":now(),
        "repository":meta,
    })
    write_json(base/"commits.json",{
        "schema":"zzx-github-commits-mirror-v1",
        "generated_at":now(),
        "repository":repo,
        "commits":commits,
    })
    write_json(base/"releases.json",{
        "schema":"zzx-github-releases-mirror-v1",
        "generated_at":now(),
        "repository":repo,
        "releases":releases,
    })

def mirror_hn(root):
    data=get_json(HN_QUERY)
    hits=data.get("hits") or []
    items=[]

    for h in hits[:20]:
        url=h.get("url") or h.get("story_url") or f"https://news.ycombinator.com/item?id={h.get('objectID','')}"
        title=h.get("title") or h.get("story_title") or "discussion"
        items.append({
            "id":f"hn:{h.get('objectID','')}",
            "source":"HN",
            "title":title,
            "url":url,
            "ts":int(h.get("created_at_i") or 0)*1000,
            "detail":f"{int(h.get('points') or 0):,} points · {int(h.get('num_comments') or 0):,} comments",
        })

    write_json(root/"bitcoin/intel/api/news/hn.json",{
        "schema":"zzx-intel-news-mirror-v1",
        "generated_at":now(),
        "source":{"id":"hn","label":"HN","type":"hn","url":HN_QUERY},
        "items":items,
    })

def mirror_news(root,source_id,label,url):
    data=get(url,accept="application/rss+xml, application/atom+xml, text/xml, application/xml, */*")
    items=parse_rss(data,source_id,label)
    write_json(root/f"bitcoin/intel/api/news/{source_id}.json",{
        "schema":"zzx-intel-news-mirror-v1",
        "generated_at":now(),
        "source":{"id":source_id,"label":label,"type":"rss","url":url},
        "items":items,
    })

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--root",type=Path,default=Path("."))
    a=p.parse_args()

    token=os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    errors=[]
    updated=[]

    if token:
        for repo in REPOS:
            try:
                mirror_repo(a.root,repo,token)
                updated.append(f"github:{repo}")
            except Exception as exc:
                errors.append(f"github:{repo}: {exc}")
    else:
        errors.append("GitHub token unavailable; repository mirrors skipped")

    try:
        mirror_hn(a.root)
        updated.append("news:hn")
    except Exception as exc:
        errors.append(f"news:hn: {exc}")

    for source_id,label,url in NEWS:
        try:
            mirror_news(a.root,source_id,label,url)
            updated.append(f"news:{source_id}")
        except Exception as exc:
            errors.append(f"news:{source_id}: {exc}")

    report={
        "schema":"zzx-bitcoin-intel-mirror-report-v1",
        "generated_at":now(),
        "updated":updated,
        "errors":errors,
    }
    write_json(a.root/"bitcoin/intel/api/status.json",report)

    print(json.dumps(report,indent=2))
    return 0 if updated else 1

if __name__=="__main__":
    raise SystemExit(main())
