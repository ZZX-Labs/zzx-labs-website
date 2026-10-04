# ZZX GitHub Stats

`/projects/software/zzx-github-stats/`

Self-hosted GitHub analytics and reporting dashboard that generates SVG-based statistics and summaries without third-party tracking. Built for reproducible project telemetry and privacy-preserving publication.

The browser dashboard imports GitHub repository JSON, computes repository/star/fork/issue/language summaries, renders a deterministic self-hosted SVG statistics card, and exports SVG/JSON/Markdown without third-party tracking.

The optional native helper fetches public GitHub repository metadata; if `GITHUB_TOKEN` is set it is read from the environment rather than embedded in site files.

Version: `1.0.0`
License: `MIT`
