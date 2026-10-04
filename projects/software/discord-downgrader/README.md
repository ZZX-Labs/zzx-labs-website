# Discord Downgrader

Browser companion for the Python + FFmpeg audio size-reduction utility.

The static page inspects local audio metadata, calculates a conservative target bitrate for a selected size, generates an FFmpeg command, verifies a converted output file, and exports batch plans.

Actual encoding remains a native FFmpeg task; no fake transcoder or FFmpeg-WASM bundle is claimed.

Deploy directly into `/projects/software/discord-downgrader/`.

`logo.png` is intentionally omitted.
