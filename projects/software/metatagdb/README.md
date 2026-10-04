# MetaTagDB

`/projects/software/metatagdb/`

MetaTagDB is an open metadata framework for auto-tagging, categorizing, fingerprinting, and analyzing video libraries. It’s local-first, extensible with AI modules, and supports deep metadata synchronization.

## Browser implementation

The local-first web companion provides:

- local image/video/audio library ingestion;
- SHA-256 fingerprints;
- filename-token metadata;
- duration and dimensions where browser codecs permit;
- dHash visual fingerprints for images and representative video frames;
- user tags and notes;
- local tag suggestions;
- exact-hash duplicate grouping;
- JSON and CSV export.

No files are uploaded by the static page.

## Native stack

The manifest specifies PyQt5, FFmpeg, Mutagen, SQLAlchemy, and OpenCV. Those components provide the native database, deep container/tag inspection, robust media probing, and optional AI extensions.

Version: `0.4.0-alpha`  
License: `MIT`
