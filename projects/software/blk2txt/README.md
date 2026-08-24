# blk2txt

Offline Bitcoin Core block-file decoder and deterministic text archiver.

**Version:** 0.1.0-alpha  
**License:** MIT

The browser edition reads user-selected raw block files or Bitcoin Core `blk*.dat` records completely offline. It parses block headers, transactions, txids, wtxids, vin/vout data, scripts, SegWit witness stacks, output values and OP_RETURN payloads. It also accepts `markers.json` annotations and exports deterministic text or JSON archives.

No block explorer or remote API is required.

Deploy directly into `/projects/software/blk2txt/`.

`logo.png` is intentionally omitted so existing artwork is not overwritten.
