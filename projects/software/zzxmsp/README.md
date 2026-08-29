# ZZX-MSP

`/projects/software/zzxmsp/`

Mnemonic Seed Phrase Standard — an open, high-entropy, alphabetically indexed mnemonic system designed as a BIP39 alternative for wallets, cold storage, and identity anchoring.

This deployment implements the experimental mnemonic-workbench layer without pretending the draft format is BIP39-compatible. Users may import a canonical candidate wordlist, verify uniqueness, generate **new** local entropy with Web Crypto, map indices, inspect a checksum, round-trip words/indices, and export the experimental record.

The included synthetic sample lexicon exists only for demonstration. Existing wallet seeds/private keys are never requested, and generated output is explicitly marked non-production until the standard and wordlist are finalized and reviewed.

Version: `0.2.0-alpha`
License: `MIT`
