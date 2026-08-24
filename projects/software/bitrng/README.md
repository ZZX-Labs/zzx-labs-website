# BitRNG

Bitcoin-augmented cryptographic RNG and entropy-testing suite.

**Version:** 0.1.0-alpha  
**License:** MIT

The browser CSPRNG is `crypto.getRandomValues()`. Bitcoin block hashes, transaction hashes, and measured endpoint latency are public/supplemental material only; they are never used as the sole source for key-grade randomness.

Features include live Esplora collection, SHA-256 seed mixing, deterministic HMAC-SHA256 streams, quick bias diagnostics, and audit export.

Deploy directly into:

```text
/projects/software/bitrng/
```

`logo.png` is intentionally omitted until final artwork is supplied.
