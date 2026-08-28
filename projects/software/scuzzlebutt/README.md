# Scuzzlebutt

`/projects/software/scuzzlebutt/`

Scuzzlebutt is a PDF-centric data aggregation and analysis system focused on identifying redactions, extracting surrounding metadata, and correlating repeated redaction patterns to build structured OSINT databases from large document corpora.

The browser companion computes SHA-256 for local PDFs, performs a limited raw structural-keyword scan for `/Subtype /Redact`, `/Annots`, `/Rect`, image objects, and object counts, accepts analyst observations, correlates repeated pattern labels, and exports a structured corpus.

It does not use OCR in the browser and does not claim to recover properly redacted text.

Version: `0.1.0-alpha`  
License: `MIT`
