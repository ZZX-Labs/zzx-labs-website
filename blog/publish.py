#!/usr/bin/env python3
from __future__ import annotations
import os, json, shutil, re, tempfile
from pathlib import Path
from datetime import datetime, timedelta, timezone

# ========= CONFIG =========
SITE_ROOT = Path(__file__).resolve().parents[1]          # repo root (contains /blog/)
BLOG_ROOT = SITE_ROOT / "blog" / "blog-posts"
TANK_DIR  = BLOG_ROOT / ".tank"
POSTED_DIR= BLOG_ROOT / ".posted"

STATE_FILE = BLOG_ROOT / ".state.json"   # remembers last published datetime
INTERVAL = timedelta(hours=12)           # publish cadence
BACKFILL_START = datetime(2024, 12, 1, 0, 0, 0, tzinfo=timezone.utc)  # first slot
TEMPLATE_PATH = SITE_ROOT / "blog" / "templates" / "post.html"  # optional
# ==========================

_slug_re = re.compile(r"[^a-z0-9-]+")
def slugify(s: str) -> str:
    s = (s or "").strip().lower().replace("&", "and").replace(" ", "-")
    s = _slug_re.sub("-", s).strip("-")
    return s or "post"

def month_dir_for(dt: datetime) -> Path:
    monthname = dt.strftime("%B").lower()
    return POSTED_DIR / f"{dt.year:04d}-{dt.month:02d}-{monthname}"

def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def write_json_atomic(path: Path, data):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)

def atomic_write(path: Path, text: str):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)

def load_template() -> str:
    if TEMPLATE_PATH.is_file():
        return TEMPLATE_PATH.read_text(encoding="utf-8")
    # Fallback minimal
    return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>{{TITLE}} | ZZX-Labs Blog</title>
  <link rel="stylesheet" href="/static/styles.css" />
  <script src="/static/script.js" defer></script>
</head>
<body>
<header><div id="zzx-header"></div></header>
<main class="container">
  <h1>{{TITLE}}</h1>
  <p class="meta">{{DATE}}</p>
  <article>
    {{CONTENT}}
  </article>
  <p><a class="btn alt" href="/blog/">← Back to Blog</a></p>
</main>
<footer><div id="zzx-footer"></div></footer>
</body>
</html>"""

def build_post_html(title: str, date_iso: str, content_html: str) -> str:
    tpl = load_template()
    return (
        tpl.replace("{{TITLE}}", title)
           .replace("{{DATE}}", date_iso)
           .replace("{{CONTENT}}", content_html)
    )

def collect_tank_items() -> list[Path]:
    """
    Accepts either:
      - .tank/<slug>/ (with either index.html or content.txt), or
      - .tank/<slug>.txt  (flat text file)
    Returns a stable, slug-sorted list of *units* to publish (paths).
    """
    if not TANK_DIR.exists():
        return []
    dirs = []
    for p in sorted(TANK_DIR.iterdir(), key=lambda x: x.name.lower()):
        if p.is_dir():
            dirs.append(p)
        elif p.is_file() and p.suffix.lower() == ".txt":
            dirs.append(p)
    return dirs

def extract_title_from_path(p: Path) -> str:
    base = p.stem if p.is_file() else p.name
    title = re.sub(r"[-_]+", " ", base).strip().title()
    return title or "Untitled"

def read_content_unit(p: Path) -> dict:
    """
    Read a tank unit. Returns dict with:
      slug, title, html (rendered), assets (list of (src_path, rel_path))
    """
    if p.is_dir():
        slug = p.name.lower()
        title = extract_title_from_path(p)
        index_html = p / "index.html"
        content_txt = p / "content.txt"
        content_html = ""
        if index_html.exists():
            content_html = index_html.read_text(encoding="utf-8")
            # If index.html looks like full page, keep it; otherwise treat as article HTML
            if "<html" in content_html.lower():
                # Already a full page; we’ll wrap only if needed later
                return {"slug": slug, "title": title, "html_full": content_html, "assets_dir": p}
        elif content_txt.exists():
            content_html = "<p>" + content_txt.read_text(encoding="utf-8").strip().replace("\n\n", "</p><p>") + "</p>"
        else:
            content_html = "<p>Content coming soon.</p>"

        html = build_post_html(title, "DATE_PLACEHOLDER", content_html)
        return {"slug": slug, "title": title, "html": html, "assets_dir": p}

    # flat .txt item
    slug = p.stem.lower()
    title = extract_title_from_path(p)
    raw = p.read_text(encoding="utf-8").strip()
    content_html = "<p>" + raw.replace("\n\n", "</p><p>") + "</p>" if raw else "<p>Content coming soon.</p>"
    html = build_post_html(title, "DATE_PLACEHOLDER", content_html)
    return {"slug": slug, "title": title, "html": html, "assets_dir": None, "flat_txt": p}

def load_state():
    data = read_json(STATE_FILE, {})
    # on first run, start backfill at BACKFILL_START
    last = data.get("last_published_at")
    if last:
        try:
            last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
        except Exception:
            last_dt = BACKFILL_START - INTERVAL
    else:
        # pretend the last published was one interval before the backfill start,
        # so the next slot is BACKFILL_START
        last_dt = BACKFILL_START - INTERVAL
    return {"last_published_at": last_dt}

def save_state(dt: datetime):
    write_json_atomic(STATE_FILE, {"last_published_at": dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00","Z")})

def read_month_manifest(mdir: Path):
    return read_json(mdir / "manifest.json", {"posts": []})

def write_month_manifest(mdir: Path, posts: list[dict]):
    write_json_atomic(mdir / "manifest.json", {"posts": posts})

def rebuild_root_manifest():
    # Aggregate all per-month manifests
    posts = []
    if POSTED_DIR.exists():
        for mdir in POSTED_DIR.iterdir():
            if mdir.is_dir():
                mf = read_month_manifest(mdir).get("posts", [])
                posts.extend(mf)
    posts.sort(key=lambda p: p.get("date",""), reverse=True)
    write_json_atomic(POSTED_DIR / "manifest.json", {"posts": posts})

def next_due_slots(last_published_at: datetime, now: datetime) -> int:
    """
    How many 12h slots are due between last_published_at and now?
    """
    cnt = 0
    t = last_published_at + INTERVAL
    while t <= now:
        cnt += 1
        t += INTERVAL
    return cnt

def publish_one(unit: Path, slot_dt: datetime):
    """
    Publish a single tank unit into .posted/YYYY-MM-monthname/<slug> with
    correct date and manifests.
    """
    data = read_content_unit(unit)
    slug = data["slug"]
    title = data["title"]
    date_iso = slot_dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    target_month_dir = month_dir_for(slot_dt)
    target_dir = target_month_dir / slug
    ensure_dir(target_dir)

    # 1) Build final HTML (if we only have 'html' template)
    if "html" in data:
        html = data["html"].replace("DATE_PLACEHOLDER", date_iso)
        atomic_write(target_dir / "index.html", html)
    elif "html_full" in data:
        # Already a full HTML doc. We can inject the date by simple replacement if you want.
        html_full = data["html_full"].replace("DATE_PLACEHOLDER", date_iso)
        atomic_write(target_dir / "index.html", html_full)

    # 2) Copy assets (if any directory content)
    assets_dir = data.get("assets_dir")
    if assets_dir and assets_dir.is_dir():
        # copy everything except index.html/content.txt (already handled)
        for root, dirs, files in os.walk(assets_dir):
            root_p = Path(root)
            rel = root_p.relative_to(assets_dir)
            for d in dirs:
                ensure_dir(target_dir / rel / d)
            for f in files:
                if root_p == assets_dir and f in {"index.html", "content.txt"}:
                    continue
                src = root_p / f
                dst = target_dir / rel / f
                ensure_dir(dst.parent)
                shutil.copy2(src, dst)

    # 3) Update per-month manifest
    mm = read_month_manifest(target_month_dir).get("posts", [])
    # remove dup for idempotency, then append
    mm = [p for p in mm if p.get("url") != f"/blog/blog-posts/.posted/{target_month_dir.name}/{slug}/"]
    mm.append({
        "title": title,
        "url": f"/blog/blog-posts/.posted/{target_month_dir.name}/{slug}/",
        "description": title,   # can be enriched later with an excerpt
        "date": date_iso,
        "tags": []
    })
    mm.sort(key=lambda p: p.get("date",""))  # ascending within month
    write_month_manifest(target_month_dir, mm)

    # 4) Remove the tank unit
    if unit.is_dir():
        shutil.rmtree(unit)
    elif unit.is_file():
        unit.unlink()

def main():
    ensure_dir(TANK_DIR)
    ensure_dir(POSTED_DIR)

    state = load_state()
    last = state["last_published_at"]
    now = datetime.now(tz=timezone.utc)

    due = next_due_slots(last, now)
    if due <= 0:
        print("No slots due.")
        return

    tank = collect_tank_items()
    if not tank:
        print("No items in .tank.")
        return

    # Publish up to 'due' or however many we have
    to_publish = min(due, len(tank))
    # Each slot time = last + INTERVAL * slot_index
    for i in range(1, to_publish + 1):
        slot_dt = last + INTERVAL * i
        publish_one(tank[i-1], slot_dt)

    # New last_published = last + INTERVAL * to_publish
    new_last = last + INTERVAL * to_publish
    save_state(new_last)

    # Rebuild root manifest after publishing
    rebuild_root_manifest()

    print(f"Published {to_publish} post(s). Next due after {new_last + INTERVAL}.")

if __name__ == "__main__":
    main()
