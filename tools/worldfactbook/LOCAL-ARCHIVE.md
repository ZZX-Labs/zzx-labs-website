# Local Factbook book import

Use `import --reparse-text /path/to/book.epub` after changing the EPUB country parser to reuse extracted images while rebuilding the country and field records. Validate each book database before merging it into staging.

System Python 3.10+, PyMuPDF, Pillow and `tesseract` with English language data are required to parse all supplied PDFs, EPUBs and images. There is no Node, npm, React, or server side browser dependency. The PyQt5 desktop launcher in the companion `worlddata-project` offers the same import and export controls.

```bash
python3 -m pip install PyMuPDF Pillow
python3 tools/worldfactbook/local_ingest.py --db data/factbook_archive.sqlite --output worldfactbook import /path/to/1980s.zip
python3 tools/worldfactbook/local_ingest.py --db data/factbook_archive.sqlite --output worldfactbook import /path/to/1990s.zip /path/to/2000s.zip
python3 tools/worldfactbook/local_ingest.py --db data/factbook_archive.sqlite --output /path/to/staging import '/path/to/2010s selection.zip' /path/to/2020s.zip
python3 tools/worldfactbook/local_ingest.py --db data/factbook_archive.sqlite --output worldfactbook export --media-root /path/to/staging
python3 tools/worldfactbook/verify_country_archive.py --repo . --update-portal
```

Keep `data/factbook_archive.sqlite`, original books, and uncertain full-page scans outside the GitHub Pages deployment. The importer stores all extracted source variants in staging, assigns publication years using internal titles, preserves field labels and reported observation years, hashes every source, identifies page/image provenance, and flags unknown historical locations for review. A `--max-pdf-pages` test is always partial. Re-run changed source bytes with `--reprocess`.

`api/country-archive/index.json` contains the target years 1962–2027. Missing years remain `missing`; extracted but unreviewed years remain `partial`. Importing a decade does not fill other decades, or create future editions. Review each source against the original before marking a year complete. A review file under `worldfactbook/manual/reviews/YYYY.json` must contain:

```json
{
  "source_sha256": "SHA of source in the edition manifest",
  "digest": "extraction_digest in the edition manifest",
  "verified_fields": 0,
  "verified_countries": 0,
  "reviewed_all_pages_and_media": true,
  "media_rights_cleared": true
}
```

Fill actual counts. The exporter promotes an edition only if its full page and image counts match, issue list is empty, review signature matches current extraction, and applicable image rights have been cleared. Re-export with `--review-dir worldfactbook/manual/reviews` after signed review, then run `verify_country_archive.py` to confirm JSON/SQL part digests before portal status changes. The GitHub workflow runs the validator on changes; its failure leaves the public coverage status unchanged.

Each country/year may have additional numbered JSON and compressed SQL parts. The default part bounds are 512 KB and 2 MB respectively. `api/country-archive/editions/YYYY.json` lists source variants, holds, counts, hashes and review digest. Do not commit a staging database or large book originals to GitHub Pages. A deployment audit must include **all other site content** in the 1 GB Pages total; the site's existing Bitcoin archive currently leaves insufficient headroom for the full Factbook corpus.
