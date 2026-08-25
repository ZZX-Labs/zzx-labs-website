# PhaseCipherEncoding (PCE) Systems

`/projects/software/pce/`

PhaseCipherEncoding (PCE) — advanced cryptographic encoding framework using phase-shift, frequency, and waveform interference patterns to represent encrypted data. Combines phase modulation with spectral nulls, salting, and pebbling effects for quantum-resistant ciphertext generation. Supports Base128/256 and Unicode null-symbol injection to obfuscate entropy layers and encode multi-dimensional cryptographic sequences.

**INTERNAL – Not for public distribution.**

## Reference implementation

The browser build intentionally separates real cryptographic security from experimental encoding:

1. plaintext is encrypted with AES-256-GCM;
2. a PBKDF2-SHA256 key is derived from the passphrase;
3. ciphertext bytes are mapped to deterministic phase/amplitude symbols;
4. symbols can be visualized and converted back to ciphertext;
5. AES-GCM verifies/decrypts the payload.

The phase wrapper is not represented as an independently secure cipher and this build makes no unverified claim of quantum resistance.

Native dependencies: `python3, numpy, scipy, pyqt5, cryptography, ffmpeg, matplotlib`.

Version: `0.1.0-alpha`  
License: `MIT`
