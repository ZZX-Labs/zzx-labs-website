from __future__ import annotations
import json, re
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from flask import Blueprint, jsonify, current_app, request

blog_api = Blueprint("blog_api", __name__)

# --- Helpers ---------------------------------------------------------------

def _root() -> Path:
    # App root (repository root assumed where this file lives under /blog/)
    return Path(current_app.root_path)

def _posts_dir() -> Path:
    return _root() / "blog" / "blog-posts"

def _load_manifest(folder: Path) -> Dict[str, Any]:
    """
    Load { posts: [...] } or { projects: [...] } from manifest.json in a folder.
    Returns {} if missing or invalid.
    """
    mf = folder / "manifest.json"
    if not mf.exists():
        return {}
    try:
        data = json.loads(mf.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def _normalize_entries(raw: Dict[str, Any], source_key: str) -> List[Dict[str, Any]]:
    """
    Normalize manifest entries to a common schema the front-end expects.
    """
    arr = []
    items = raw.get("posts") or raw.get("projects") or []
    for it in items:
        title = it.get("title") or it.get("slug") or "Untitled"
        url   = it.get("url") or it.get("href") or "#"
        desc  = it.get("description") or it.get("blurb") or ""
        date  = it.get("date")
        tags  = it.get("tags") or []
        image = it.get("image") or it.get("thumb")
        arr.append({
            "title": title,
            "url": url,
            "description": desc,
            "date": date,     # keep as-is (ISO string if present)
            "tags": tags,
            "image": image,
            "source": source_key
        })
    return arr

def _merge_post_lists() -> List[Dict[str, Any]]:
    base = _posts_dir()
    posted = _load_manifest(base / ".posted")
    tank   = _load_manifest(base / ".tank")

    A = _normalize_entries(posted, "posted")
    B = _normalize_entries(tank, "tank")

    # Assign fallback times (descending 12h) for entries missing date
    now = datetime.utcnow()
    def ensure_dates(items: List[Dict[str, Any]]):
        cur = now
        for it in items:
            if not it.get("date"):
                it["date"] = cur.isoformat() + "Z"
                cur = cur.replace(hour=(cur.hour - 12) % 24)

    ensure_dates(A)
    ensure_dates(B)

    # sort desc by date
    def parse_dt(s: Optional[str]) -> float:
        try:
            return datetime.fromisoformat(s.replace("Z","")).timestamp()
        except Exception:
            return 0.0

    merged = A + B
    merged.sort(key=lambda x: parse_dt(x.get("date")), reverse=True)
    return merged

_slug_re = re.compile(r"[^a-z0-9-]+")

def _slugify(s: str) -> str:
    s = (s or "").strip().lower().replace("&", "and").replace(" ", "-")
    s = _slug_re.sub("-", s).strip("-")
    return s or "post"

# --- API -------------------------------------------------------------------

@blog_api.route("/blog/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "ts": datetime.utcnow().isoformat() + "Z"})

@blog_api.route("/blog/api/posts", methods=["GET"])
def get_blog_posts():
    """
    Single JSON feed used by /blog/index.html script.
    Merges .posted and .tank manifests into one list.
    """
    posts = _merge_post_lists()
    return jsonify({"posts": posts})

@blog_api.route("/blog/api/post/<path:slug>", methods=["GET"])
def get_blog_post(slug: str):
    """
    Look for a single post by URL suffix match (best-effort).
    This is a light helper for API symmetry.
    """
    items = _merge_post_lists()
    slug = slug.strip().lower()
    for it in items:
        href = (it.get("url") or "").lower()
        if href.endswith("/" + slug) or href.endswith("/" + slug + "/") or href == slug:
            return jsonify(it)
    return jsonify({"error": "Post not found"}), 404

@blog_api.route("/blog/api/post", methods=["POST"])
def create_blog_post():
    """
    Minimal create endpoint:
      JSON body: { "title": "...", "content": "...", "description": "...", "folder": "posted|tank" }
    Writes a simple index.html into /blog/blog-posts/.<folder>/<slug>/index.html
    and appends an entry into that folder's manifest.json (creating one if missing).
    """
    data = request.get_json(force=True, silent=True) or {}
    title = data.get("title") or "Untitled"
    content = data.get("content") or ""
    description = data.get("description") or ""
    folder_key = data.get("folder") or "posted"  # "posted" or "tank"
    if folder_key not in ("posted", "tank"):
        folder_key = "posted"

    slug = _slugify(title)
    base = _posts_dir() / f".{folder_key}" / slug
    base.mkdir(parents=True, exist_ok=True)

    # Write a minimal post HTML
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>{title} | ZZX-Labs Blog</title>
  <link rel="stylesheet" href="/static/styles.css" />
</head>
<body>
<header><div id="zzx-header"></div></header>
<main class="container">
  <h1>{title}</h1>
  <p class="meta">{datetime.utcnow().isoformat()}Z</p>
  <article><p>{content}</p></article>
  <p><a class="btn alt" href="/blog/">← Back to Blog</a></p>
</main>
<footer><div id="zzx-footer"></div></footer>
<script src="/static/script.js" defer></script>
</body>
</html>"""
    (base / "index.html").write_text(html, encoding="utf-8")

    # Update manifest for that folder
    mf_dir = _posts_dir() / f".{folder_key}"
    mf = mf_dir / "manifest.json"
    if mf.exists():
        try:
            data_mf = json.loads(mf.read_text(encoding="utf-8"))
        except Exception:
            data_mf = {}
    else:
        data_mf = {}

    posts = data_mf.get("posts") or data_mf.get("projects") or []
    # canonical URL
    url = f"/blog/blog-posts/.{folder_key}/{slug}/"
    entry = {
        "title": title,
        "url": url,
        "description": description,
        "date": datetime.utcnow().isoformat() + "Z",
        "tags": []
    }
    posts.append(entry)
    data_mf["posts"] = posts
    mf.write_text(json.dumps(data_mf, indent=2), encoding="utf-8")

    return jsonify(entry), 201
