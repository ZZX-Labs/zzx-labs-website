# Fortune Cookie Phase Cipher (FCPC)

Functional browser reference for the FCPC layered envelope.

The phase-shift/null-injection layer is reversible obfuscation and is **not** treated as cryptographic security. The browser reference can optionally wrap the inner FCPC structure with PBKDF2-HMAC-SHA256 + AES-256-GCM. Native GPG command scaffolding is generated separately because this static page does not bundle GnuPG.

Deploy directly into `/projects/software/fcpc/`.

`logo.png` is intentionally omitted.
