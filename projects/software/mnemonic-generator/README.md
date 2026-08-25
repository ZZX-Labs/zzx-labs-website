# Mnemonic Generator

`/projects/software/mnemonic-generator/`

Mnemonic Generator creates 12-, 16-, 24-, or 32-word seed phrases and short passphrases with entropy validation and printable card exports for secure cold storage.

## Browser implementation

The web companion supports the manifest-defined 12-, 16-, 24-, and 32-word selections.

It uses:

- `crypto.getRandomValues()` for local randomness;
- rejection sampling for unbiased wordlist indexes;
- an imported text wordlist;
- entropy estimates based on wordlist size;
- short passphrase generation;
- printable cold-storage cards;
- text-card export.

The browser intentionally does **not** include a field for importing an existing wallet seed.

## Specification boundary

The project manifest specifies `bip-utils`, but the requested 12/16/24/32 word-count set is not silently treated as a guarantee of BIP39 compatibility by the static page. The browser generator labels its output as custom unbiased word selection unless a future project specification defines the exact checksum/word-count rules.

For real wallet use, generate on a trusted offline system and verify compatibility with the target wallet before funding it.

Version: `0.1.0`  
License: `MIT`
