# NaturaVA

`/projects/software/naturava/`

NaturaVA (Natura Video Archiver) is a large-scale video ingestion and management tool that performs de-duplication, tagging, and search across nature and wildlife archives.

## Browser implementation

The local-first archive companion provides:

- local video ingestion;
- SHA-256 fingerprints;
- exact duplicate grouping;
- duration and dimensions where browser codecs permit;
- filename-derived starter tags;
- species/taxa, location, date, and notes fields;
- archive search;
- JSON and CSV export.

No videos are uploaded by the static page.

The manifest-native stack uses SQLAlchemy, OpenCV, pandas, and FFmpeg for persistent catalogs, robust media probing, advanced deduplication, and optional AI classification.

Version: `0.2.0-alpha`  
License: `MIT`
