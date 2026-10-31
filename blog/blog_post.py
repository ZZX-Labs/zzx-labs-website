from __future__ import annotations
import os, json, re
from pathlib import Path
from datetime import datetime

# ---------------- Configure ----------------
# Choose where to drop generated posts: ".posted" or ".tank"
TARGET = ".posted"     # change to ".tank" if you want to generate drafts
SITE_ROOT = Path(__file__).resolve().parents[1]  # repo root that contains /blog/
POSTS_ROOT = SITE_ROOT / "blog" / "blog-posts" / TARGET

# ---------------- Content List -------------
post_titles = [
    "Cybersecurity Trends in 2024",
    "Cybersecurity Trends in 2025",
    "Tech Startups to Watch in 2024",
    "Tech Startups to Watch in 2025",
    "The Future of 0-Day Exploit Disclosure Innovation",
    "The Future of 0-Day Exploit Discovery Innovation",
    "The Future of 0-Day Exploit Vulnerability Testing Innovation",
    "The Future of 0-Day Exploitation Innovation",
    "The Future of AI Innovation",
    "The Future of Bitcoin & Lightning Network (LN) Innovation",
    "The Future of Bitcoin Algorithmic Trading Innovation",
    "The Future of Bitcoin Analytics & Forensics for Investigation Innovation",
    "The Future of Cryptography Innovation",
    "The Future of Cyber Investigation Innovation",
    "The Future of Cybersecurity Innovation",
    "The Future of Cyberwarfare Innovation",
    "The Future of DL Innovation",
    "The Future of Data Security (DataSec) Innovation",
    "The Future of Drone Innovation",
    "The Future of Firmware Development Innovation",
    "The Future of GPT Innovation",
    "The Future of GPT PDA Innovation",
    "The Future of Generative AI Innovation",
    "The Future of Hardware Development Innovation",
    "The Future of Information Security (InfoSec) Innovation",
    "The Future of LLM Innovation",
    "The Future of ML Innovation",
    "The Future of Malware Analysis Innovation",
    "The Future of Malware Deployment Innovation",
    "The Future of Malware Development Innovation",
    "The Future of NLP Innovation",
    "The Future of NN Innovation",
    "The Future of Network Security (NetSec) Innovation",
    "The Future of OSINT (Open Source Intelligence) Innovation",
    "The Future of OSINT Reporting Innovation",
    "The Future of Operational Security (OpSec) Innovation",
    "The Future of Quantum Cryptography Innovation",
    "The Future of Ransomware Analysis Innovation",
    "The Future of Ransomware Deployment Innovation",
    "The Future of Ransomware Development Innovation",
    "The Future of Robotic Innovation",
    "The Future of STT Innovation",
    "The Future of Software Development Innovation",
    "The Future of TTS Innovation",
    "The Future of Web Development Innovation",
    "The Future of Web Security Innovation"
]

# --------------- Helpers -------------------
_slug_re = re.compile(r"[^a-z0-9-]+")
def slugify(s: str) -> str:
    s = (s or "").strip().lower().replace("&", "and").replace(" ", "-")
    s = _slug_re.sub("-", s).strip("-")
    return s or "post"

def safe_read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""

def write_manifest(entries):
    mf = POSTS_ROOT / "manifest.json"
    data = {"posts": entries}
    mf.parent.mkdir(parents=True, exist_ok=True)
    mf.write_text(json.dumps(data, indent=2), encoding="utf-8")

# --------------- Generator -----------------
def generate_html(title: str, date_iso: str, content_html: str) -> str:
    """Legacy draft generator shares the site's actual chrome and ticker."""
    from html import escape
    return f"""<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex,nofollow">
        <title>{escape(title)} | ZZX-Labs R&amp;D</title>
        <link rel="icon" href="/static/icons/favicon.ico" type="image/x-icon">
        <link rel="icon" href="/static/icons/favicon-32.png" sizes="32x32" type="image/png">
        <link rel="icon" href="/static/icons/favicon-16.png" sizes="16x16" type="image/png">
        <link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">
        <link rel="stylesheet" href="/static/styles.css">
        <script src="/static/script.js" defer></script>
        <link rel="stylesheet" href="/blog/zzx.css">
    </head>
    <body class="zzx-site-page zzx-page-blog">
        <header>
            <div id="zzx-header"></div>
            <br>
            <div id="ticker-container"></div>
            <br>
        </header>
        <main id="content" class="zzx-blog-content">
            <nav class="zzx-blog-nav" aria-label="Blog sections">
                <a href="/blog/">Journal</a>
                <a href="/blog/blog-posts/">Archive</a>
                <a href="/blog/rss/">RSS</a>
            </nav>
            <article class="article-layout">
                <h1>{escape(title)}</h1>
                <p class="meta">{escape(date_iso)}</p>
                <div class="prose">
                    {content_html}
                </div>
                <p><a href="/blog/">Back to Blog</a></p>
            </article>
        </main>
        <footer>
            <div id="zzx-footer"></div>
        </footer>
    </body>
</html>
"""

def main():
    POSTS_ROOT.mkdir(parents=True, exist_ok=True)
    manifest_entries = []

    # Start from "now" and step back 12h per post (like your client script)
    current = datetime.utcnow()

    for title in post_titles:
        slug = slugify(title)
        # If you maintain .txt content: put them in /blog/blog-posts/.<TARGET>/<slug>/content.txt
        content_dir = POSTS_ROOT / slug
        content_dir.mkdir(parents=True, exist_ok=True)

        # Look for an optional content.txt; otherwise use a placeholder
        txt_path = content_dir / "content.txt"
        raw = safe_read(txt_path).strip()
        if not raw:
            raw = f"<p>{title} — content coming soon.</p>"

        date_iso = current.isoformat() + "Z"
        current = current.replace(hour=(current.hour - 12) % 24)

        html = generate_html(title, date_iso, raw)
        (content_dir / "index.html").write_text(html, encoding="utf-8")

        # Manifest entry
        manifest_entries.append({
            "title": title,
            "url": f"/blog/blog-posts/{TARGET}/{slug}/",
            "description": f"{title}",
            "date": date_iso,
            "tags": []
        })

    # Write or replace manifest.json
    write_manifest(manifest_entries)
    print(f"Generated {len(manifest_entries)} posts in {POSTS_ROOT}")

if __name__ == "__main__":
    main()
