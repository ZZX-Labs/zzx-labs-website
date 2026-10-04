# Manual World Factbook editions

This tree is the provenance-controlled entry point for physical or locally scanned editions.
It is intentionally separate from downloaded Internet Archive / Wayback evidence.

For each physical edition, create one directory under `editions/`, for example
`2025-2026/` or `2026-2027/`.  Copy `manifest.example.json` to `manifest.json`, enter the
bibliographic/provenance fields, and list each manually transcribed or locally scanned source
file under `sources/`.

The crawler maps an edition label to a normalized integer `edition_year` used by the existing
portal APIs.  `2025-2026` therefore uses `edition_year: 2026`; `2026-2027` uses `2027`.
The human-readable `edition_label` is retained in source provenance.

Recommended manual source formats are UTF-8 `.txt`, `.html`, `.json`, or `.csv`.  Scanned PDF
is accepted, but text transcription is preferable for deterministic parsing.  Never overwrite
or silently correct archival source text; put editorial notes in the manifest.
