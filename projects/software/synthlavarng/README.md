# SynthLavaRNG

Browser-native project page for:

    /projects/software/synthlavarng/

SynthLavaRNG is a Lavarand/LavaRnd-inspired visual-chaos entropy research project. The native edition is designed around Python 3.11+ and PyQt5. This directory provides the install-free web mirror.

## Web implementation

The browser edition includes:

- animated Canvas implementations of the visual preset families;
- a rolling SHA3-256 entropy-mixing pool;
- an HMAC-DRBG construction using SHA3-256;
- periodic frame-state harvesting;
- operating-system-backed randomness through `crypto.getRandomValues()`;
- timing and pointer-state mixing;
- manual additional-input mixing;
- user-triggered Bitcoin tip/mempool mixing from `mempool.space`;
- hex, Base64, and Uint32 random-output views;
- raw-byte export;
- a manifest-driven project page, preset catalog, tags, versions, gallery, and parity table.

No network request is made by the entropy engine automatically. Bitcoin data is fetched only when the user presses the BitRNG mix button.

## Important entropy distinction

The web visualizations are algorithmic simulations. They are not claimed to reproduce a physical lava lamp, camera noise, avalanche-noise diode, radioactive source, or another independent physical entropy source.

For that reason, the web build defaults to mixing `crypto.getRandomValues()` into every harvest. Canvas state, frame timing, pointer state, and optional Bitcoin data are additional inputs.

Public Bitcoin blockchain and mempool data are observable by third parties and must never be treated as secret entropy or as the sole seed for a private key.

## SHA3-256

The browser build includes an internal Keccak-f[1600] / SHA3-256 implementation because SHA3-256 is not universally exposed by the Web Crypto API.

The implementation uses:

    rate = 1088 bits / 136 bytes
    capacity = 512 bits
    output = 256 bits
    SHA-3 domain suffix = 0x06

## HMAC-DRBG

The DRBG follows the familiar HMAC-DRBG update/generate construction while using HMAC-SHA3-256 as its primitive.

This is useful for research and parity with the SynthLavaRNG design, but this browser implementation has not been independently audited or validated as a certified NIST DRBG module.

## Public JavaScript API

The page exposes:

    window.SynthLavaRNG

Useful methods:

    SynthLavaRNG.start()
    SynthLavaRNG.stop()
    SynthLavaRNG.harvest()
    SynthLavaRNG.reseed()
    SynthLavaRNG.generate(byteCount)
    SynthLavaRNG.mix(data, label)
    SynthLavaRNG.sha3(data)
    SynthLavaRNG.hmac(key, data)
    SynthLavaRNG.getStats()

The page also exposes the shared site integration hook:

    window.ZZXHooks.on(name, handler)
    window.ZZXHooks.emit(name, payload)

## Files

    index.html
    style.css
    script.js
    hook.css
    hook.js
    manifest.json
    README.md.txt
    logo.png              existing project asset
    images/               optional screenshots/gallery assets

## Deployment

Serve this directory over HTTPS at:

    https://zzx-labs.io/projects/software/synthlavarng/

HTTPS is required for the strongest browser platform guarantees and for normal Web Crypto behavior.

Keep the global site assets at:

    /static/styles.css
    /static/script.js

The local files are deliberately self-contained enough that the project module remains understandable and maintainable independently of site-wide chrome.

## Security posture

This project is suitable as an entropy-system demonstrator, research tool, visualization engine, and browser parity layer.

For high-value Bitcoin keys or production cryptographic secrets, root trust should remain in an audited OS CSPRNG, hardware TRNG, or a separately validated entropy architecture. The simulated visuals should be treated as mixing material, not as proof of independent entropy.
