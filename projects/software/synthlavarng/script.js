(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const runtime = {
    manifest: null,
    project: null,
    actions: new Map(),
    activeAction: null,
    timer: null
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"]/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
    })[c]);
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function hexToBytes(text) {
    const value = String(text).replace(/\s+/g, "");
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(value)) throw new Error("Invalid hexadecimal input.");
    return Uint8Array.from(value.match(/.{2}/g) || [], (pair) => parseInt(pair, 16));
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(text) {
    const binary = atob(String(text).trim());
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  }

  async function sha256(input) {
    if (!crypto?.subtle) throw new Error("Web Crypto SubtleCrypto is unavailable.");
    const bytes = normalizeBytes(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return new Uint8Array(digest);
  }

  async function hmacSha256(key, input) {
    const rawKey = normalizeBytes(key);
    const data = normalizeBytes(input);
    const cryptoKey = await crypto.subtle.importKey(
      "raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data));
  }

  function normalizeBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (typeof input === "string") return encoder.encode(input);
    if (input == null) return new Uint8Array(0);
    return encoder.encode(JSON.stringify(input));
  }

  function secureRandom(count) {
    const n = Math.max(1, Math.min(1_048_576, Number(count) || 32));
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 65536) {
      crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
    }
    return out;
  }

  function downloadBytes(bytes, filename, type = "application/octet-stream") {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function formatNumber(n) {
    return Number.isFinite(n) ? new Intl.NumberFormat().format(n) : String(n);
  }

  function summarizeNumbers(text) {
    const values = String(text)
      .split(/[\s,;]+/)
      .map(Number)
      .filter(Number.isFinite);

    if (!values.length) throw new Error("Enter at least one numeric value.");

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const median = sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    const variance = values.reduce((acc, n) => acc + (n - mean) ** 2, 0) / values.length;

    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      sum,
      mean,
      median,
      populationStdDev: Math.sqrt(variance)
    };
  }

  function wordStats(text) {
    const source = String(text);
    const words = source.toLowerCase().match(/[\p{L}\p{N}_'-]+/gu) || [];
    const freq = new Map();
    for (const word of words) freq.set(word, (freq.get(word) || 0) + 1);

    const top = [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));

    return {
      characters: source.length,
      utf8Bytes: encoder.encode(source).length,
      lines: source ? source.split(/\r?\n/).length : 0,
      words: words.length,
      uniqueWords: freq.size,
      topWords: top
    };
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let k = 0; k < 8; k++) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function splitChunks(text, size) {
    const bytes = encoder.encode(String(text));
    const n = Math.max(1, Math.min(1_048_576, Number(size) || 256));
    const chunks = [];

    for (let offset = 0, index = 0; offset < bytes.length; offset += n, index++) {
      const part = bytes.subarray(offset, Math.min(bytes.length, offset + n));
      chunks.push({
        index,
        offset,
        bytes: part.length,
        crc32: crc32(part).toString(16).padStart(8, "0"),
        base64: bytesToBase64(part)
      });
    }

    return chunks;
  }

  async function deriveAesKey(passphrase, salt, iterations = 210000) {
    const material = await crypto.subtle.importKey(
      "raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptLocal(plaintext, passphrase) {
    if (!passphrase) throw new Error("Passphrase is required.");
    const salt = secureRandom(16);
    const iv = secureRandom(12);
    const key = await deriveAesKey(passphrase, salt);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, key, encoder.encode(plaintext)
    ));

    return {
      v: 1,
      kdf: "PBKDF2-HMAC-SHA256",
      iterations: 210000,
      cipher: "AES-256-GCM",
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext)
    };
  }

  async function decryptLocal(envelope, passphrase) {
    if (!passphrase) throw new Error("Passphrase is required.");
    const obj = typeof envelope === "string" ? JSON.parse(envelope) : envelope;
    if (obj?.v !== 1) throw new Error("Unsupported local envelope version.");

    const salt = base64ToBytes(obj.salt);
    const iv = base64ToBytes(obj.iv);
    const ciphertext = base64ToBytes(obj.ciphertext);
    const key = await deriveAesKey(passphrase, salt, Number(obj.iterations) || 210000);
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return decoder.decode(clear);
  }

  function htmlTool(title, description, inner) {
    $("tool-header").innerHTML = `
      <p class="kicker">CAPABILITY</p>
      <h2>${esc(title)}</h2>
      <p class="tool-description">${esc(description || "")}</p>
    `;
    $("tool-body").innerHTML = `<div class="tool-card">${inner}</div>`;
    $("project-custom").replaceChildren();
  }

  function outputElement() {
    return $("tool-body").querySelector(".tool-output");
  }

  function setOutput(value) {
    const el = outputElement();
    if (!el) return;
    el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  function bindClick(id, fn) {
    const el = $(id);
    if (!el) return;
    el.addEventListener("click", async () => {
      try { await fn(); }
      catch (error) { setOutput(`ERROR: ${error.message}`); }
    });
  }

  const renderers = {
    "text-analysis"(action) {
      htmlTool(action.name, action.description, `
        <label>Text<textarea id="tool-input" spellcheck="false" placeholder="Paste or type text…"></textarea></label>
        <div class="button-row"><button id="tool-run" class="btn" type="button">ANALYZE</button></div>
        <pre class="tool-output"></pre>
      `);
      bindClick("tool-run", () => setOutput(wordStats($("tool-input").value)));
    },

    "hash"(action) {
      htmlTool(action.name, action.description, `
        <label>Text<textarea id="tool-input" spellcheck="false" placeholder="Data to hash…"></textarea></label>
        <div class="button-row"><button id="tool-run" class="btn" type="button">SHA-256</button></div>
        <pre class="tool-output"></pre>
      `);
      bindClick("tool-run", async () => setOutput(bytesToHex(await sha256($("tool-input").value))));
    },

    "file-inspector"(action) {
      htmlTool(action.name, action.description, `
        <label class="file-button">SELECT LOCAL FILE<input id="tool-file" type="file"></label>
        <pre class="tool-output">No file selected.</pre>
      `);
      $("tool-file").addEventListener("change", async () => {
        const file = $("tool-file").files?.[0];
        if (!file) return;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const digest = await sha256(bytes);
        setOutput({
          name: file.name,
          bytes: file.size,
          type: file.type || "application/octet-stream",
          modified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
          sha256: bytesToHex(digest)
        });
      });
    },

    "encoding"(action) {
      htmlTool(action.name, action.description, `
        <label>Input<textarea id="tool-input" spellcheck="false"></textarea></label>
        <div class="tool-grid">
          <label>Input interpretation
            <select id="enc-input-format">
              <option value="utf8">UTF-8 text</option>
              <option value="hex">Hex</option>
              <option value="base64">Base64</option>
            </select>
          </label>
          <label>Output format
            <select id="enc-output-format">
              <option value="hex">Hex</option>
              <option value="base64">Base64</option>
              <option value="utf8">UTF-8 text</option>
            </select>
          </label>
        </div>
        <div class="button-row"><button id="tool-run" class="btn" type="button">TRANSFORM</button></div>
        <pre class="tool-output"></pre>
      `);
      bindClick("tool-run", () => {
        const inputFormat = $("enc-input-format").value;
        const outputFormat = $("enc-output-format").value;
        const source = $("tool-input").value;
        const bytes = inputFormat === "hex"
          ? hexToBytes(source)
          : inputFormat === "base64"
            ? base64ToBytes(source)
            : encoder.encode(source);

        setOutput(
          outputFormat === "hex" ? bytesToHex(bytes)
          : outputFormat === "base64" ? bytesToBase64(bytes)
          : decoder.decode(bytes)
        );
      });
    },

    "random"(action) {
      htmlTool(action.name, action.description, `
        <div class="tool-grid">
          <label>Byte count<input id="random-count" type="number" min="1" max="65536" value="32"></label>
          <label>Format
            <select id="random-format"><option value="hex">Hex</option><option value="base64">Base64</option></select>
          </label>
        </div>
        <div class="button-row"><button id="tool-run" class="btn" type="button">GENERATE</button></div>
        <pre class="tool-output"></pre>
      `);
      bindClick("tool-run", () => {
        const bytes = secureRandom(Math.min(65536, Number($("random-count").value) || 32));
        setOutput($("random-format").value === "base64" ? bytesToBase64(bytes) : bytesToHex(bytes));
      });
    },

    "statistics"(action) {
      htmlTool(action.name, action.description, `
        <label>Numeric dataset<textarea id="tool-input" placeholder="12, 14, 18, 22, 25"></textarea></label>
        <div class="button-row"><button id="tool-run" class="btn" type="button">CALCULATE</button></div>
        <pre class="tool-output"></pre>
      `);
      bindClick("tool-run", () => setOutput(summarizeNumbers($("tool-input").value)));
    },

    "json"(action) {
      htmlTool(action.name, action.description, `
        <label>JSON<textarea id="tool-input" spellcheck="false" placeholder='{"hello":"world"}'></textarea></label>
        <div class="button-row"><button id="tool-run" class="btn" type="button">FORMAT / VALIDATE</button></div>
        <pre class="tool-output"></pre>
      `);
      bindClick("tool-run", () => setOutput(JSON.stringify(JSON.parse($("tool-input").value), null, 2)));
    },

    "corpus"(action) {
      htmlTool(action.name, action.description, `
        <label>Corpus<textarea id="tool-input" spellcheck="false"></textarea></label>
        <div class="tool-grid">
          <label>Chunk size (characters)<input id="chunk-size" type="number" min="32" max="10000" value="700"></label>
          <label>Overlap (characters)<input id="chunk-overlap" type="number" min="0" max="5000" value="100"></label>
        </div>
        <div class="button-row"><button id="tool-run" class="btn" type="button">ANALYZE + CHUNK</button></div>
        <pre class="tool-output"></pre>
      `);
      bindClick("tool-run", async () => {
        const text = $("tool-input").value;
        const size = Math.max(32, Number($("chunk-size").value) || 700);
        const overlap = Math.max(0, Math.min(size - 1, Number($("chunk-overlap").value) || 0));
        const chunks = [];
        for (let i = 0; i < text.length; i += size - overlap) {
          const content = text.slice(i, i + size);
          chunks.push({
            index: chunks.length,
            start: i,
            end: i + content.length,
            sha256: bytesToHex(await sha256(content)),
            preview: content.slice(0, 100)
          });
          if (i + size >= text.length) break;
        }
        setOutput({ stats: wordStats(text), chunks });
      });
    },

    "protocol-chunker"(action) {
      htmlTool(action.name, action.description, `
        <label>Payload<textarea id="tool-input" spellcheck="false"></textarea></label>
        <label>Chunk bytes<input id="chunk-bytes" type="number" min="1" max="1048576" value="256"></label>
        <div class="button-row"><button id="tool-run" class="btn" type="button">FRAME</button></div>
        <pre class="tool-output"></pre>
      `);
      bindClick("tool-run", () => setOutput({
        framing: "index/offset/length/CRC32/Base64",
        chunks: splitChunks($("tool-input").value, $("chunk-bytes").value)
      }));
    },

    "crypto"(action) {
      htmlTool(action.name, action.description, `
        <label>Text / envelope<textarea id="tool-input" spellcheck="false"></textarea></label>
        <label>Passphrase<input id="crypto-passphrase" type="password" autocomplete="new-password"></label>
        <div class="button-row">
          <button id="crypto-encrypt" class="btn" type="button">AES-256-GCM ENCRYPT</button>
          <button id="crypto-decrypt" class="btn ghost" type="button">DECRYPT ENVELOPE</button>
        </div>
        <pre class="tool-output"></pre>
      `);
      bindClick("crypto-encrypt", async () => {
        const envelope = await encryptLocal($("tool-input").value, $("crypto-passphrase").value);
        setOutput(envelope);
      });
      bindClick("crypto-decrypt", async () => {
        const clear = await decryptLocal($("tool-input").value, $("crypto-passphrase").value);
        setOutput(clear);
      });
    },

    "bitcoin-network"(action) {
      htmlTool(action.name, action.description, `
        <p class="muted">Read-only public network data. No wallet keys, signing, or transactions are requested.</p>
        <div class="button-row">
          <button id="btc-tip" class="btn" type="button">TIP</button>
          <button id="btc-mempool" class="btn ghost" type="button">MEMPOOL</button>
          <button id="btc-fees" class="btn ghost" type="button">FEES</button>
        </div>
        <pre class="tool-output"></pre>
      `);
      async function fetchText(url) {
        const r = await fetch(url, { cache: "no-store", headers: { "Accept": "application/json,text/plain,*/*" } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        try { return JSON.parse(text); } catch { return text; }
      }
      bindClick("btc-tip", async () => {
        const [height, hash] = await Promise.all([
          fetchText("https://mempool.space/api/blocks/tip/height"),
          fetchText("https://mempool.space/api/blocks/tip/hash")
        ]);
        setOutput({ height, hash, provider: "mempool.space" });
      });
      bindClick("btc-mempool", async () => setOutput(await fetchText("https://mempool.space/api/mempool")));
      bindClick("btc-fees", async () => setOutput(await fetchText("https://mempool.space/api/v1/fees/recommended")));
    },

    "satoshi-calc"(action) {
      htmlTool(action.name, action.description, `
        <div class="tool-grid">
          <label>BTC<input id="btc-value" type="number" step="0.00000001" value="1"></label>
          <label>Satoshis<input id="sat-value" type="number" step="1" value="100000000"></label>
        </div>
        <div class="button-row">
          <button id="btc-to-sat" class="btn" type="button">BTC → SAT</button>
          <button id="sat-to-btc" class="btn ghost" type="button">SAT → BTC</button>
        </div>
        <pre class="tool-output"></pre>
      `);
      bindClick("btc-to-sat", () => {
        const btc = Number($("btc-value").value);
        if (!Number.isFinite(btc)) throw new Error("Invalid BTC amount.");
        const sats = Math.round(btc * 100_000_000);
        $("sat-value").value = String(sats);
        setOutput({ btc, satoshis: sats });
      });
      bindClick("sat-to-btc", () => {
        const sats = Number($("sat-value").value);
        if (!Number.isFinite(sats)) throw new Error("Invalid satoshi amount.");
        const btc = sats / 100_000_000;
        $("btc-value").value = String(btc);
        setOutput({ satoshis: sats, btc });
      });
    },

    "document-commitment"(action) {
      htmlTool(action.name, action.description, `
        <label>Document / agreement text<textarea id="tool-input" spellcheck="false"></textarea></label>
        <div class="button-row"><button id="tool-run" class="btn" type="button">CREATE LOCAL COMMITMENT</button></div>
        <pre class="tool-output"></pre>
      `);
      bindClick("tool-run", async () => {
        const text = $("tool-input").value;
        setOutput({
          createdAt: new Date().toISOString(),
          utf8Bytes: encoder.encode(text).length,
          sha256: bytesToHex(await sha256(text))
        });
      });
    },

    "timer"(action) {
      htmlTool(action.name, action.description, `
        <div id="timer-display" class="timer-display">READY</div>
        <div class="tool-grid">
          <label>Phase seconds<input id="timer-seconds" type="number" min="1" max="3600" value="4"></label>
          <label>Cycles<input id="timer-cycles" type="number" min="1" max="100" value="4"></label>
        </div>
        <div class="button-row">
          <button id="timer-start" class="btn" type="button">START 4-PHASE CYCLE</button>
          <button id="timer-stop" class="btn ghost" type="button">STOP</button>
        </div>
        <pre class="tool-output"></pre>
      `);

      bindClick("timer-stop", () => {
        if (runtime.timer) clearInterval(runtime.timer);
        runtime.timer = null;
        $("timer-display").textContent = "STOPPED";
      });

      bindClick("timer-start", () => {
        if (runtime.timer) clearInterval(runtime.timer);
        const seconds = Math.max(1, Number($("timer-seconds").value) || 4);
        const cycles = Math.max(1, Number($("timer-cycles").value) || 4);
        const phases = ["INHALE", "HOLD", "EXHALE", "HOLD"];
        let phase = 0, left = seconds, cycle = 1;

        const update = () => {
          $("timer-display").textContent = `${phases[phase]} ${left}`;
          setOutput({ cycle, cycles, phase: phases[phase], secondsRemaining: left });
        };

        update();
        runtime.timer = setInterval(() => {
          left--;
          if (left <= 0) {
            phase++;
            if (phase >= phases.length) {
              phase = 0;
              cycle++;
              if (cycle > cycles) {
                clearInterval(runtime.timer);
                runtime.timer = null;
                $("timer-display").textContent = "COMPLETE";
                setOutput({ complete: true, cycles });
                return;
              }
            }
            left = seconds;
          }
          update();
        }, 1000);
      });
    },

    "tts"(action) {
      htmlTool(action.name, action.description, `
        <label>Text<textarea id="tool-input">ZZX-Labs browser speech synthesis test.</textarea></label>
        <div class="tool-grid">
          <label>Rate<input id="tts-rate" type="number" min=".1" max="3" step=".1" value="1"></label>
          <label>Pitch<input id="tts-pitch" type="number" min="0" max="2" step=".1" value="1"></label>
        </div>
        <div class="button-row">
          <button id="tts-speak" class="btn" type="button">SPEAK</button>
          <button id="tts-stop" class="btn ghost" type="button">STOP</button>
        </div>
        <pre class="tool-output"></pre>
      `);
      bindClick("tts-speak", () => {
        if (!("speechSynthesis" in window)) throw new Error("SpeechSynthesis is unavailable.");
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance($("tool-input").value);
        utterance.rate = Number($("tts-rate").value) || 1;
        utterance.pitch = Number($("tts-pitch").value) || 1;
        speechSynthesis.speak(utterance);
        setOutput({ speaking: true, rate: utterance.rate, pitch: utterance.pitch });
      });
      bindClick("tts-stop", () => {
        speechSynthesis?.cancel();
        setOutput({ speaking: false });
      });
    },

    "audio-inspector"(action) {
      htmlTool(action.name, action.description, `
        <label class="file-button">SELECT LOCAL AUDIO<input id="audio-file" type="file" accept="audio/*"></label>
        <audio id="audio-player" controls style="width:100%;margin-top:.8rem"></audio>
        <pre class="tool-output">No audio selected.</pre>
      `);
      $("audio-file").addEventListener("change", async () => {
        const file = $("audio-file").files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const player = $("audio-player");
        player.src = url;

        const bytes = new Uint8Array(await file.arrayBuffer());
        const digest = await sha256(bytes);

        await new Promise((resolve) => {
          player.onloadedmetadata = resolve;
          setTimeout(resolve, 1500);
        });

        setOutput({
          name: file.name,
          bytes: file.size,
          mime: file.type,
          durationSeconds: Number.isFinite(player.duration) ? player.duration : null,
          sha256: bytesToHex(digest)
        });
      });
    },

    "video-inspector"(action) {
      htmlTool(action.name, action.description, `
        <label class="file-button">SELECT LOCAL VIDEO<input id="video-file" type="file" accept="video/*"></label>
        <video id="video-player" controls style="width:100%;max-height:380px;margin-top:.8rem;background:#000"></video>
        <pre class="tool-output">No video selected.</pre>
      `);
      $("video-file").addEventListener("change", async () => {
        const file = $("video-file").files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        const player = $("video-player");
        player.src = url;

        const bytes = new Uint8Array(await file.arrayBuffer());
        const digest = await sha256(bytes);

        await new Promise((resolve) => {
          player.onloadedmetadata = resolve;
          setTimeout(resolve, 1500);
        });

        setOutput({
          name: file.name,
          bytes: file.size,
          mime: file.type,
          durationSeconds: Number.isFinite(player.duration) ? player.duration : null,
          videoWidth: player.videoWidth || null,
          videoHeight: player.videoHeight || null,
          sha256: bytesToHex(digest)
        });
      });
    },

    "image-inspector"(action) {
      htmlTool(action.name, action.description, `
        <label class="file-button">SELECT LOCAL IMAGE<input id="image-file" type="file" accept="image/*"></label>
        <canvas id="image-canvas" class="canvas-demo" width="960" height="540"></canvas>
        <pre class="tool-output">No image selected.</pre>
      `);
      $("image-file").addEventListener("change", async () => {
        const file = $("image-file").files?.[0];
        if (!file) return;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const digest = await sha256(bytes);
        const bitmap = await createImageBitmap(file);
        const canvas = $("image-canvas");
        const c = canvas.getContext("2d");
        c.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
        const w = bitmap.width * scale, h = bitmap.height * scale;
        c.drawImage(bitmap, (canvas.width-w)/2, (canvas.height-h)/2, w, h);
        setOutput({
          name: file.name,
          bytes: file.size,
          mime: file.type,
          width: bitmap.width,
          height: bitmap.height,
          sha256: bytesToHex(digest)
        });
      });
    },

    "geojson"(action) {
      htmlTool(action.name, action.description, `
        <label>Coordinates (lat,lon — one pair per line)
          <textarea id="tool-input" placeholder="40.7128,-74.0060&#10;37.7749,-122.4194"></textarea>
        </label>
        <div class="button-row"><button id="tool-run" class="btn" type="button">BUILD GEOJSON</button></div>
        <pre class="tool-output"></pre>
      `);
      bindClick("tool-run", () => {
        const coords = $("tool-input").value.split(/\r?\n/).filter(Boolean).map((line, i) => {
          const [lat, lon] = line.split(/[,\s]+/).map(Number);
          if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) {
            throw new Error(`Invalid coordinate on line ${i+1}.`);
          }
          return [lon, lat];
        });
        setOutput({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords }
        });
      });
    },

    "visual-rng"(action) {
      htmlTool(action.name, action.description, `
        <canvas id="vrng-canvas" class="canvas-demo" width="960" height="540"></canvas>
        <div class="tool-grid" style="margin-top:.8rem">
          <label>Output bytes<input id="vrng-count" type="number" min="1" max="65536" value="32"></label>
          <label>Harvest cadence
            <select id="vrng-rate"><option value="1">Every frame</option><option value="4" selected>Every 4 frames</option><option value="12">Every 12 frames</option></select>
          </label>
        </div>
        <div class="button-row">
          <button id="vrng-start" class="btn" type="button">START</button>
          <button id="vrng-stop" class="btn ghost" type="button">STOP</button>
          <button id="vrng-generate" class="btn ghost" type="button">GENERATE</button>
        </div>
        <pre class="tool-output"></pre>
      `);

      const canvas = $("vrng-canvas");
      const c = canvas.getContext("2d");
      let running = false, raf = 0, frame = 0;
      let pool = secureRandom(32);
      const points = Array.from({length: 18}, () => ({
        x: Math.random()*canvas.width,
        y: Math.random()*canvas.height,
        vx: (Math.random()-.5)*3,
        vy: (Math.random()-.5)*3,
        r: 20+Math.random()*80
      }));

      async function harvest() {
        const pixels = c.getImageData(0,0,canvas.width,canvas.height).data;
        const stride = Math.max(1, Math.floor(pixels.length / 2048));
        const sampled = new Uint8Array(Math.ceil(pixels.length / stride));
        for (let i=0,j=0; i<pixels.length; i+=stride,j++) sampled[j]=pixels[i];
        pool = await sha256(new Uint8Array([
          ...pool,
          ...sampled.slice(0,2048),
          ...secureRandom(32)
        ]));
      }

      function draw() {
        if (!running) return;
        frame++;
        c.fillStyle = "rgba(5,5,5,.18)";
        c.fillRect(0,0,canvas.width,canvas.height);
        c.globalCompositeOperation = "screen";

        for (let i=0;i<points.length;i++) {
          const p=points[i];
          p.x += p.vx; p.y += p.vy;
          if (p.x<0 || p.x>canvas.width) p.vx*=-1;
          if (p.y<0 || p.y>canvas.height) p.vy*=-1;
          const g=c.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
          g.addColorStop(0, i%2 ? "rgba(230,164,43,.6)" : "rgba(192,214,116,.6)");
          g.addColorStop(1,"rgba(0,0,0,0)");
          c.fillStyle=g;
          c.beginPath(); c.arc(p.x,p.y,p.r,0,Math.PI*2); c.fill();
        }

        c.globalCompositeOperation="source-over";
        const rate=Number($("vrng-rate").value)||4;
        if(frame%rate===0) harvest().catch(()=>{});
        raf=requestAnimationFrame(draw);
      }

      bindClick("vrng-start", () => {
        if (running) return;
        running=true; draw();
        setOutput("visual entropy mixer running; OS CSPRNG is mixed into every harvest");
      });
      bindClick("vrng-stop", () => {
        running=false;
        cancelAnimationFrame(raf);
        setOutput("visual entropy mixer stopped");
      });
      bindClick("vrng-generate", async () => {
        await harvest();
        const count=Math.max(1,Math.min(65536,Number($("vrng-count").value)||32));
        const root=await hmacSha256(pool, secureRandom(32));
        const out=new Uint8Array(count);
        let offset=0, counter=0;
        while(offset<count){
          const block=await hmacSha256(root, encoder.encode(`SynthLavaRNG:${counter++}`));
          out.set(block.subarray(0,Math.min(block.length,count-offset)),offset);
          offset+=block.length;
        }
        setOutput(bytesToHex(out));
      });
    }
  };

  function renderAction(id) {
    const action = runtime.actions.get(id);
    if (!action) return;
    runtime.activeAction = id;

    document.querySelectorAll(".tool-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.action === id);
    });

    const renderer = renderers[action.type];
    if (!renderer) {
      htmlTool(action.name, action.description, `
        <p class="muted">This capability requires native, server-side, hardware, or browser APIs that are not available in this build.</p>
        <pre class="tool-output">${esc(action.notes || "No browser implementation is currently available.")}</pre>
      `);
      return;
    }

    renderer(action);
  }

  function registerProject(project) {
    runtime.project = project;
    runtime.actions.clear();

    for (const action of project.actions || []) {
      runtime.actions.set(action.id, action);
    }

    renderToolList();

    if (project.mount && typeof project.mount === "function") {
      try { project.mount(api); }
      catch (error) { console.error("project mount failed", error); }
    }

    window.ZZXHooks?.emit("project:registered", project);
  }

  function renderToolList() {
    const list = $("tool-list");
    if (!list) return;
    list.replaceChildren();

    for (const action of runtime.actions.values()) {
      const button = document.createElement("button");
      button.className = "tool-tab";
      button.type = "button";
      button.role = "tab";
      button.dataset.action = action.id;
      button.textContent = action.name;
      button.addEventListener("click", () => renderAction(action.id));
      list.appendChild(button);
    }

    const first = runtime.actions.keys().next().value;
    if (first) renderAction(first);
  }

  function renderManifest(m) {
    runtime.manifest = m;
    if (m.title) $("project-title").textContent = m.title;
    if (m.blurb) $("project-blurb").textContent = m.blurb;
    $("project-description").textContent = m.description || m.blurb || "";

    const github = $("github-link");
    if (m.github) {
      github.href = m.github;
      github.hidden = false;
      github.target = "_blank";
      github.rel = "noopener noreferrer";
    }

    if (m.note) {
      $("project-note").textContent = m.note;
      $("project-note").hidden = false;
    }

    const metaPairs = [
      ["Slug", m.slug],
      ["Version", m.version],
      ["License", m.license],
      ["State", m.state || m.status],
      ["Category", m.category],
      ["Platforms", (m.platforms || []).join(", ")]
    ].filter(([, value]) => value);

    $("project-meta").innerHTML = metaPairs.map(([k,v]) =>
      `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`
    ).join("");

    const renderChips = (id, values) => {
      const el = $(id);
      el.replaceChildren();
      for (const value of values || []) {
        const li = document.createElement("li");
        li.textContent = value;
        el.appendChild(li);
      }
    };

    renderChips("tag-list", m.tags);
    renderChips("dependency-list", m.dependencies);
    renderChips("framework-list", m.frameworks);

    const rows = m.web?.capabilities || [];
    $("parity-body").innerHTML = rows.map((row) => {
      const parity = ["yes","partial","no"].includes(row.web) ? row.web : "partial";
      return `<tr>
        <td>${esc(row.name)}</td>
        <td><span class="parity-badge ${parity}">${esc(parity.toUpperCase())}</span></td>
        <td>${esc(row.notes || "")}</td>
      </tr>`;
    }).join("");
  }

  async function loadManifest() {
    const response = await fetch("./manifest.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`manifest.json HTTP ${response.status}`);
    const m = await response.json();
    renderManifest(m);
    return m;
  }

  function runtimeBadges() {
    const items = [
      ["WEBCRYPTO", !!crypto?.subtle],
      ["FILES", !!window.File],
      ["CANVAS", !!document.createElement("canvas").getContext],
      ["AUDIO", !!window.Audio],
      ["TTS", "speechSynthesis" in window]
    ];

    $("runtime-status").innerHTML = items.map(([name, ok]) =>
      `<span class="runtime-badge ${ok ? "ok" : "no"}">${name}: ${ok ? "YES" : "NO"}</span>`
    ).join("");
  }

  const api = Object.freeze({
    version: "1.0.0",
    registerProject,
    renderAction,
    sha256,
    hmacSha256,
    secureRandom,
    normalizeBytes,
    bytesToHex,
    hexToBytes,
    bytesToBase64,
    base64ToBytes,
    encryptLocal,
    decryptLocal,
    summarizeNumbers,
    wordStats,
    splitChunks,
    downloadBytes,
    emit: (name, payload) => window.ZZXHooks?.emit(name, payload)
  });

  window.ZZXWeb = api;

  runtimeBadges();
  loadManifest()
    .then(() => {
      window.ZZXHooks?.emit("project:manifest", runtime.manifest);
      if (window.ZZXProjectModule) registerProject(window.ZZXProjectModule);
    })
    .catch((error) => {
      console.error(error);
      $("project-description").textContent = `Failed to load manifest: ${error.message}`;
    });

  window.addEventListener("zzx:project-module", (event) => {
    registerProject(event.detail);
  });
})();
