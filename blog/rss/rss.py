"""Optional replacement for blog/rss.py: no feedparser or localhost HTTP call.
Register rss_feed Blueprint; feed is generated from verified source offline.
"""
from pathlib import Path
from flask import Blueprint, current_app, send_file, abort, redirect
rss_feed=Blueprint('rss_feed',__name__)
@rss_feed.get('/blog/rss.xml')
def rss():
    site=Path(current_app.config.get('ZZX_SITE_ROOT') or current_app.root_path)
    feed=site/'blog/rss.xml'
    if not feed.is_file(): abort(404)
    return send_file(feed,mimetype='application/rss+xml')
@rss_feed.get('/rss')
def legacy_rss():return redirect('/blog/rss.xml',code=301)
