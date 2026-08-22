(() => {
  "use strict";

  const PRESETS = [
    { id: "lava", name: "Lava Lamp", description: "Metaball blobs with smooth motion and collisions. Baseline entropy source." },
    { id: "fireflies", name: "Fireflies", description: "Species-specific flash patterns create stochastic bioluminescent bursts." },
    { id: "oil", name: "Oil Projector (TF)", description: "Retro psychedelic fluid fields with procedural textures and an optional ML texture-provider hook." },
    { id: "magnetic", name: "Magnetic Field (TF)", description: "Ferrofluid-inspired vector curls and dipole field interference with an optional ML texture-provider hook." },
    { id: "jellyfish", name: "Jellyfish Swarm", description: "Organic bioluminescent swarm motion with glow trails and phase jitter." },
    { id: "rain", name: "Rain Pond", description: "Raindrop ripple interference with evolving wave centers and decay." },
    { id: "moss", name: "Moss Growth (TF)", description: "Procedural bio-growth simulation with an optional ML texture-provider hook." },
    { id: "crickets", name: "Crickets", description: "Chirp-phase wave interference with optional Web Audio chirps and Doppler-like modulation." },
    { id: "kaleidoscope", name: "Kaleidoscope", description: "Symmetry-mirrored stochastic textures and rotational phase drift." },
    { id: "mandelbrot", name: "Mandelbrot", description: "Animated fractal zooms with continuously jittered center and scale parameters." },
    { id: "fractalMirror", name: "Fractal Mirror", description: "Rorschach-like mirrored fractal particle fields." },
    { id: "bonsai", name: "Virtual Bonsai", description: "Recursive procedural branching with stochastic wind deformation." },
    { id: "birds", name: "Bird Flock", description: "Boids-style emergent flocking with separation, alignment, cohesion, and predator avoidance." },
    { id: "bats", name: "Bat Hunt", description: "Predator-prey swarm dynamics: bats pursue insects while insects evade." },
    { id: "mercury", name: "Mercury Maze", description: "Procedural maze channels solved by metallic droplets following local flow fields." },
    { id: "gravity", name: "Gravity Equalized", description: "Different-mass bodies share equivalent gravitational acceleration while drag and jitter perturb their paths." }
  ];

  const module = {
    slug: "synthlavarng",
    title: "SynthLavaRNG",
    version: "1.1.0-web",
    source: "manifest.json",
    actions: [
      {
        id: "synthlava-engine",
        type: "visual-rng",
        name: "SynthLavaRNG Engine",
        description: "All 16 initial SynthLavaRNG presets with live Canvas rendering, simulation-state harvesting, SHA3-256 pool mixing, and HMAC-DRBG (SHA3-256).",
        notes: "Visual simulations are additional mixing material. crypto.getRandomValues() remains enabled by default as the OS-backed entropy root.",
        web: "yes"
      },
      {
        id: "secure-random-generator",
        type: "random",
        name: "OS CSPRNG",
        description: "Generate random bytes directly from crypto.getRandomValues().",
        notes: "Independent of the SynthLavaRNG pool and useful as a baseline comparison.",
        web: "yes"
      },
      {
        id: "sha-256-lab",
        type: "hash",
        name: "SHA-256 Lab",
        description: "Hash arbitrary text locally using Web Crypto SHA-256.",
        notes: "This is a general utility; the SynthLavaRNG entropy pool itself uses SHA3-256.",
        web: "yes"
      },
      {
        id: "local-file-inspector",
        type: "file-inspector",
        name: "Local File Inspector",
        description: "Inspect and hash a user-selected file locally without uploading it.",
        notes: "Useful for adding file-derived material through the public SynthLavaRNG API.",
        web: "yes"
      }
    ],
    mount() {
      const tab = [...document.querySelectorAll(".tool-tab")]
        .find((node) => node.dataset.action === "synthlava-engine");
      if (!tab) return;

      const override = () => queueMicrotask(renderWorkbench);
      if (!tab.dataset.synthlavaBound) {
        tab.dataset.synthlavaBound = "1";
        tab.addEventListener("click", override);
      }
      if (tab.classList.contains("active")) override();
    }
  };

  // ------------------------------------------------------------------
  // SHA3-256 / Keccak-f[1600]
  // ------------------------------------------------------------------

  const MASK64 = (1n << 64n) - 1n;
  const ROT = [
     0,  1, 62, 28, 27,
    36, 44,  6, 55, 20,
     3, 10, 43, 25, 39,
    41, 45, 15, 21,  8,
    18,  2, 61, 56, 14
  ];
  const RC = [
    0x0000000000000001n, 0x0000000000008082n,
    0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n,
    0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n,
    0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn,
    0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n,
    0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n,
    0x0000000080000001n, 0x8000000080008008n
  ];

  const encoder = new TextEncoder();

  function bytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (typeof input === "string") return encoder.encode(input);
    if (input == null) return new Uint8Array(0);
    return encoder.encode(JSON.stringify(input));
  }

  function concat(...parts) {
    const arrays = parts.map(bytes);
    const out = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
    let offset = 0;
    for (const a of arrays) {
      out.set(a, offset);
      offset += a.length;
    }
    return out;
  }

  function rotl64(x, n) {
    const k = BigInt(n);
    return k === 0n ? x & MASK64 : ((x << k) | (x >> (64n - k))) & MASK64;
  }

  function keccakF(a) {
    const b = new Array(25).fill(0n);
    const c = new Array(5).fill(0n);
    const d = new Array(5).fill(0n);

    for (let round = 0; round < 24; round++) {
      for (let x = 0; x < 5; x++) {
        c[x] = a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20];
      }
      for (let x = 0; x < 5; x++) {
        d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
      }
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          a[x + 5 * y] = (a[x + 5 * y] ^ d[x]) & MASK64;
        }
      }
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          const src = x + 5 * y;
          b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(a[src], ROT[src]);
        }
      }
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          const i = x + 5 * y;
          const i1 = ((x + 1) % 5) + 5 * y;
          const i2 = ((x + 2) % 5) + 5 * y;
          a[i] = (b[i] ^ ((~b[i1] & MASK64) & b[i2])) & MASK64;
        }
      }
      a[0] = (a[0] ^ RC[round]) & MASK64;
    }
  }

  function sha3_256(input) {
    const source = bytes(input);
    const rate = 136;
    const paddedLength = Math.max(rate, Math.ceil((source.length + 1) / rate) * rate);
    const padded = new Uint8Array(paddedLength);
    padded.set(source);
    padded[source.length] ^= 0x06;
    padded[padded.length - 1] ^= 0x80;

    const a = new Array(25).fill(0n);
    for (let offset = 0; offset < padded.length; offset += rate) {
      for (let i = 0; i < rate; i++) {
        const lane = Math.floor(i / 8);
        a[lane] ^= BigInt(padded[offset + i]) << BigInt((i % 8) * 8);
      }
      keccakF(a);
    }

    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = Number((a[Math.floor(i / 8)] >> BigInt((i % 8) * 8)) & 0xffn);
    }
    return out;
  }

  function hmacSha3(keyInput, dataInput) {
    const blockSize = 136;
    let key = bytes(keyInput);
    if (key.length > blockSize) key = sha3_256(key);

    const k = new Uint8Array(blockSize);
    k.set(key);
    const ipad = new Uint8Array(blockSize);
    const opad = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
      ipad[i] = k[i] ^ 0x36;
      opad[i] = k[i] ^ 0x5c;
    }
    return sha3_256(concat(opad, sha3_256(concat(ipad, bytes(dataInput)))));
  }

  class HmacDrbgSha3 {
    constructor(seed) {
      this.K = new Uint8Array(32);
      this.V = new Uint8Array(32).fill(0x01);
      this.reseedCounter = 1;
      this.update(seed);
    }

    update(provided = null) {
      const data = provided ? bytes(provided) : new Uint8Array(0);
      this.K = hmacSha3(this.K, concat(this.V, new Uint8Array([0x00]), data));
      this.V = hmacSha3(this.K, this.V);
      if (data.length) {
        this.K = hmacSha3(this.K, concat(this.V, new Uint8Array([0x01]), data));
        this.V = hmacSha3(this.K, this.V);
      }
    }

    reseed(seed) {
      this.update(seed);
      this.reseedCounter = 1;
    }

    generate(count, additional = null) {
      if (!Number.isInteger(count) || count < 1 || count > 1048576) {
        throw new RangeError("DRBG request must be 1..1,048,576 bytes.");
      }
      if (additional && bytes(additional).length) this.update(additional);

      const out = new Uint8Array(count);
      let offset = 0;
      while (offset < count) {
        this.V = hmacSha3(this.K, this.V);
        const take = Math.min(this.V.length, count - offset);
        out.set(this.V.subarray(0, take), offset);
        offset += take;
      }
      this.update(additional);
      this.reseedCounter++;
      return out;
    }
  }

  // ------------------------------------------------------------------
  // Engine state / entropy pool
  // ------------------------------------------------------------------

  const S = {
    running: false,
    mounted: false,
    raf: 0,
    frame: 0,
    harvests: 0,
    mixedBytes: 0,
    reseeds: 0,
    outputs: 0,
    busy: false,
    preset: "lava",
    seed: 0x9e3779b9,
    pool: new Uint8Array(32),
    drbg: null,
    lastOutput: new Uint8Array(0),
    pointer: { x: 0.5, y: 0.5, t: 0, moves: 0 },
    objects: [],
    flock: [],
    prey: [],
    bats: [],
    ripples: [],
    moss: [],
    maze: null,
    mercuryDrops: [],
    textureProviders: new Map(),
    audioContext: null,
    audioEnabled: false,
    sampleCanvas: document.createElement("canvas"),
    sampleCtx: null
  };
  S.sampleCanvas.width = 24;
  S.sampleCanvas.height = 14;
  S.sampleCtx = S.sampleCanvas.getContext("2d", { willReadFrequently: true });

  function secureRandom(count) {
    const out = new Uint8Array(count);
    crypto.getRandomValues(out);
    return out;
  }

  function hex(data) {
    return Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function base64(data) {
    let binary = "";
    for (let i = 0; i < data.length; i += 0x8000) {
      binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function u64(value) {
    let n = BigInt(Math.max(0, Math.floor(Number(value) || 0)));
    const out = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      out[i] = Number(n & 0xffn);
      n >>= 8n;
    }
    return out;
  }

  function mix(input, label = "generic") {
    const data = bytes(input);
    S.pool = sha3_256(concat(
      S.pool,
      encoder.encode(`SynthLavaRNG:${label}:`),
      u64(S.harvests),
      u64(Math.floor(performance.now() * 1000)),
      data
    ));
    S.harvests++;
    S.mixedBytes += data.length;
    updateStats();
    window.ZZXHooks?.emit("synthlavarng:mix", {
      label,
      bytes: data.length,
      pool: hex(S.pool)
    });
    return S.pool;
  }

  function reseed(reason = "manual") {
    const material = sha3_256(concat(
      S.pool,
      secureRandom(32),
      encoder.encode(`reseed:${reason}`),
      u64(Date.now())
    ));
    if (!S.drbg) S.drbg = new HmacDrbgSha3(material);
    else S.drbg.reseed(material);
    S.reseeds++;
    S.pool = sha3_256(concat(S.pool, material, encoder.encode(reason)));
    updateStats();
    log(`DRBG reseeded (${reason}).`);
  }

  function generate(count) {
    if (!S.drbg) reseed("initial");
    const additional = sha3_256(concat(S.pool, secureRandom(16), u64(S.outputs), u64(Date.now())));
    const out = S.drbg.generate(count, additional);
    S.lastOutput = out;
    S.outputs++;
    S.pool = sha3_256(concat(S.pool, sha3_256(out), encoder.encode("output-feedback")));
    updateStats();
    return out;
  }

  function rand() {
    let x = S.seed >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    S.seed = x >>> 0;
    return S.seed / 0x100000000;
  }

  function reseedVisualState() {
    const seed = secureRandom(4);
    S.seed = new DataView(seed.buffer).getUint32(0, true) || 0x9e3779b9;
    S.objects = [];
    S.flock = [];
    S.prey = [];
    S.bats = [];
    S.ripples = [];
    S.moss = [];
    S.maze = null;
    S.mercuryDrops = [];

    for (let i = 0; i < 36; i++) {
      S.objects.push({
        x: rand(), y: rand(),
        vx: (rand() - .5) * .005,
        vy: (rand() - .5) * .005,
        r: .015 + rand() * .06,
        phase: rand() * Math.PI * 2,
        species: i % 3
      });
    }

    for (let i = 0; i < 52; i++) {
      S.flock.push({ x: rand(), y: rand(), vx: (rand()-.5)*.005, vy: (rand()-.5)*.005 });
    }

    for (let i = 0; i < 100; i++) {
      S.prey.push({ x: rand(), y: rand(), vx: (rand()-.5)*.006, vy: (rand()-.5)*.006 });
    }

    for (let i = 0; i < 5; i++) {
      S.bats.push({ x: rand(), y: rand(), vx: (rand()-.5)*.007, vy: (rand()-.5)*.007 });
    }

    mix(seed, "visual-seed");
  }

  // ------------------------------------------------------------------
  // Workbench UI
  // ------------------------------------------------------------------

  function el(id) { return document.getElementById(id); }

  function renderWorkbench() {
    const header = el("tool-header");
    const body = el("tool-body");
    if (!header || !body) return;

    stop();
    header.innerHTML = `
      <p class="kicker">SYNTHLAVARNG WEB ENGINE</p>
      <h2>Visual Chaos Entropy Harvester</h2>
      <p class="tool-description">Sixteen functioning visual/simulation presets feed one local SHA3-256 pool and HMAC-DRBG (SHA3-256). Visual state is additional mixing input; the browser OS CSPRNG is mixed by default.</p>
    `;

    body.innerHTML = `
      <div class="synthlava-app">
        <div class="synthlava-visual">
          <div class="synthlava-canvas-frame">
            <canvas id="synthlava-canvas" width="960" height="540" aria-label="SynthLavaRNG visual entropy renderer"></canvas>
            <div class="synthlava-hud"><span id="sl-preset-name">Lava Lamp</span><span id="sl-state">STOPPED</span></div>
          </div>

          <div class="tool-card synthlava-controls">
            <div class="tool-grid">
              <label>Preset<select id="sl-preset"></select></label>
              <label>Harvest cadence
                <select id="sl-cadence">
                  <option value="1">Every frame</option>
                  <option value="2">Every 2 frames</option>
                  <option value="4" selected>Every 4 frames</option>
                  <option value="8">Every 8 frames</option>
                  <option value="16">Every 16 frames</option>
                  <option value="30">Every 30 frames</option>
                </select>
              </label>
            </div>

            <label class="sl-check"><input id="sl-csprng" type="checkbox" checked> Mix crypto.getRandomValues() into every harvest</label>
            <label class="sl-check"><input id="sl-audio" type="checkbox"> Enable Cricket preset audio chirps</label>

            <div class="button-row">
              <button id="sl-start" class="btn" type="button">START</button>
              <button id="sl-stop" class="btn ghost" type="button">STOP</button>
              <button id="sl-harvest" class="btn ghost" type="button">HARVEST NOW</button>
              <button id="sl-reseed" class="btn ghost" type="button">RESEED</button>
            </div>
          </div>
        </div>

        <div class="synthlava-engine">
          <div class="synthlava-stats">
            <div><span>FRAME</span><strong id="sl-frame">0</strong></div>
            <div><span>HARVESTS</span><strong id="sl-harvests">0</strong></div>
            <div><span>MIXED BYTES</span><strong id="sl-mixed">0</strong></div>
            <div><span>RESEEDS</span><strong id="sl-reseeds">0</strong></div>
            <div><span>OUTPUTS</span><strong id="sl-outputs">0</strong></div>
            <div><span>ENTROPY CLAIM</span><strong>NOT ASSERTED</strong></div>
          </div>

          <div class="tool-card">
            <h3>SHA3-256 Pool Fingerprint</h3>
            <code id="sl-pool" class="sl-pool"></code>
          </div>

          <div class="tool-card">
            <h3>HMAC-DRBG Output</h3>
            <div class="tool-grid">
              <label>Bytes<input id="sl-count" type="number" min="1" max="65536" value="32"></label>
              <label>Format<select id="sl-format"><option value="hex">Hex</option><option value="base64">Base64</option></select></label>
            </div>
            <div class="button-row">
              <button id="sl-generate" class="btn" type="button">GENERATE</button>
              <button id="sl-copy" class="btn ghost" type="button">COPY</button>
              <button id="sl-save" class="btn ghost" type="button">SAVE RAW</button>
            </div>
            <textarea id="sl-output" readonly spellcheck="false"></textarea>
          </div>

          <div class="tool-card">
            <h3>Manual Mix</h3>
            <textarea id="sl-manual" spellcheck="false" placeholder="Paste coin flips, dice rolls, sensor readings, text, hashes, or other user-controlled material…"></textarea>
            <div class="button-row"><button id="sl-mix-manual" class="btn ghost" type="button">MIX INTO POOL</button></div>
          </div>

          <div class="tool-card">
            <h3>Engine Log</h3>
            <pre id="sl-log" class="tool-output"></pre>
          </div>
        </div>
      </div>
    `;

    const select = el("sl-preset");
    for (const p of PRESETS) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    }
    select.value = S.preset;

    bindUI();
    S.mounted = true;
    ensureInitialized();
    setPreset(S.preset);
    renderOnce();
    updateStats();
    log("SynthLavaRNG browser engine ready.");
    log("16/16 initial preset renderers loaded.");
  }

  function bindUI() {
    el("sl-start")?.addEventListener("click", start);
    el("sl-stop")?.addEventListener("click", stop);
    el("sl-harvest")?.addEventListener("click", () => harvest("manual"));
    el("sl-reseed")?.addEventListener("click", () => reseed("manual-button"));
    el("sl-preset")?.addEventListener("change", (e) => setPreset(e.target.value));
    el("sl-audio")?.addEventListener("change", async (e) => {
      S.audioEnabled = !!e.target.checked;
      if (S.audioEnabled) await ensureAudio();
      else stopAudio();
    });
    el("sl-generate")?.addEventListener("click", () => {
      try {
        const count = Math.max(1, Math.min(65536, Number(el("sl-count").value) || 32));
        const out = generate(count);
        el("sl-output").value = el("sl-format").value === "base64" ? base64(out) : hex(out);
        log(`generated ${count} DRBG bytes.`);
      } catch (error) { log(`ERROR: ${error.message}`); }
    });
    el("sl-copy")?.addEventListener("click", async () => {
      const text = el("sl-output").value;
      if (!text) return;
      try { await navigator.clipboard.writeText(text); log("output copied."); }
      catch { el("sl-output").select(); document.execCommand("copy"); log("output copied (compatibility path)."); }
    });
    el("sl-save")?.addEventListener("click", () => {
      if (!S.lastOutput.length) return log("no generated raw bytes to save.");
      const blob = new Blob([S.lastOutput], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `synthlavarng-${Date.now()}-${S.lastOutput.length}b.bin`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      log(`saved ${S.lastOutput.length} raw bytes.`);
    });
    el("sl-mix-manual")?.addEventListener("click", () => {
      const value = el("sl-manual").value;
      if (!value) return log("manual mix skipped: empty input.");
      mix(value, "manual");
      reseed("manual-mix");
      log(`mixed ${encoder.encode(value).length} manual bytes.`);
    });

    const canvas = el("synthlava-canvas");
    canvas?.addEventListener("pointermove", (event) => {
      const r = canvas.getBoundingClientRect();
      S.pointer.x = (event.clientX - r.left) / Math.max(1, r.width);
      S.pointer.y = (event.clientY - r.top) / Math.max(1, r.height);
      S.pointer.t = performance.now();
      S.pointer.moves++;
    }, { passive: true });
  }

  function ensureInitialized() {
    if (S.drbg) return;
    runSelfTests();
    reseedVisualState();
    S.pool = sha3_256(concat(
      S.pool,
      secureRandom(64),
      encoder.encode(navigator.userAgent),
      new Uint8Array(new Float64Array([performance.now(), Date.now()]).buffer)
    ));
    S.drbg = new HmacDrbgSha3(S.pool);
    S.reseeds = 1;
  }

  function runSelfTests() {
    const vectors = [
      ["", "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a"],
      ["abc", "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532"]
    ];
    for (const [msg, expected] of vectors) {
      const actual = hex(sha3_256(msg));
      if (actual !== expected) throw new Error(`SHA3-256 self-test failed: ${JSON.stringify(msg)}`);
    }
  }

  function log(message) {
    const out = el("sl-log");
    if (!out) return;
    const stamp = new Date().toISOString().slice(11, 23);
    out.textContent += `[${stamp}] ${message}\n`;
    if (out.textContent.length > 40000) out.textContent = out.textContent.slice(-30000);
    out.scrollTop = out.scrollHeight;
  }

  function updateStats() {
    if (!S.mounted) return;
    if (el("sl-frame")) el("sl-frame").textContent = S.frame.toLocaleString();
    if (el("sl-harvests")) el("sl-harvests").textContent = S.harvests.toLocaleString();
    if (el("sl-mixed")) el("sl-mixed").textContent = S.mixedBytes.toLocaleString();
    if (el("sl-reseeds")) el("sl-reseeds").textContent = S.reseeds.toLocaleString();
    if (el("sl-outputs")) el("sl-outputs").textContent = S.outputs.toLocaleString();
    if (el("sl-pool")) el("sl-pool").textContent = hex(S.pool);
  }

  // ------------------------------------------------------------------
  // Entropy harvesting
  // ------------------------------------------------------------------

  function serializeSimulationState() {
    const preset = S.preset;
    let payload;

    if (preset === "birds") payload = S.flock;
    else if (preset === "bats") payload = { bats: S.bats, prey: S.prey.slice(0, 40) };
    else if (preset === "rain") payload = S.ripples;
    else if (preset === "moss" || preset === "bonsai") payload = S.moss.slice(-180);
    else if (preset === "mercury") payload = { drops: S.mercuryDrops, mazeHash: S.maze?.hash || 0 };
    else payload = S.objects.slice(0, 24);

    return encoder.encode(JSON.stringify({ preset, frame: S.frame, payload }));
  }

  async function harvest(reason = "automatic") {
    if (S.busy || !S.mounted) return;
    S.busy = true;
    try {
      const canvas = el("synthlava-canvas");
      if (!canvas) return;

      S.sampleCtx.drawImage(canvas, 0, 0, S.sampleCanvas.width, S.sampleCanvas.height);
      const pixels = S.sampleCtx.getImageData(0, 0, S.sampleCanvas.width, S.sampleCanvas.height).data;
      const timing = new Float64Array([
        performance.now(), Date.now(), S.frame,
        S.pointer.x, S.pointer.y, S.pointer.t, S.pointer.moves
      ]);
      const root = el("sl-csprng")?.checked !== false ? secureRandom(32) : new Uint8Array(0);
      const simulation = serializeSimulationState();

      mix(concat(
        new Uint8Array(pixels.buffer),
        new Uint8Array(timing.buffer),
        simulation,
        root,
        encoder.encode(S.preset)
      ), `frame:${reason}:${S.preset}`);

      if (S.harvests % 64 === 0) reseed("scheduled");
    } finally {
      S.busy = false;
    }
  }

  // ------------------------------------------------------------------
  // Rendering utilities
  // ------------------------------------------------------------------

  function canvasContext() {
    const canvas = el("synthlava-canvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(320, Math.floor(rect.width || 960));
    const cssH = Math.max(180, Math.floor(cssW * 9 / 16));
    const w = Math.floor(cssW * dpr);
    const h = Math.floor(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas, ctx, w: cssW, h: cssH };
  }

  function clear(ctx, w, h, alpha = 1) {
    ctx.fillStyle = `rgba(5,6,8,${alpha})`;
    ctx.fillRect(0, 0, w, h);
  }

  function green(alpha = 1, shift = 0) {
    return `hsla(${78 + shift},62%,62%,${alpha})`;
  }

  function amber(alpha = 1, shift = 0) {
    return `hsla(${37 + shift},78%,54%,${alpha})`;
  }

  function wrap(p) {
    p.x = (p.x + 1) % 1;
    p.y = (p.y + 1) % 1;
  }

  // ------------------------------------------------------------------
  // Preset renderers — all sixteen are independently functional.
  // ------------------------------------------------------------------

  function renderLava(ctx, w, h, t) {
    clear(ctx, w, h, .24);
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 12; i++) {
      const p = S.objects[i];
      p.x += p.vx * (1 + .35 * Math.sin(t*.0008+p.phase));
      p.y += p.vy * (1 + .35 * Math.cos(t*.0007+p.phase));
      if (p.x < .02 || p.x > .98) p.vx *= -1;
      if (p.y < .02 || p.y > .98) p.vy *= -1;
      const x=p.x*w, y=p.y*h, r=Math.max(28,p.r*Math.min(w,h)*3.2);
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,i%2?amber(.72,i*2):green(.72,i*2));
      g.addColorStop(.48,i%2?amber(.23,i*2):green(.23,i*2));
      g.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
    ctx.globalCompositeOperation="source-over";
  }

  function renderFireflies(ctx,w,h,t) {
    clear(ctx,w,h,.36);
    for (const p of S.objects) {
      p.x += p.vx * .5; p.y += p.vy * .5; wrap(p);
      const speciesRate=[.0047,.0063,.0081][p.species];
      const flash=Math.max(0,Math.sin(t*speciesRate+p.phase)) ** (6+p.species*2);
      const radius=2+flash*(9+p.species*3);
      const g=ctx.createRadialGradient(p.x*w,p.y*h,0,p.x*w,p.y*h,radius*3);
      g.addColorStop(0,p.species===1?amber(.45+flash*.5):green(.45+flash*.5,p.species*12));
      g.addColorStop(1,"rgba(0,0,0,0)");
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x*w,p.y*h,radius*3,0,Math.PI*2); ctx.fill();
    }
  }

  function renderOil(ctx,w,h,t) {
    clear(ctx,w,h,.15);
    ctx.globalCompositeOperation="screen";
    for (let i=0;i<22;i++) {
      const phase=t*.00033+i*.67;
      const x=w*(.5+.41*Math.sin(phase*1.21+Math.sin(phase*.6)));
      const y=h*(.5+.41*Math.cos(phase*.93+Math.cos(phase*1.5)));
      const rx=25+85*(.5+.5*Math.sin(phase*1.7+i));
      const ry=18+68*(.5+.5*Math.cos(phase*1.37-i));
      ctx.save(); ctx.translate(x,y); ctx.rotate(phase*.7);
      ctx.fillStyle=i%2?amber(.10,i*7):green(.10,i*11);
      ctx.beginPath(); ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    const provider=S.textureProviders.get("oil");
    if (provider) provider({ctx,w,h,t,state:S});
    ctx.globalCompositeOperation="source-over";
  }

  function renderMagnetic(ctx,w,h,t) {
    clear(ctx,w,h,.34);
    const poles=[
      {x:w*.34+Math.sin(t*.0007)*w*.08,y:h*.5,strength:1},
      {x:w*.66+Math.cos(t*.0008)*w*.08,y:h*.5,strength:-1}
    ];
    ctx.lineWidth=.75;
    for(let gy=8;gy<h;gy+=13){
      for(let gx=8;gx<w;gx+=13){
        let fx=0,fy=0;
        for(const p of poles){
          const dx=gx-p.x,dy=gy-p.y;
          const r2=dx*dx+dy*dy+80;
          fx+=p.strength*dx/r2;
          fy+=p.strength*dy/r2;
        }
        const a=Math.atan2(fy,fx)+Math.sin(t*.001+gx*.01+gy*.012)*.2;
        const len=6;
        ctx.strokeStyle=(Math.sin(a*3)>0)?green(.30):amber(.24);
        ctx.beginPath();ctx.moveTo(gx-Math.cos(a)*len,gy-Math.sin(a)*len);ctx.lineTo(gx+Math.cos(a)*len,gy+Math.sin(a)*len);ctx.stroke();
      }
    }
    const provider=S.textureProviders.get("magnetic");
    if(provider) provider({ctx,w,h,t,state:S});
  }

  function renderJellyfish(ctx,w,h,t) {
    clear(ctx,w,h,.26);
    ctx.globalCompositeOperation="screen";
    for(let i=0;i<12;i++){
      const p=S.objects[i];
      p.x=(p.x+p.vx*.22+1)%1;
      p.y=(p.y+p.vy*.13+Math.sin(t*.001+p.phase)*.00035+1)%1;
      const x=p.x*w,y=p.y*h,r=14+p.r*150;
      ctx.strokeStyle=i%2?amber(.42):green(.42);
      ctx.fillStyle=i%2?amber(.055):green(.055);
      ctx.beginPath();ctx.arc(x,y,r,Math.PI,0);ctx.quadraticCurveTo(x+r*.55,y+r*.55,x,y+r*.7);ctx.quadraticCurveTo(x-r*.55,y+r*.55,x-r,y);ctx.fill();ctx.stroke();
      for(let k=-2;k<=2;k++){
        ctx.beginPath();ctx.moveTo(x+k*r*.28,y+r*.05);
        for(let s=1;s<=7;s++){
          ctx.lineTo(x+k*r*.28+Math.sin(t*.003+s+k+i)*r*.15,y+s*r*.37);
        }
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation="source-over";
  }

  function renderRain(ctx,w,h,t) {
    clear(ctx,w,h,.13);
    if(S.ripples.length<30 && rand()>.69){
      S.ripples.push({x:rand()*w,y:rand()*h,r:1,life:1,rate:1.2+rand()*1.7});
    }
    for(const r of S.ripples){
      r.r+=r.rate; r.life*=.981;
      ctx.strokeStyle=green(Math.max(0,r.life)*.52);
      ctx.beginPath();ctx.ellipse(r.x,r.y,r.r*1.45,r.r*.55,0,0,Math.PI*2);ctx.stroke();
      if(r.r<12){ctx.fillStyle=amber(.3*r.life);ctx.fillRect(r.x-1,r.y-1,2,2);}
    }
    S.ripples=S.ripples.filter(r=>r.life>.035 && r.r<w*.5);
  }

  function renderMoss(ctx,w,h,t) {
    if(S.moss.length===0){
      clear(ctx,w,h,1);
      S.moss.push({x:w*.5,y:h*.93,a:-Math.PI/2,age:0});
    } else clear(ctx,w,h,.035);

    const additions=[];
    const active=S.moss.slice(-Math.min(60,S.moss.length));
    for(let j=0;j<5;j++){
      const p=active[Math.floor(rand()*active.length)] || S.moss[0];
      const len=4+rand()*11;
      const a=p.a+(rand()-.5)*1.25+Math.sin(t*.0008+p.x*.01)*.08;
      const x2=Math.max(0,Math.min(w,p.x+Math.cos(a)*len));
      const y2=Math.max(0,Math.min(h,p.y+Math.sin(a)*len));
      ctx.strokeStyle=green(.25+rand()*.25,-15+rand()*30);
      ctx.lineWidth=.6+rand()*1.2;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(x2,y2);ctx.stroke();
      additions.push({x:x2,y:y2,a,age:0});
    }
    for(const p of S.moss) p.age++;
    S.moss.push(...additions);
    if(S.moss.length>2200) S.moss.splice(0,700);
    const provider=S.textureProviders.get("moss");
    if(provider) provider({ctx,w,h,t,state:S});
  }

  function renderCrickets(ctx,w,h,t) {
    clear(ctx,w,h,.28);
    for(let i=0;i<9;i++){
      const p=S.objects[i];
      p.x=(p.x+p.vx*.3+1)%1;p.y=(p.y+p.vy*.3+1)%1;
      const speciesRate=[.068,.081,.093][p.species];
      const beat=(t*speciesRate+p.phase*31)%140;
      for(let ring=0;ring<5;ring++){
        const r=(beat+ring*27)%140;
        const life=1-r/140;
        ctx.strokeStyle=p.species===1?amber(.12*life):green(.14*life,p.species*10);
        ctx.beginPath();ctx.arc(p.x*w,p.y*h,r*1.7,0,Math.PI*2);ctx.stroke();
      }
      if(S.audioEnabled && beat<2.5 && S.frame%3===0) cricketChirp(p.species,p.x);
    }
  }

  function renderKaleidoscope(ctx,w,h,t) {
    clear(ctx,w,h,.17);
    ctx.save();ctx.translate(w/2,h/2);
    for(let seg=0;seg<18;seg++){
      ctx.save();ctx.rotate(seg*Math.PI/9+t*.00005);
      const mirror=seg%2?-1:1;ctx.scale(1,mirror);
      for(let i=0;i<14;i++){
        const phase=t*.001+i*.61;
        const r=22+i*12+18*Math.sin(phase+i);
        ctx.strokeStyle=i%2?amber(.29,i*5):green(.29,i*7);
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(r,8+Math.sin(phase*1.4)*32);ctx.lineTo(r*.72,25+Math.cos(phase*.9)*21);ctx.closePath();ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  const mandelCanvas=document.createElement("canvas");
  mandelCanvas.width=180;mandelCanvas.height=101;
  const mandelCtx=mandelCanvas.getContext("2d");

  function renderMandelbrot(ctx,w,h,t) {
    const sw=mandelCanvas.width,sh=mandelCanvas.height;
    const img=mandelCtx.createImageData(sw,sh);
    const data=img.data;
    const zoom=1.5+1.15*(.5+.5*Math.sin(t*.00019));
    const cx=-.743643887037151+Math.sin(t*.00011)*.0075;
    const cy=.13182590420533+Math.cos(t*.00013)*.006;
    const jitter=(rand()-.5)*.0004;
    for(let py=0;py<sh;py++){
      for(let px=0;px<sw;px++){
        let zx=0,zy=0;
        const x0=cx+(px/sw-.5)*(3.0/zoom)+jitter;
        const y0=cy+(py/sh-.5)*(1.7/zoom)-jitter;
        let iter=0,max=42;
        while(zx*zx+zy*zy<=4 && iter<max){
          const xt=zx*zx-zy*zy+x0;zy=2*zx*zy+y0;zx=xt;iter++;
        }
        const idx=(py*sw+px)*4;
        const p=iter===max?0:iter/max;
        data[idx]=Math.floor(230*p);data[idx+1]=Math.floor(164*p+120*(1-p));data[idx+2]=Math.floor(43*p+25*(1-p));data[idx+3]=255;
      }
    }
    mandelCtx.putImageData(img,0,0);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(mandelCanvas,0,0,w,h);ctx.imageSmoothingEnabled=true;
  }

  function renderFractalMirror(ctx,w,h,t) {
    clear(ctx,w,h,.18);
    ctx.globalCompositeOperation="screen";
    for(let i=0;i<80;i++){
      const p=S.objects[i%S.objects.length];
      const phase=t*.00044+i*.23+p.phase;
      const dx=Math.sin(phase*1.7)*w*.44*Math.sin(i*.27);
      const dy=Math.cos(phase*1.13)*h*.43;
      const r=2+11*(.5+.5*Math.sin(phase*2.6));
      ctx.fillStyle=i%2?amber(.12,i*3):green(.12,i*4);
      for(const sx of [-1,1]) for(const sy of [-1,1]){
        ctx.beginPath();ctx.arc(w/2+sx*dx,h/2+sy*dy,r,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.globalCompositeOperation="source-over";
  }

  function branch(ctx,x,y,len,a,depth,wind) {
    if(depth<=0 || len<2) return;
    const a2=a+wind*depth*.035+(rand()-.5)*.018;
    const x2=x+Math.cos(a2)*len,y2=y+Math.sin(a2)*len;
    ctx.strokeStyle=depth>4?amber(.42,-8):green(.38,-12);
    ctx.lineWidth=Math.max(.55,depth*.52);
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();
    branch(ctx,x2,y2,len*.72,a-.46,depth-1,wind);
    branch(ctx,x2,y2,len*.69,a+.53,depth-1,wind);
  }

  function renderBonsai(ctx,w,h,t) {
    clear(ctx,w,h,.23);
    const wind=Math.sin(t*.0011)*.35+Math.sin(t*.00037)*.13;
    branch(ctx,w*.5,h*.94,h*.17,-Math.PI/2,10,wind);
    // expose compact branch-state data for entropy harvesting
    S.moss=[{x:w*.5,y:h*.94,a:-Math.PI/2,wind,frame:S.frame}];
  }

  function renderBirds(ctx,w,h,t) {
    clear(ctx,w,h,.27);
    const predator={x:S.pointer.x,y:S.pointer.y};
    const copy=S.flock.map(b=>({...b}));

    for(let i=0;i<S.flock.length;i++){
      const b=S.flock[i];
      let sepX=0,sepY=0,aliX=0,aliY=0,cohX=0,cohY=0,n=0;
      for(let j=0;j<copy.length;j++){
        if(i===j) continue;
        let dx=copy[j].x-b.x,dy=copy[j].y-b.y;
        if(dx>.5)dx-=1;if(dx<-.5)dx+=1;if(dy>.5)dy-=1;if(dy<-.5)dy+=1;
        const d2=dx*dx+dy*dy;
        if(d2<.025){
          n++;aliX+=copy[j].vx;aliY+=copy[j].vy;cohX+=dx;cohY+=dy;
          if(d2<.0035){sepX-=dx/(d2+.0001);sepY-=dy/(d2+.0001);}
        }
      }
      if(n){
        b.vx+=(aliX/n-b.vx)*.018+(cohX/n)*.0008+sepX*.00002;
        b.vy+=(aliY/n-b.vy)*.018+(cohY/n)*.0008+sepY*.00002;
      }
      const pdx=b.x-predator.x,pdy=b.y-predator.y,pd2=pdx*pdx+pdy*pdy;
      if(pd2<.06){b.vx+=pdx/(pd2+.002)*.00008;b.vy+=pdy/(pd2+.002)*.00008;}
      b.vx+=(rand()-.5)*.00008;b.vy+=(rand()-.5)*.00008;
      const speed=Math.hypot(b.vx,b.vy)||.001,max=.0065;
      if(speed>max){b.vx=b.vx/speed*max;b.vy=b.vy/speed*max;}
      b.x+=b.vx;b.y+=b.vy;wrap(b);
      const x=b.x*w,y=b.y*h,a=Math.atan2(b.vy,b.vx);
      ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=green(.67);ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-5,-3);ctx.lineTo(-2,0);ctx.lineTo(-5,3);ctx.closePath();ctx.fill();ctx.restore();
    }
    ctx.strokeStyle=amber(.4);ctx.beginPath();ctx.arc(predator.x*w,predator.y*h,9,0,Math.PI*2);ctx.stroke();
  }

  function renderBats(ctx,w,h,t) {
    clear(ctx,w,h,.24);
    // insects move with stochastic jitter and evade nearest bat
    for(const insect of S.prey){
      let nearest=null,best=Infinity;
      for(const bat of S.bats){const dx=insect.x-bat.x,dy=insect.y-bat.y,d2=dx*dx+dy*dy;if(d2<best){best=d2;nearest=bat;}}
      if(nearest && best<.05){
        insect.vx+=(insect.x-nearest.x)/(best+.001)*.000045;
        insect.vy+=(insect.y-nearest.y)/(best+.001)*.000045;
      }
      insect.vx=(insect.vx+(rand()-.5)*.00018)*.992;insect.vy=(insect.vy+(rand()-.5)*.00018)*.992;
      insect.x+=insect.vx;insect.y+=insect.vy;wrap(insect);
      ctx.fillStyle=green(.34);ctx.fillRect(insect.x*w,insect.y*h,2,2);
    }
    // bats pursue nearest insects
    for(const bat of S.bats){
      let target=null,best=Infinity;
      for(const insect of S.prey){const dx=insect.x-bat.x,dy=insect.y-bat.y,d2=dx*dx+dy*dy;if(d2<best){best=d2;target=insect;}}
      if(target){bat.vx+=(target.x-bat.x)*.00025;bat.vy+=(target.y-bat.y)*.00025;}
      const speed=Math.hypot(bat.vx,bat.vy)||.001,max=.008;
      if(speed>max){bat.vx=bat.vx/speed*max;bat.vy=bat.vy/speed*max;}
      bat.x+=bat.vx;bat.y+=bat.vy;wrap(bat);
      const x=bat.x*w,y=bat.y*h;
      ctx.strokeStyle=amber(.8);ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(x-12,y);ctx.quadraticCurveTo(x-6,y-9,x,y);ctx.quadraticCurveTo(x+6,y-9,x+12,y);ctx.stroke();
    }
  }

  function buildMaze(cols=31,rows=17) {
    if(cols%2===0)cols++;if(rows%2===0)rows++;
    const grid=Array.from({length:rows},()=>Array(cols).fill(1));
    const stack=[[1,1]];grid[1][1]=0;let hash=2166136261>>>0;
    const dirs=[[2,0],[-2,0],[0,2],[0,-2]];
    while(stack.length){
      const [x,y]=stack[stack.length-1];
      const choices=[];
      for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(nx>0&&ny>0&&nx<cols-1&&ny<rows-1&&grid[ny][nx]===1)choices.push([dx,dy]);}
      if(!choices.length){stack.pop();continue;}
      const [dx,dy]=choices[Math.floor(rand()*choices.length)];
      grid[y+dy/2][x+dx/2]=0;grid[y+dy][x+dx]=0;stack.push([x+dx,y+dy]);
      hash^=((x*31+y*17+dx*7+dy*13)>>>0);hash=Math.imul(hash,16777619)>>>0;
    }
    return {grid,cols,rows,hash};
  }

  function renderMercury(ctx,w,h,t) {
    if(!S.maze){
      S.maze=buildMaze();
      S.mercuryDrops=Array.from({length:6},()=>({x:1,y:1,vx:0,vy:0,phase:rand()*10}));
    }
    clear(ctx,w,h,1);
    const {grid,cols,rows}=S.maze,cw=w/cols,ch=h/rows;
    ctx.fillStyle="rgba(192,214,116,.13)";
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(grid[y][x])ctx.fillRect(x*cw,y*ch,cw+.5,ch+.5);

    for(const d of S.mercuryDrops){
      // local flow chooses open neighbor with a bias toward exit and oscillatory field
      const gx=Math.max(1,Math.min(cols-2,Math.round(d.x))),gy=Math.max(1,Math.min(rows-2,Math.round(d.y)));
      const options=[];
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(grid[gy+dy]?.[gx+dx]===0)options.push([dx,dy]);
      if(options.length){
        options.sort((a,b)=>((cols-(gx+a[0]))+(rows-(gy+a[1])))-((cols-(gx+b[0]))+(rows-(gy+b[1]))));
        const choose=rand()<.72?options[0]:options[Math.floor(rand()*options.length)];
        d.vx=d.vx*.82+choose[0]*.045;d.vy=d.vy*.82+choose[1]*.045;
      }
      d.x+=d.vx;d.y+=d.vy;
      if(d.x<1||d.y<1||d.x>cols-2||d.y>rows-2||grid[Math.round(d.y)]?.[Math.round(d.x)]===1){d.x=1;d.y=1;d.vx=d.vy=0;}
      const x=(d.x+.5)*cw,y=(d.y+.5)*ch,r=Math.min(cw,ch)*.38;
      const g=ctx.createRadialGradient(x-r*.3,y-r*.3,1,x,y,r);g.addColorStop(0,"rgba(255,255,255,.95)");g.addColorStop(.35,"rgba(192,214,116,.65)");g.addColorStop(1,"rgba(40,42,45,.55)");
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    }
  }

  function renderGravity(ctx,w,h,t) {
    clear(ctx,w,h,.31);
    const cycle=(t*.00017)%1;
    const g=9.81;
    for(let i=0;i<12;i++){
      const mass=1+i*3;
      const drag=.0045*i;
      const seconds=cycle*4;
      let y=.07*h + .5*g*seconds*seconds*7;
      y=Math.min(h*.91,y*(1-drag*.04));
      const x=w*(.06+i*.08)+Math.sin(t*.0007+i)*2.5;
      const r=5+Math.sqrt(mass)*2.2;
      ctx.fillStyle=i%2?amber(.62,i):green(.62,i*2);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="rgba(255,255,255,.25)";ctx.font="10px monospace";ctx.fillText(`${mass}m`,x-r,y-r-3);
    }
  }

  const RENDERERS={
    lava:renderLava,fireflies:renderFireflies,oil:renderOil,magnetic:renderMagnetic,
    jellyfish:renderJellyfish,rain:renderRain,moss:renderMoss,crickets:renderCrickets,
    kaleidoscope:renderKaleidoscope,mandelbrot:renderMandelbrot,fractalMirror:renderFractalMirror,
    bonsai:renderBonsai,birds:renderBirds,bats:renderBats,mercury:renderMercury,gravity:renderGravity
  };

  function setPreset(id) {
    if(!RENDERERS[id]) throw new Error(`Unknown preset: ${id}`);
    S.preset=id;
    const p=PRESETS.find(p=>p.id===id);
    if(el("sl-preset")) el("sl-preset").value=id;
    if(el("sl-preset-name")) el("sl-preset-name").textContent=p?.name||id;
    if(id==="rain")S.ripples=[];
    if(id==="moss")S.moss=[];
    if(id==="mercury"){S.maze=null;S.mercuryDrops=[];}
    if(id!=="crickets" && S.audioEnabled) stopAudio(false);
    mix(encoder.encode(`${id}:${performance.now()}`),"preset-switch");
    log(`preset: ${p?.name||id}`);
    renderOnce();
  }

  function renderOnce(t=performance.now()) {
    const C=canvasContext();if(!C)return;
    const fn=RENDERERS[S.preset];fn(C.ctx,C.w,C.h,t);
  }

  function loop(t) {
    if(!S.running)return;
    S.frame++;
    renderOnce(t);
    const cadence=Math.max(1,Number(el("sl-cadence")?.value)||4);
    if(S.frame%cadence===0)harvest("automatic").catch(err=>log(`harvest error: ${err.message}`));
    if(S.frame%10===0)updateStats();
    S.raf=requestAnimationFrame(loop);
  }

  function start() {
    ensureInitialized();
    if(S.running)return;
    S.running=true;
    if(el("sl-state"))el("sl-state").textContent="RUNNING";
    log("engine started.");
    S.raf=requestAnimationFrame(loop);
  }

  function stop() {
    S.running=false;
    if(S.raf)cancelAnimationFrame(S.raf);
    if(el("sl-state"))el("sl-state").textContent="STOPPED";
    if(S.audioEnabled) stopAudio(false);
  }

  // ------------------------------------------------------------------
  // Crickets Web Audio
  // ------------------------------------------------------------------

  async function ensureAudio() {
    if(!S.audioContext){
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)throw new Error("Web Audio unavailable.");
      S.audioContext=new Ctx();
    }
    if(S.audioContext.state==="suspended")await S.audioContext.resume();
    S.audioEnabled=true;
    log("cricket audio enabled.");
  }

  function cricketChirp(species,x) {
    const ac=S.audioContext;if(!ac||ac.state!=="running")return;
    const now=ac.currentTime;
    const osc=ac.createOscillator();const gain=ac.createGain();const pan=ac.createStereoPanner?ac.createStereoPanner():null;
    osc.type=species===0?"sine":species===1?"triangle":"square";
    const base=[3800,5200,6700][species];
    const doppler=1+(x-.5)*.035;
    osc.frequency.setValueAtTime(base*doppler,now);
    osc.frequency.exponentialRampToValueAtTime(base*doppler*1.08,now+.045);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.018,now+.006);gain.gain.exponentialRampToValueAtTime(.0001,now+.055);
    if(pan){pan.pan.value=x*2-1;osc.connect(gain);gain.connect(pan);pan.connect(ac.destination);}else{osc.connect(gain);gain.connect(ac.destination);}
    osc.start(now);osc.stop(now+.06);
  }

  function stopAudio(disable=true) {
    if(disable)S.audioEnabled=false;
    if(S.audioContext && S.audioContext.state==="running")S.audioContext.suspend().catch(()=>{});
  }

  // ------------------------------------------------------------------
  // Public project-specific browser API.
  // ------------------------------------------------------------------

  const API=Object.freeze({
    version:"1.1.0-web",
    presets:PRESETS.map(p=>Object.freeze({...p})),
    start,stop,harvest,reseed,generate,setPreset,mix,
    sha3_256,hmacSha3,
    getStats:()=>({
      running:S.running,preset:S.preset,frame:S.frame,harvests:S.harvests,
      mixedBytes:S.mixedBytes,reseeds:S.reseeds,outputs:S.outputs,poolFingerprint:hex(S.pool)
    }),
    registerTextureProvider(presetId,provider){
      if(!["oil","magnetic","moss"].includes(presetId))throw new Error("Texture providers are supported for oil, magnetic, and moss.");
      if(typeof provider!=="function")throw new TypeError("provider must be a function.");
      S.textureProviders.set(presetId,provider);
    },
    unregisterTextureProvider(presetId){S.textureProviders.delete(presetId);},
    selfTest:()=>{
      runSelfTests();
      return {sha3_256:true,presets:Object.keys(RENDERERS).length,expectedPresets:16};
    }
  });

  module.api=API;
  window.SynthLavaRNG=API;
  window.ZZXProjectModule=Object.freeze(module);
  window.dispatchEvent(new CustomEvent("zzx:project-module",{detail:window.ZZXProjectModule}));
})();
