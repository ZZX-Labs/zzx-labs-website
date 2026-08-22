<div align="center">
<img src="logo.png" alt="SynthLavaRNG" width="240" height="240">

# SynthLavaRNG


Lavarand/LavaRnd-inspired **visual-chaos entropy harvester** with a rolling **SHA3-256 pool** and **HMAC-DRBG (SHA3-256)**, with optional Bitcoin-derived BitRNG mixing.


**Version:** 1.0.0-web / 1.0-whitepaper  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D  
**Language:** Python 3.11+ / PyQt5 · JavaScript / Canvas / Web Crypto


## What it does

- Renders animated visual-chaos systems and continuously samples their evolving state
- Mixes sampled visual state into a rolling **SHA3-256 entropy pool**
- Mixes browser/OS-backed entropy from `crypto.getRandomValues()` by default
- Seeds and reseeds an **HMAC-DRBG using SHA3-256**
- Generates arbitrary random-byte output as **hex**, **Base64**, or raw binary
- Supports manual entropy input from user-supplied text, hashes, dice rolls, coin flips, or sensor data
- Optionally mixes public **Bitcoin tip / block / mempool state** as additional non-secret input
- Exposes all sixteen starting visual presets as functional browser simulations
- Runs entirely in-browser for the web edition, with no installation required


## Visual Presets

- **Lava Lamp** — metaball-style blobs with smooth motion and collision/boundary dynamics
- **Fireflies** — stochastic species-style flash patterns and drifting bioluminescent particles
- **Oil Projector (TF)** — psychedelic fluid-field animation with optional future TensorFlow.js texture input
- **Magnetic Field (TF)** — animated dipole/vector-field interference with optional ML-generated texture input
- **Jellyfish Swarm** — drifting bells, glow compositing, phase jitter, and animated tentacles
- **Rain Pond** — stochastic impacts, expanding ripple interference, and decay
- **Moss Growth (TF)** — persistent procedural branching/growth simulation with optional ML texture input
- **Crickets** — chirp-phase wave interference with optional browser Web Audio chirps
- **Kaleidoscope** — mirrored rotational stochastic geometry
- **Mandelbrot** — animated Mandelbrot zoom with moving center and jitter injection
- **Fractal Mirror** — evolving mirrored particle/fractal fields
- **Virtual Bonsai** — recursive procedural branching with stochastic wind deformation
- **Bird Flock** — boids-style separation, alignment, cohesion, and predator avoidance
- **Bat Hunt** — predator/prey swarm dynamics with bats pursuing insects
- **Mercury Maze** — procedurally generated maze with metallic droplets moving through valid channels
- **Gravity Equalized** — varying-mass bodies undergoing synchronized gravitational acceleration


## Install

### Native Python Edition

```bash
python -m venv .venv && . .venv/bin/activate
# Windows:
# .venv\Scripts\activate

pip install pyqt5
```

If the native repository provides a `requirements.txt`, prefer:

```bash
pip install -r requirements.txt
```

### Web Edition

No package installation is required.

Serve the project directory over HTTP/HTTPS:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```


## Run (Web)

Deploy or serve:

```text
/projects/software/synthlavarng/
```

The browser demo provides:

- visual preset selection
- animation start/stop
- automatic and manual harvesting
- SHA3-256 pool fingerprint display
- HMAC-DRBG reseeding
- random-byte generation
- manual entropy mixing
- optional Bitcoin-derived mixing
- raw-byte export


## Run (Native)

The native project is designed for:

```text
Python 3.11+
PyQt5
```

Use the repository's Python entry point for GUI or CLI execution.

The browser edition is not a replacement for native access to physical entropy hardware, unrestricted filesystem access, or privileged operating-system interfaces.


## Entropy Pipeline

Each harvest can combine:

```text
Canvas framebuffer sample
+ serialized preset simulation state
+ performance timing
+ wall-clock timing
+ frame counter
+ pointer state
+ active preset identifier
+ crypto.getRandomValues() bytes
+ optional manual input
+ optional public Bitcoin-derived input
```

The resulting material is mixed into the rolling pool:

```text
POOL(n+1) = SHA3-256(
    POOL(n)
    || domain-separation label
    || harvest metadata
    || harvested material
)
```


## SHA3-256

The web edition includes a local Keccak-f[1600] / SHA3-256 implementation using:

```text
Rate:       1088 bits / 136 bytes
Capacity:    512 bits
Output:      256 bits
Domain:      SHA-3 suffix 0x06
```

Startup self-tests validate against the canonical SHA3-256 vectors for:

```text
""
"abc"
```


## HMAC-DRBG

SynthLavaRNG uses an HMAC-DRBG construction with:

```text
Primitive: HMAC-SHA3-256
State:     K, V
Output:    arbitrary byte length
Reseed:    manual + scheduled + pool-driven
```

Generated output is derived from the DRBG rather than directly exposing the entropy-pool state.


## Bitcoin / BitRNG Mixing

The web edition may optionally fetch public Bitcoin network data such as:

```text
tip height
tip hash
mempool state
```

Public blockchain data is **additional mixing material only**.

It must not be treated as:

```text
secret entropy
a private seed
the sole source for Bitcoin private-key generation
```


---

## Directory layout

```text
synthlavarng/
├─ index.html
├─ style.css
├─ script.js
├─ synthlavarng.js
├─ hook.css
├─ hook.js
├─ manifest.json
├─ README.md
├─ logo.png
└─ images/
```


---

## JavaScript API

The project-specific browser port is exposed as:

```javascript
window.SynthLavaRNG
```

Core methods:

```javascript
SynthLavaRNG.start()
SynthLavaRNG.stop()
SynthLavaRNG.setPreset(id)

SynthLavaRNG.harvest()
SynthLavaRNG.mix(data, label)

SynthLavaRNG.reseed()
SynthLavaRNG.generate(byteCount)

SynthLavaRNG.sha3_256(data)
SynthLavaRNG.hmacSha3(key, data)

SynthLavaRNG.getStats()
SynthLavaRNG.selfTest()

SynthLavaRNG.registerTextureProvider(id, provider)
SynthLavaRNG.unregisterTextureProvider(id)
```


---

## Notes

The visual systems are algorithmic simulations and are **not claimed to be independent physical entropy sources**.

For browser operation, the root random source remains the operating-system-backed CSPRNG exposed through:

```javascript
crypto.getRandomValues()
```

Visual state, timing, pointer state, manual input, and Bitcoin-derived data are treated as additional mixing material.

For high-value Bitcoin keys or production cryptographic secrets, use an audited OS CSPRNG, hardware TRNG, or separately validated entropy architecture.


---

## Usage quickstart

- **Web**: open `/projects/software/synthlavarng/` → choose preset → `START`
- **Harvest**: select cadence → `HARVEST NOW` or allow automatic harvesting
- **Generate**: choose byte count and format → `GENERATE`
- **Manual entropy**: paste input → mix into the SHA3-256 pool
- **Bitcoin mix**: explicitly request public Bitcoin network data
- **Preset API**: `SynthLavaRNG.setPreset("mandelbrot")`
- **Random bytes**: `SynthLavaRNG.generate(32)`
