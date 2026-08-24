# GSKs (Glyph Sprite Keys)

Browser implementation draft of the manifest-described GSK format.

Pipeline: `SHA3-256(input) → RIPEMD160 → custom lowercase Base32`, with a six-byte SHA3-derived checksum and `gsk1-<payload>-<checksum>` text format.

Alphabet: `123456789abcdefghjkmnpqrstuvwxyz`, excluding `0`, `i`, `l`, and `o`.

This is an alpha GSK identifier/key-format draft and is not a Bitcoin private-key encoding or substitute for audited wallet standards.

Deploy directly into `/projects/software/gsk/`.

`logo.png` is intentionally omitted.
