#!/usr/bin/env python3
"""ZZX-BLOG static publisher: approved queue -> public HTML/catalog/RSS.

Python 3.11+, standard library only. Safe default is preview (no writes).
Historical /blog/blog-posts/.tank and /.posted locations are retained for
compatibility. Prefer an --tank directory OUTSIDE the public site root.

Usage:
    python blog/publish.py --site zzx-labs.io
    python blog/publish.py --site zzx-labs.io --publish
    python blog/publish.py --site zzx-labs.io --publish --force --limit 2
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from html import escape
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from xml.etree import ElementTree as ET

INTERVAL = timedelta(hours=12)
HOST = 'https://zzx-labs.io'
MONTH_RE = re.compile(r'^\d{4}-\d{2}-[a-z]+$')
SLUG_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
HERO_RE = re.compile(r'^/assets/hero/[a-zA-Z0-9_.-]+\.png$')
MEDIA_NS = 'http://search.yahoo.com/mrss/'


def slugify(value: str) -> str:
    value = value.lower().strip().replace('&', 'and')
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', value)).strip('-')


def read_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8'))


def json_bytes(data) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def safe_src(meta: dict, site: Path, used: set[str]) -> tuple[str, str]:
    path = meta.get('thumb', '')
    if not isinstance(path, str) or not HERO_RE.fullmatch(path):
        raise ValueError('post.json requires thumb: /assets/hero/<approved-image>.png')
    if path in used:
        raise ValueError(f'Artwork already assigned to a different article: {path}')
    image_path = site / path.lstrip('/')
    if not image_path.is_file() or image_path.is_symlink():
        raise ValueError(f'Approved artwork PNG not found in repository: {image_path}')
    with image_path.open('rb') as image_file:
        if image_file.read(8) != b'\x89PNG\r\n\x1a\n':
            raise ValueError(f'Artwork file does not have a PNG signature: {image_path}')
    if meta.get('publication_approved') is not True:
        raise ValueError('post.json must set publication_approved: true for the selected artwork')
    alt = str(meta.get('hero_alt', '')).strip()
    if not alt:
        raise ValueError('post.json requires descriptive hero_alt text')
    return path, alt


def queue_units(tank: Path) -> list[Path]:
    if not tank.is_dir():
        return []
    return sorted((p for p in tank.iterdir() if
                   (p.is_dir() and not p.is_symlink()) or
                   (p.is_file() and not p.is_symlink() and p.suffix.lower() == '.txt')),
                  key=lambda p: p.name.casefold())


def plain_html(text: str) -> str:
    # Never interpolate raw plaintext into HTML. Paragraph and line break handling.
    parts = re.split(r'\n\s*\n', text.strip())
    return '\n'.join('<p>' + escape(p).replace('\n', '<br>') + '</p>'
                     for p in parts if p.strip())


def load_unit(unit: Path, site: Path, existing_slugs: set[str], used_art: set[str]):
    if unit.is_symlink():
        raise ValueError(f'Queue item must not be a symlink: {unit}')
    slug = slugify(unit.stem if unit.is_file() else unit.name)
    if not SLUG_RE.fullmatch(slug):
        raise ValueError(f'Invalid publication slug: {unit.name}')
    if slug in existing_slugs:
        raise ValueError(f'Article slug already exists in catalog: {slug}')
    meta_file = (unit.with_suffix('.json') if unit.is_file() else unit / 'post.json')
    if meta_file.is_symlink():
        raise ValueError(f'Symlink metadata not allowed: {meta_file}')
    meta = read_json(meta_file)
    if not isinstance(meta, dict):
        raise ValueError(f'Missing post metadata JSON: {meta_file}')
    if meta.get('approved') is not True:
        raise ValueError(f'Editorial approval missing in {meta_file}: set approved=true after review')
    title = str(meta.get('title', '')).strip()
    if not title:
        raise ValueError(f'Nonempty title required in {meta_file}')
    category = str(meta.get('category', 'Research & Development')).strip()
    if not category:
        category = 'Research & Development'
    tags = meta.get('tags', [])
    if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
        raise ValueError('tags must be an array of strings')
    thumb, alt = safe_src(meta, site, used_art)
    extras = {}
    if unit.is_file():
        content = unit.read_text(encoding='utf-8')
        prose = plain_html(content)
    else:
        txt = unit / 'content.txt'
        fragment = unit / 'content.html'
        full = unit / 'index.html'
        if txt.exists():
            prose = plain_html(txt.read_text(encoding='utf-8'))
        elif fragment.exists():
            if meta.get('trusted_html') is not True:
                raise ValueError('content.html requires trusted_html=true after manual review')
            prose = fragment.read_text(encoding='utf-8')
        elif full.exists():
            if meta.get('trusted_html') is not True:
                raise ValueError('index.html import requires trusted_html=true')
            raw_html = full.read_text(encoding='utf-8')
            if '<html' in raw_html.lower():
                # Keep only the authored <article> body; rebuild site chrome from
                # the canonical template so dates, canonical URLs and CSS are correct.
                prose = extract_article(raw_html)
            else:
                prose = raw_html
        else:
            raise ValueError(f'No content.txt or content.html in {unit}')
        for p in unit.rglob('*'):
            if p.is_symlink():
                raise ValueError(f'Symlinks not allowed in queue assets: {p}')
            if p.is_file() and p.name not in {'content.txt', 'content.html', 'post.json', 'index.html'}:
                rel = p.relative_to(unit)
                extras[rel.as_posix()] = p.read_bytes()
    if not prose.strip():
        raise ValueError(f'Article cannot be empty: {unit}')
    description = str(meta.get('description', '')).strip()
    if not description:
        description = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', prose)).strip()[:190]
    return {'source': unit, 'metadata': meta, 'slug': slug, 'title': title,
            'description': description, 'category': category, 'tags': tags,
            'thumb': thumb, 'hero_alt': alt, 'prose': prose, 'extras': extras}


def month_name(dt: datetime) -> str:
    return dt.strftime('%Y-%m-') + dt.strftime('%B').lower()


def make_post_html(p: dict, prose: str) -> str:
    title = escape(p['title'])
    desc = escape(p['description'], quote=True)
    date = escape(p['date'])
    image = escape(p['thumb'], quote=True)
    alt = escape(p['hero_alt'], quote=True)
    url = escape(HOST + p['url'], quote=True)
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="robots" content="index,follow">
  <meta name="description" content="{desc}">
  <title>{title} | ZZX-Labs R&amp;D</title>
  <link rel="canonical" href="{url}">
  <link rel="alternate" type="application/rss+xml" href="/blog/rss.xml" title="ZZX-Labs RSS">
  <link rel="stylesheet" href="/static/styles.css">
  <link rel="stylesheet" href="/blog/style.css">
  <script src="/static/script.js" defer></script>
  <script src="/blog/script.js" defer></script>
</head>
<body class="zzx-blog zzx-blog-article" data-blog-view="article">
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-shell"><div id="zzx-header"></div><div id="ticker-container"></div></header>
  <main id="main-content" class="blog-wrap article-page">
    <nav class="article-breadcrumb" aria-label="Breadcrumb"><a href="/blog/">Journal</a><a href="/blog/blog-posts/">Archive</a></nav>
    <p class="blog-overline">ZZX-Labs R&amp;D / {escape(p['category'])}</p>
    <h1>{title}</h1>
    <p class="article-meta">Published <time datetime="{date}">{escape(p['date'][:10])}</time> UTC</p>
    <figure class="article-visual"><img src="{image}" alt="{alt}" loading="eager" decoding="async" onerror="this.hidden=true;this.parentElement.classList.add('image-unavailable')"><figcaption>ZZX-Labs R&amp;D editorial artwork</figcaption></figure>
    <div class="prose">{prose}</div>
    <div class="blog-article-actions"><a class="blog-button" href="/blog/blog-posts/">Archive</a><a class="blog-button alt" href="/blog/rss.xml">RSS</a></div>
  </main>
  <footer class="blog-footer"><div class="blog-wrap"><div id="zzx-footer"></div></div></footer>
</body>
</html>
'''


def card_html(p: dict) -> str:
    q = lambda value: escape(str(value), quote=True)
    url, title, thumb, alt = map(q, (p['url'], p['title'], p.get('thumb', ''), p.get('hero_alt', '')))
    category, desc = q(p.get('category', 'Research')), q(p.get('description', ''))
    verified = p.get('status') == 'published'
    date_label = 'published' if verified else 'archive date'
    tags = ''.join(f'<span class="blog-tag">{q(tag)}</span>' for tag in p.get('tags', [])[:4])
    warning = '<span class="archive-flag">Source text unavailable</span>' if p.get('status') == 'source-missing' else ''
    image = (f'<img src="{thumb}" alt="{alt}" loading="lazy" decoding="async" '
             'onerror="this.hidden=true;this.parentElement.classList.add(\'image-unavailable\')">') if thumb else ''
    return (f'<article class="blog-card" data-url="{url}">'
            f'<a class="blog-card-art" href="{url}">{image}</a>'
            f'<div class="blog-card-body"><div class="blog-meta"><span>{category}</span>'
            f'<span>{q(p.get("date", "")[:10])} ({date_label})</span></div>'
            f'<h3><a href="{url}">{title}</a></h3><p>{desc}</p>{warning}'
            f'<div class="blog-tags">{tags}</div>'
            f'<a class="blog-read" href="{url}">Read article</a></div></article>')


class _InnerRange(HTMLParser):
    """Find the contents of a DOM element without rewriting surrounding HTML."""
    def __init__(self, html: str, element_id: str | None, tag: str = 'div'):
        super().__init__(convert_charrefs=False)
        self.text = html
        self.id = element_id
        self.tag = tag
        lines = html.splitlines(keepends=True)
        self.starts = [0]
        for s in lines:
            self.starts.append(self.starts[-1] + len(s))
        self.start = self.end = None
        self.level = 0
        self.in_target = False

    def absolute_position(self) -> int:
        line, col = self.getpos()
        return self.starts[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if self.in_target and tag == self.tag:
            self.level += 1
        elif not self.in_target and self.start is None and tag == self.tag and (self.id is None or dict(attrs).get('id') == self.id):
            self.in_target = True
            self.level = 1
            self.start = self.absolute_position() + len(self.get_starttag_text())

    def handle_endtag(self, tag):
        if self.in_target and tag == self.tag:
            self.level -= 1
            if self.level == 0:
                self.end = self.absolute_position()
                self.in_target = False


def extract_article(html: str) -> str:
    parser = _InnerRange(html, None, 'article')
    parser.feed(html)
    if parser.start is None or parser.end is None:
        raise ValueError('Imported full HTML document has no <article> body')
    return html[parser.start:parser.end]


def replace_div(html: str, element_id: str, value: str) -> str:
    parser = _InnerRange(html, element_id)
    parser.feed(html)
    if parser.start is None or parser.end is None:
        raise ValueError(f'Expected existing v5 container #{element_id}; refusing destructive HTML rewrite')
    return html[:parser.start] + value + html[parser.end:]


def update_stat(html: str, total: int) -> str:
    html = re.sub(r'(<strong id="post-count">)\d+(</strong>)', rf'\g<1>{total}\2', html)
    html = re.sub(r'(Showing all )\d+( (?:articles|feed entries))', rf'\g<1>{total}\2', html)
    html = re.sub(r'\b\d+(-entry archive catalog)', rf'{total}\1', html)
    return html


def rebuild_static(site: Path, posts: list[dict], additions: list[dict]) -> dict[Path, bytes]:
    blog = site / 'blog'
    change = {}
    ordered = sorted(posts, key=lambda p: (p.get('date', ''), p.get('url', '')), reverse=True)
    grid = lambda items: '\n'.join(card_html(p) for p in items)
    for rel, ids in (
        ('index.html', ('featured-list', 'recent-list')),
        ('journal/index.html', ('featured-list', 'recent-list')),
        ('blog-posts/index.html', ('archives',)),
        ('rss/index.html', ('rss-previews',)),
    ):
        dest = blog / rel
        if not dest.is_file():
            raise FileNotFoundError(f'Required v5 static index missing: {dest}')
        html = dest.read_text(encoding='utf-8').replace('href="/blog/styles.css"', 'href="/blog/style.css"')
        if ids == ('featured-list', 'recent-list'):
            html = replace_div(html, 'featured-list', grid(ordered[:4]))
            html = replace_div(html, 'recent-list', grid(ordered[4:]))
        elif ids == ('rss-previews',):
            html = replace_div(html, 'rss-previews', grid(ordered))
        else:
            groups = {}
            for p in ordered:
                groups.setdefault(str(p.get('date', ''))[:7], []).append(p)
            sections = []
            for key, entries in groups.items():
                try:
                    label = datetime.strptime(key, '%Y-%m').strftime('%B %Y')
                except ValueError:
                    label = 'Undated'
                sections.append('<section class="month-group"><div class="blog-section-head">'
                                f'<h2>{escape(label)}</h2><p>{len(entries)} entries</p></div>'
                                f'<div class="blog-grid">{grid(entries)}</div></section>')
            html = replace_div(html, 'archives', '\n'.join(sections))
        change[dest] = update_stat(html, len(ordered)).encode('utf-8')
    affected = sorted({p['date'][:7] for p in additions})
    for month in affected:
        when = datetime.strptime(month, '%Y-%m').replace(tzinfo=timezone.utc)
        slug = month_name(when)
        dest = blog / 'blog-posts' / slug / 'index.html'
        month_posts = [p for p in ordered if p['date'].startswith(month)]
        if dest.exists():
            html = dest.read_text(encoding='utf-8').replace('href="/blog/styles.css"', 'href="/blog/style.css"')
            html = replace_div(html, 'month-posts', grid(month_posts))
            html = re.sub(r'\b\d+ articles in this editorial archive month',
                          f'{len(month_posts)} articles in this editorial archive month', html)
            html = re.sub(r'(<p id="blog-status"[^>]*>)\d+ articles(</p>)',
                          rf'\g<1>{len(month_posts)} articles\2', html)
        else:
            heading = escape(when.strftime('%B %Y'))
            html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{heading} Archive | ZZX-Labs R&amp;D</title><link rel="canonical" href="{HOST}/blog/blog-posts/{slug}/">
<link rel="alternate" type="application/rss+xml" href="/blog/rss.xml">
<link rel="stylesheet" href="/static/styles.css"><link rel="stylesheet" href="/blog/style.css">
<script src="/static/script.js" defer></script><script src="/blog/script.js" defer></script></head>
<body class="zzx-blog zzx-blog-month" data-blog-view="month" data-blog-month="{month}">
<a class="skip-link" href="#main-content">Skip to content</a><header class="site-shell"><div id="zzx-header"></div></header>
<main id="main-content"><div class="blog-topbar"><div class="blog-wrap"><a class="blog-brand" href="/blog/">ZZX<span> / LABS</span> <small>R&amp;D</small></a><nav class="blog-nav" aria-label="Blog navigation"><a href="/blog/">Journal</a><a href="/blog/blog-posts/">Archive</a><a href="/blog/rss/">RSS</a></nav></div></div>
<div id="ticker-container"></div><section class="blog-intro blog-wrap"><p class="blog-overline">Archive / {heading}</p><h1>{heading}</h1><p class="blog-lede">{len(month_posts)} articles in this editorial archive month. <a href="/blog/blog-posts/">All archives</a>.</p>
<div class="blog-controls" role="search" aria-label="Search archive"><label class="search-wrap"><span class="sr-only">Search</span><input id="search" type="search" placeholder="Search articles"></label><label><span class="sr-only">Category</span><select id="category-filter"><option value="">All categories</option></select></label><label><span class="sr-only">Tag</span><select id="tag-filter"><option value="">All topics</option></select></label><label><span class="sr-only">Sort</span><select id="sort-order"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title</option></select></label><button class="blog-button alt" id="shuffle" type="button">Shuffle</button></div><p id="blog-status" class="blog-status" aria-live="polite">{len(month_posts)} articles</p></section>
<section class="blog-wrap blog-section"><div id="month-posts" class="blog-grid">{grid(month_posts)}</div></section></main>
<footer class="blog-footer"><div class="blog-wrap"><div id="zzx-footer"></div></div></footer></body></html>
'''
        change[dest] = html.encode('utf-8')
    return change


def rss_bytes(posts: list[dict]) -> bytes:
    ET.register_namespace('media', MEDIA_NS)
    rss = ET.Element('rss', {'version': '2.0'})
    channel = ET.SubElement(rss, 'channel')
    for tag, text in [('title', 'ZZX-Labs R&D Journal'), ('link', HOST + '/blog/'),
                      ('description', 'ZZX-Labs research, published articles and recovered editorial archive entries.'),
                      ('language', 'en-us')]:
        ET.SubElement(channel, tag).text = text
    for p in sorted(posts, key=lambda x: x['date'], reverse=True):
        item = ET.SubElement(channel, 'item')
        url = HOST + p['url']
        for tag, value in [('title', p['title']), ('link', url), ('description', p.get('description', ''))]:
            ET.SubElement(item, tag).text = value
        ET.SubElement(item, 'guid', {'isPermaLink': 'true'}).text = url
        dt = datetime.fromisoformat(p['date'].replace('Z', '+00:00'))
        ET.SubElement(item, 'pubDate').text = format_datetime(dt)
        for topic in p.get('tags', []):
            ET.SubElement(item, 'category').text = topic
        if p.get('thumb'):
            ET.SubElement(item, '{' + MEDIA_NS + '}content',
                          {'url': HOST + p['thumb'], 'medium': 'image', 'type': 'image/png'})
    return ET.tostring(rss, encoding='utf-8', xml_declaration=True) + b'\n'


def generate_files(site: Path, catalog: dict, posts: list[dict], new: list[dict], hero: dict,
                   now: datetime) -> dict[Path, bytes]:
    blog = site / 'blog'
    sorted_posts = sorted(posts, key=lambda p: p['date'], reverse=True)
    catalog = dict(catalog)
    catalog['posts'] = sorted_posts
    catalog['total'] = len(sorted_posts)
    changes = {blog / 'catalog.json': json_bytes(catalog),
               blog / 'manifest.json': json_bytes({'posts': sorted_posts}),
               blog / 'blog-posts' / 'manifest.json': json_bytes({'posts': sorted_posts}),
               blog / 'api' / 'posts.json': json_bytes({'schema': 'zzx-blog-feed-v1',
                          'feed_url': HOST + '/blog/rss.xml', 'count': len(sorted_posts), 'posts': sorted_posts}),
               blog / 'hero-assignments.json': json_bytes(hero)}
    xml = rss_bytes(sorted_posts)
    changes[blog / 'rss.xml'] = xml
    changes[blog / 'rss' / 'index.xml'] = xml
    if (blog / 'api' / 'tags.json').exists():
        cats = Counter(p.get('category', 'Research') for p in sorted_posts)
        tags = Counter(t for p in sorted_posts for t in p.get('tags', []))
        taxonomy = {'schema': 'zzx-blog-taxonomy-v1', 'source': '/blog/api/posts.json',
                    'entries': len(sorted_posts),
                    'categories': [{'name': n, 'count': c} for n, c in sorted(cats.items(), key=lambda x: (-x[1], x[0]))],
                    'tags': [{'name': n, 'count': c} for n, c in sorted(tags.items(), key=lambda x: (-x[1], x[0]))]}
        changes[blog / 'api' / 'tags.json'] = json_bytes(taxonomy)
    # Month-specific JSON listings for older/third-party archive readers.
    for month in sorted({p['date'][:7] for p in new}):
        dt = datetime.strptime(month, '%Y-%m').replace(tzinfo=timezone.utc)
        mpath = blog / 'blog-posts' / month_name(dt) / 'manifest.json'
        changes[mpath] = json_bytes({'posts': [p for p in sorted_posts if p['date'].startswith(month)]})
    manifest_path = blog / 'hero-assignments-manifest.json'
    if manifest_path.exists():
        legacy = read_json(manifest_path, {})
        legacy.update({'original_post_images': len(hero['by_url']),
                       'assigned_image_count': len(hero['by_url']),
                       'published_article_count': sum(p.get('status') == 'published' for p in sorted_posts),
                       'pending_article_count': sum(p.get('status') != 'published' for p in sorted_posts),
                       'recovered_draft_count': sum(p.get('status') == 'recovered-draft' for p in sorted_posts),
                       'source_missing_count': sum(p.get('status') == 'source-missing' for p in sorted_posts),
                       'post_urls': [p['url'] for p in sorted_posts]})
        changes[manifest_path] = json_bytes(legacy)
    pending_path = blog / 'pending-posts.json'
    if pending_path.exists():
        existing_pending = read_json(pending_path, {}).get('posts', [])
        prev = {p['url']: p for p in existing_pending if isinstance(p, dict) and 'url' in p}
        pending = []
        for p in sorted_posts:
            if p.get('status') == 'published':
                continue
            obj = {k: p.get(k) for k in ('title', 'url', 'description', 'date', 'thumb', 'tags', 'hero_alt')}
            obj['editorial_status'] = p.get('status', 'pending')
            if p['url'] in prev and 'hero_genre' in prev[p['url']]:
                obj['hero_genre'] = prev[p['url']]['hero_genre']
            pending.append(obj)
        changes[pending_path] = json_bytes({'count': len(pending), 'posts': pending})
    sitemap = blog / 'sitemap.xml'
    if sitemap.exists():
        tree = ET.fromstring(sitemap.read_bytes())
        ns = 'http://www.sitemaps.org/schemas/sitemap/0.9'
        urls = {loc.text for loc in tree.findall(f'{{{ns}}}url/{{{ns}}}loc')}
        for p in new:
            url = HOST + p['url']
            if url not in urls:
                ET.SubElement(ET.SubElement(tree, f'{{{ns}}}url'), f'{{{ns}}}loc').text = url
                urls.add(url)
        changes[sitemap] = ET.tostring(tree, encoding='utf-8', xml_declaration=True) + b'\n'
    changes.update(rebuild_static(site, sorted_posts, new))
    return changes


def transactional_write(site: Path, changes: dict[Path, bytes]) -> None:
    # Prestage all bytes and backups before replacing a single live file.
    with tempfile.TemporaryDirectory(prefix='.zzx-publish-stage-', dir=site) as tdir:
        temp = Path(tdir)
        staged = []
        for i, (dest, contents) in enumerate(sorted(changes.items(), key=lambda x: str(x[0]))):
            path = dest.resolve(strict=False)
            if not path.is_relative_to(site.resolve()):
                raise ValueError(f'Unsafe destination outside site root: {dest}')
            if dest.is_symlink():
                raise ValueError(f'Refusing to overwrite symlink: {dest}')
            staged_file = temp / f'{i}.new'
            staged_file.write_bytes(contents)
            original = None
            if dest.exists():
                original = temp / f'{i}.old'
                shutil.copy2(dest, original)
            staged.append((dest, staged_file, original))
        changed = []
        try:
            for dest, staged_file, original in staged:
                dest.parent.mkdir(parents=True, exist_ok=True)
                os.replace(staged_file, dest)
                changed.append((dest, original))
        except Exception:
            for dest, original in reversed(changed):
                if original is not None:
                    os.replace(original, dest)
                else:
                    dest.unlink(missing_ok=True)
            raise


def publish(site: Path, tank: Path, archive: Path, limit: int, force: bool,
            write: bool, now: datetime | None = None) -> int:
    site = site.resolve()
    blog = site / 'blog'
    catalog_path = blog / 'catalog.json'
    if not catalog_path.is_file():
        raise FileNotFoundError(f'Missing v5 catalog: {catalog_path}')
    catalog = read_json(catalog_path)
    posts = catalog.get('posts', [])
    if not isinstance(posts, list):
        raise ValueError('blog/catalog.json must contain a posts array')
    urls = [p.get('url') for p in posts]
    if len(set(urls)) != len(urls):
        raise ValueError('Duplicate URLs already present in catalog')
    state_path = blog / 'blog-posts' / '.state.json'
    state = read_json(state_path, {}) or {}
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    last = state.get('last_published_at')
    if last and not force:
        last_dt = datetime.fromisoformat(last.replace('Z', '+00:00'))
        if last_dt.tzinfo is None:
            raise ValueError('State timestamp must include timezone')
        if now < last_dt:
            raise ValueError('State timestamp lies in future; check clock or state file')
        if now - last_dt < INTERVAL:
            print(f'Not due: next publication at {iso(last_dt + INTERVAL)}')
            return 0
    units = queue_units(tank)
    if not units:
        print(f'No queued posts found in: {tank}')
        return 0
    hero_path = blog / 'hero-assignments.json'
    hero = read_json(hero_path, {'schema': 'zzx-blog-hero-assignments-v2', 'by_url': {}, 'images': []})
    if not isinstance(hero, dict) or not isinstance(hero.get('by_url'), dict) or not isinstance(hero.get('images'), list):
        raise ValueError('Invalid hero-assignments.json structure')
    used_art = {p.get('thumb') for p in posts if p.get('thumb')}
    used_art.update(str(r.get('path')) for r in hero['by_url'].values() if isinstance(r, dict) and r.get('path'))
    image_index = {r.get('path'): r for r in hero['images'] if isinstance(r, dict)}
    used_art.update(k for k in image_index if k)
    existing_slugs = {p.get('id') or str(p.get('url', '')).strip('/').split('/')[-1] for p in posts}
    chosen = []
    for unit in units[:limit]:
        data = load_unit(unit, site, existing_slugs, used_art)
        used_art.add(data['thumb'])
        existing_slugs.add(data['slug'])
        chosen.append(data)
    new = []
    changes = {}
    for item in chosen:
        dt = now  # real publication timestamp; never fake historical backfill
        slug = item['slug']
        month = month_name(dt)
        rel = f'/blog/blog-posts/{month}/{slug}/'
        dest = site / rel.lstrip('/') / 'index.html'
        if dest.exists():
            raise FileExistsError(f'Will not overwrite an existing article page: {dest}')
        if (archive / item['source'].name).exists():
            raise FileExistsError(f'Queue archive already contains {item["source"].name}; resolve before publishing')
        p = {'id': slug, 'title': item['title'], 'url': rel,
             'description': item['description'], 'date': iso(dt),
             'category': item['category'], 'tags': item['tags'],
             'thumb': item['thumb'], 'hero_alt': item['hero_alt'],
             'status': 'published', 'historical_date_unverified': False}
        new.append(p)
        changes[dest] = make_post_html(p, item['prose']).encode('utf-8')
        for rel_asset, blob in item['extras'].items():
            asset_path = dest.parent / rel_asset
            if asset_path.exists():
                raise FileExistsError(f'Asset would overwrite existing file: {asset_path}')
            changes[asset_path] = blob
        key = rel.rstrip('/')
        hero['by_url'][key] = {'url': key, 'path': p['thumb'],
                               'filename': Path(p['thumb']).name, 'title': p['title'],
                               'topics': p['tags'], 'alt': p['hero_alt'],
                               'source': str(item['metadata'].get('art_source', 'editorial-provided')),
                               'subject': str(item['metadata'].get('art_subject', p['title']))}
        image_index[p['thumb']] = {'path': p['thumb'], 'alt': p['hero_alt'], 'publication_approved': True}
    hero['images'] = list(image_index.values())
    all_posts = posts + new
    changes.update(generate_files(site, catalog, all_posts, new, hero, now))
    changes[state_path] = json_bytes({'last_published_at': iso(now),
                                      'last_published_urls': [p['url'] for p in new]})
    mode = 'PUBLISH' if write else 'DRY RUN'
    print(f'[{mode}] {len(new)} new post(s); {len(all_posts)} total catalog records; {len(changes)} files to write')
    for p in new:
        print('  ', p['url'], '|', p['thumb'])
    if not write:
        print('No files written. Repeat with --publish to commit.')
        return len(new)
    transactional_write(site, changes)
    # Never delete a queued source. Archive only after successful site commit.
    archive.mkdir(parents=True, exist_ok=True)
    for item in chosen:
        source = item['source']
        try:
            shutil.move(str(source), str(archive / source.name))
            # Keep .txt sidecar metadata with its archived article.
            if source.suffix.lower() == '.txt':
                meta = source.with_suffix('.json')
                if meta.exists():
                    shutil.move(str(meta), str(archive / meta.name))
        except Exception as err:
            print(f'WARNING: published, but could not archive queue source {source}: {err}', file=sys.stderr)
    print(f'Committed {len(new)} post(s). Next scheduled slot: {iso(now + INTERVAL)}')
    return len(new)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--site', type=Path, default=Path(__file__).resolve().parents[1],
                        help='Website repo containing blog/ (default: script parent repo)')
    parser.add_argument('--tank', type=Path, help='Queue directory; ideally outside public site')
    parser.add_argument('--archive', type=Path, help='Processed queue archive directory')
    parser.add_argument('--publish', action='store_true', help='Actually write changes; otherwise dry run')
    parser.add_argument('--dry-run', action='store_true', help='Explicit preview-only mode')
    parser.add_argument('--force', action='store_true', help='Bypass 12-hour rate gate, not editorial approval')
    parser.add_argument('--limit', type=int, default=1, help='Max posts per invocation (default 1)')
    args = parser.parse_args(argv)
    if args.limit < 1:
        parser.error('--limit must be at least 1')
    if args.dry_run and args.publish:
        parser.error('--dry-run and --publish are mutually exclusive')
    site = args.site.resolve()
    tank = (args.tank or site / 'blog' / 'blog-posts' / '.tank').resolve()
    archive = (args.archive or site / 'blog' / 'blog-posts' / '.posted').resolve()
    if tank == archive or archive.is_relative_to(tank) or tank.is_relative_to(archive):
        parser.error('Tank and archive directories must not overlap')
    try:
        publish(site, tank, archive, args.limit, args.force, args.publish)
    except (OSError, ValueError, KeyError, ET.ParseError, TypeError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
