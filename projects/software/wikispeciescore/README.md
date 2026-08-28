# WikiSpecies-Core

`/projects/software/wikispeciescore/`

Core schemas and loaders for offline species research—synchronizing WikiSpecies data with Speciedex for integrated taxonomy research and archival.

This deployment preserves the existing corrected Speciedex Wikispecies provider at `provider/wikispecies.py`. That provider performs MediaWiki discovery, resumable continuation, page enrichment, taxonomy parsing, provenance capture, raw payload preservation, and normalized `Taxon` emission.

The browser workbench adds local JSON/CSV inspection, normalization, rank/search filtering, Speciedex-compatible export, and synchronization-plan export.

Version: `0.2.0-alpha`
License: `MIT`
