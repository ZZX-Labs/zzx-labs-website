#!/usr/bin/env python3
"""VLC2DiscordStatus native bridge.

Polls VLC's loopback HTTP JSON endpoint and, when pypresence is installed,
publishes a Discord Rich Presence. Secrets are read from environment variables.
"""
from __future__ import annotations
import json, os, sys, time
from urllib.parse import urljoin
import requests

VLC_BASE = os.environ.get("VLC_HTTP_URL", "http://127.0.0.1:8080/")
VLC_PASSWORD = os.environ.get("VLC_HTTP_PASSWORD", "")
DISCORD_CLIENT_ID = os.environ.get("DISCORD_CLIENT_ID", "")
POLL_SECONDS = max(0.25, float(os.environ.get("VLC2DISCORD_POLL", "1.0")))

def get_status() -> dict:
    url = urljoin(VLC_BASE, "requests/status.json")
    response = requests.get(url, auth=("", VLC_PASSWORD), timeout=3)
    response.raise_for_status()
    return response.json()

def metadata(status: dict) -> dict:
    info = status.get("information") or {}
    category = info.get("category") or {}
    meta = category.get("meta") or {}
    return {
        "title": meta.get("title") or meta.get("filename") or "VLC Media",
        "artist": meta.get("artist") or "",
        "album": meta.get("album") or "",
        "state": status.get("state") or "stopped",
        "time": int(status.get("time") or 0),
        "length": int(status.get("length") or 0),
    }

def presence(meta: dict) -> dict:
    now = int(time.time())
    out = {
        "details": meta["title"][:128],
        "state": (f'by {meta["artist"]}' if meta["artist"] else meta["state"])[:128],
        "large_image": "vlc",
        "large_text": (meta["album"] or "VLC media")[:128],
        "small_text": meta["state"][:128],
    }
    if meta["state"] == "playing":
        out["start"] = now - max(0, meta["time"])
        if meta["length"] > meta["time"]:
            out["end"] = now + (meta["length"] - meta["time"])
    return out

def main() -> int:
    rpc = None
    if DISCORD_CLIENT_ID:
        try:
            from pypresence import Presence
            rpc = Presence(DISCORD_CLIENT_ID)
            rpc.connect()
        except Exception as exc:
            print(f"Discord RPC unavailable; continuing in JSON preview mode: {exc}", file=sys.stderr)
            rpc = None
    else:
        print("DISCORD_CLIENT_ID not set; JSON preview mode.", file=sys.stderr)

    last = None
    while True:
        try:
            meta = metadata(get_status())
            p = presence(meta)
            signature = json.dumps(p, sort_keys=True)
            if signature != last:
                print(json.dumps({"vlc": meta, "presence": p}, ensure_ascii=False))
                if rpc:
                    rpc.update(**p)
                last = signature
        except KeyboardInterrupt:
            if rpc:
                try: rpc.clear()
                except Exception: pass
            return 0
        except Exception as exc:
            print(f"poll error: {exc}", file=sys.stderr)
        time.sleep(POLL_SECONDS)

if __name__ == "__main__":
    raise SystemExit(main())
