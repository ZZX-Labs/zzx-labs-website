#!/usr/bin/env python3
"""YTRP native queue runner for authorized media only."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from yt_dlp import YoutubeDL

def opts(job):
    o={
        "noplaylist": True,
        "ignoreconfig": True,
        "restrictfilenames": True,
        "outtmpl": job.get("outputTemplate","%(title)s [%(id)s].%(ext)s"),
        "download_archive": "ytrp-archive.txt" if job.get("useArchive",True) else None,
        "writeinfojson": bool(job.get("writeMetadata",True)),
        "writethumbnail": bool(job.get("embedThumbnail",False)),
    }
    if job.get("mode")=="audio":
        o["format"]="bestaudio/best"
        o["postprocessors"]=[{"key":"FFmpegExtractAudio","preferredcodec":job.get("audioCodec","mp3"),"preferredquality":"0"}]
    else:
        o["format"]="bv*+ba/b"
    return {k:v for k,v in o.items() if v is not None}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("queue")
    ap.add_argument("--execute",action="store_true",help="required to actually download")
    a=ap.parse_args()
    data=json.loads(Path(a.queue).read_text(encoding="utf-8"))
    jobs=data.get("jobs",[])
    if not a.execute:
        print(json.dumps({"jobs":len(jobs),"mode":"dry-run","note":"Use --execute only for media you own or are authorized to download."},indent=2))
        return
    for job in jobs:
        if job.get("cookies") or job.get("vpnRotation") or job.get("drmBypass"):
            raise SystemExit("Refusing unsupported cookie/VPN/DRM-evasion job.")
        with YoutubeDL(opts(job)) as ydl:
            ydl.download([job["url"]])
if __name__=="__main__":main()
