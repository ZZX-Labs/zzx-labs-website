"""ZZX-BLOG RSS endpoint.

Serves the pre-generated RSS 2.0 feed.
Feed generation is handled separately by the publishing pipeline.
"""
from pathlib import Path

from flask import Blueprint, abort, current_app, redirect, send_file

rss_feed = Blueprint("rss_feed", __name__)


@rss_feed.route("/blog/rss.xml", methods=["GET"])
def rss():
    site_root = Path(
        current_app.config.get("ZZX_SITE_ROOT")
        or current_app.root_path
    ).resolve()

    feed = site_root / "blog" / "rss.xml"

    if not feed.is_file():
        abort(404, description="RSS feed has not been generated")

    response = send_file(
        feed,
        mimetype="application/rss+xml",
        conditional=True
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@rss_feed.route("/rss", methods=["GET"])
def legacy_rss():
    return redirect("/blog/rss.xml", code=301)
