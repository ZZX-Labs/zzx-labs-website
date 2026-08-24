# Blinkee Optical File System (BOFS)

Frame-sequenced optical file-system protocol reference implementation.

**Version:** 0.1.0-alpha  
**License:** MIT  
**Category:** protocol

The browser edition builds multi-file BOFS volumes with SHA-256 file indexes, deterministic frame sequencing, XOR parity groups, optional sequence-copy metadata, BQRES-compatible optical playback, one-missing-data-frame recovery, and portable `.bofs.json` archives.

The ISO-oriented profile records volume/file-table intent but does not claim to generate an ISO-9660 binary disk image.

Deploy directly into `/projects/software/bofs/`.

`logo.png` is intentionally omitted until final artwork is supplied.
