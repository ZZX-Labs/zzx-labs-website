import feedparser
from flask import Blueprint, render_template_string

rss_feed = Blueprint('rss_feed', __name__)

@rss_feed.route('/rss', methods=['GET'])
def get_rss_feed():
    feed = feedparser.parse("http://localhost:5000/api/posts")
    rss_items = []

    for post in feed.entries:
        rss_items.append({
            "title": post.title,
            "link": post.link,
            "description": post.description,
            "pubDate": post.published
        })

    return render_template_string("""
        <?xml version="1.0" encoding="UTF-8" ?>
        <rss version="2.0">
            <channel>
                <title>ZZX Labs Blog</title>
                <link>http://localhost:5000</link>
                <description>Latest blog posts from ZZX Labs</description>
                {% for item in rss_items %}
                <item>
                    <title>{{ item.title }}</title>
                    <link>{{ item.link }}</link>
                    <description>{{ item.description }}</description>
                    <pubDate>{{ item.pubDate }}</pubDate>
                </item>
                {% endfor %}
            </channel>
        </rss>
    """, rss_items=rss_items)
