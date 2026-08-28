# WireFeed

`/projects/software/wirefeed/`

RSS news and update feed GUI built in Python, offering keyword filtering, deduplication, overlay modes, and exportable lists for research dashboards.

The browser implementation parses RSS 2.0 and Atom XML from local files, pasted text, or CORS-enabled feed URLs; deduplicates items; filters by feed/keyword/exclusion; renders a compact overlay; and exports JSON/CSV.

The included native `feedparser` CLI handles normal URL/file retrieval without browser CORS restrictions.

Version: `0.3.0-alpha`
License: `MIT`
