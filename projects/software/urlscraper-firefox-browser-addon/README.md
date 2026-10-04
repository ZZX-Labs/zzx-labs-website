# URLScraper (Firefox Add-on)

`/projects/software/urlscraper-firefox-browser-addon/`

URLScraper is a Firefox extension that backs up all open tabs/URLs to TXT, CSV, JSON, or SQL with filters, de-duplication, tagging, and session-friendly exports.

This package includes both the standardized website workbench and functional Firefox WebExtension source under `addon/`.

The extension queries open tabs with the WebExtensions `tabs` API, supports filtering/de-duplication/tagging, and exports through the `downloads` API as TXT, CSV, JSON, or SQL. The website companion supports the same data model through pasted/imported sessions.

Version: `0.3.0-alpha`
License: `MIT`
