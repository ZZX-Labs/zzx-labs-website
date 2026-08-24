# Bitcoin EMIGNA Encoding System (BEES)

Bitcoin-focused encryption framework using EMIGNA rotor mechanics with layered authenticated encryption.

**Version:** 0.1.0-alpha  
**License:** MIT

The browser edition implements a reversible byte-oriented EMIGNA rotor stage, SHA3-256 fingerprints, structured Bitcoin backup records, and PBKDF2-HMAC-SHA256 + AES-256-GCM encrypted envelopes.

The rotor layer alone is experimental and should not be treated as modern authenticated encryption; BEES encrypted exports add AES-GCM for confidentiality/integrity.

Deploy directly into `/projects/software/bitcoinees/`.

`logo.png` is intentionally omitted until final artwork is supplied.
