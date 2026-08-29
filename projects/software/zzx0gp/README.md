# ZZX-0GP

`/projects/software/zzx0gp/`

ZZX-0GP is a cryptographic framework inspired by GPG/PGP, using Base32 and Base58 encodings with customizable profiles and batch operations for identity management, message signing, and encryption tasks.

The browser implementation includes Base32/Base58 encoding, locally generated profile identifiers, SHA-256 digests, PBKDF2-derived AES-256-GCM encrypted envelopes, local decryption, and JSON export.

The included native helper generates new local Ed25519 identities. Existing private keys or secret keyrings are never requested.

Version: `0.3.0-alpha`
License: `MIT`
