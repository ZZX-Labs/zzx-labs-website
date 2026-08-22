(() => {
  "use strict";

  const MAX_APK_BYTES = 512 * 1024 * 1024;
  const MAX_EXTRACTED_ASSET = 16 * 1024 * 1024;
  const MAX_CONTAINER_TOTAL = 48 * 1024 * 1024;
  const SIG_LOCAL = 0x04034b50;
  const SIG_CENTRAL = 0x02014b50;
  const SIG_EOCD = 0x06054b50;
  const APK_SIG_MAGIC = new TextEncoder().encode("APK Sig Block 42");

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    const units = ["B", "KiB", "MiB", "GiB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(i ? 2 : 0)} ${units[i]}`;
  }

  function hex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function sha256(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return hex(new Uint8Array(digest));
  }

  function decodeName(bytes) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  function findEocd(view) {
    const min = Math.max(0, view.byteLength - 65557);
    for (let offset = view.byteLength - 22; offset >= min; offset--) {
      if (view.getUint32(offset, true) === SIG_EOCD) return offset;
    }
    return -1;
  }

  function parseCentralDirectory(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    if (view.byteLength < 22) throw new Error("APK/ZIP is too small.");
    const eocd = findEocd(view);
    if (eocd < 0) throw new Error("ZIP end-of-central-directory record not found.");

    const entryCount = view.getUint16(eocd + 10, true);
    const directorySize = view.getUint32(eocd + 12, true);
    const directoryOffset = view.getUint32(eocd + 16, true);

    if (
      entryCount === 0xffff ||
      directorySize === 0xffffffff ||
      directoryOffset === 0xffffffff
    ) {
      throw new Error("ZIP64 APKs are not supported by this lightweight container.");
    }

    if (directoryOffset + directorySize > view.byteLength) {
      throw new Error("Central directory exceeds APK bounds.");
    }

    const entries = [];
    let offset = directoryOffset;

    for (let i = 0; i < entryCount; i++) {
      if (offset + 46 > view.byteLength) throw new Error("Truncated central directory.");
      if (view.getUint32(offset, true) !== SIG_CENTRAL) {
        throw new Error(`Invalid central-directory signature at entry ${i}.`);
      }

      const method = view.getUint16(offset + 10, true);
      const flags = view.getUint16(offset + 8, true);
      const crc32 = view.getUint32(offset + 16, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);

      const start = offset + 46;
      const end = start + nameLength;
      if (end > view.byteLength) throw new Error("Entry name exceeds APK bounds.");

      const name = decodeName(bytes.subarray(start, end));
      entries.push({
        name,
        method,
        flags,
        crc32: crc32.toString(16).padStart(8, "0"),
        compressedSize,
        uncompressedSize,
        localOffset
      });

      offset = end + extraLength + commentLength;
    }

    return { entries, entryCount, directoryOffset, directorySize, eocd };
  }

  function hasSequence(haystack, needle, start, end) {
    const begin = Math.max(0, start || 0);
    const stop = Math.min(haystack.length, end ?? haystack.length);
    outer:
    for (let i = begin; i <= stop - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return true;
    }
    return false;
  }

  function summarize(buffer, parsed) {
    const names = parsed.entries.map((e) => e.name);
    const set = new Set(names);
    const dex = names.filter((n) => /^classes(?:\d+)?\.dex$/i.test(n));
    const libs = names.filter((n) => /^lib\/[^/]+\/[^/]+\.so$/i.test(n));
    const legacySig = names.filter((n) =>
      /^META-INF\/.*\.(RSA|DSA|EC)$/i.test(n) ||
      /^META-INF\/MANIFEST\.MF$/i.test(n)
    );

    const webAssets = names.filter((n) =>
      /^(?:assets\/|res\/raw\/).+\.(?:html?|css|js|mjs|json|txt|md|svg|png|jpe?g|gif|webp|woff2?|ttf|mp3|wav|ogg|mp4|webm)$/i.test(n)
    );

    const htmlEntries = webAssets.filter((n) => /\.html?$/i.test(n));
    const likelyEntrypoints = htmlEntries.sort((a, b) => {
      const score = (n) =>
        (/\/index\.html?$/i.test(n) ? 0 : 10) +
        (/assets\/www\//i.test(n) ? 0 : 2) +
        n.length / 1000;
      return score(a) - score(b);
    });

    const bytes = new Uint8Array(buffer);
    const scanStart = Math.max(0, parsed.directoryOffset - 1024 * 1024);
    const signingBlock = hasSequence(bytes, APK_SIG_MAGIC, scanStart, parsed.directoryOffset);

    return {
      androidManifest: set.has("AndroidManifest.xml"),
      resourcesArsc: set.has("resources.arsc"),
      dex,
      libs,
      legacySig,
      signingBlock,
      webAssets,
      htmlEntries,
      likelyEntrypoints,
      likelyApk: set.has("AndroidManifest.xml") && dex.length > 0
    };
  }

  function safeAssetName(name) {
    const normalized = String(name).replace(/\\/g, "/");
    if (
      normalized.includes("../") ||
      normalized.startsWith("/") ||
      normalized.includes("\0")
    ) {
      throw new Error(`Unsafe APK asset path: ${name}`);
    }
    return normalized;
  }

  function localDataRange(buffer, entry) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const off = entry.localOffset;

    if (off + 30 > view.byteLength || view.getUint32(off, true) !== SIG_LOCAL) {
      throw new Error(`Invalid local ZIP header for ${entry.name}.`);
    }

    const nameLen = view.getUint16(off + 26, true);
    const extraLen = view.getUint16(off + 28, true);
    const start = off + 30 + nameLen + extraLen;
    const end = start + entry.compressedSize;

    if (end > view.byteLength) throw new Error(`Compressed data exceeds bounds for ${entry.name}.`);
    return bytes.slice(start, end);
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("Browser lacks DecompressionStream required for compressed APK web assets.");
    }

    let stream;
    try {
      stream = new DecompressionStream("deflate-raw");
    } catch {
      stream = new DecompressionStream("deflate");
    }

    const blob = new Blob([bytes]);
    const decompressed = await new Response(blob.stream().pipeThrough(stream)).arrayBuffer();
    return new Uint8Array(decompressed);
  }

  async function extractEntry(buffer, entry) {
    safeAssetName(entry.name);

    if (entry.uncompressedSize > MAX_EXTRACTED_ASSET) {
      throw new Error(`APK asset too large for in-browser container: ${entry.name}`);
    }

    const compressed = localDataRange(buffer, entry);
    let output;

    if (entry.method === 0) {
      output = compressed;
    } else if (entry.method === 8) {
      output = await inflateRaw(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}.`);
    }

    if (entry.uncompressedSize && output.length !== entry.uncompressedSize) {
      // Do not fail on minor APK metadata oddities, but enforce upper bound.
      if (output.length > MAX_EXTRACTED_ASSET) {
        throw new Error(`Extracted asset exceeds safe limit: ${entry.name}`);
      }
    }

    return output;
  }

  function mimeFor(name) {
    const ext = String(name).toLowerCase().split(".").pop();
    return ({
      html: "text/html", htm: "text/html",
      css: "text/css",
      js: "text/javascript", mjs: "text/javascript",
      json: "application/json",
      txt: "text/plain", md: "text/markdown",
      svg: "image/svg+xml",
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
      woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
      mp4: "video/mp4", webm: "video/webm"
    })[ext] || "application/octet-stream";
  }

  function dirname(path) {
    const i = path.lastIndexOf("/");
    return i < 0 ? "" : path.slice(0, i + 1);
  }

  function resolveRelative(basePath, relative) {
    if (/^(?:[a-z]+:|\/\/|#|data:|blob:)/i.test(relative)) return null;
    const base = dirname(basePath);
    const stack = (base + relative).split("/");
    const out = [];
    for (const part of stack) {
      if (!part || part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return out.join("/");
  }

  function injectCsp(html) {
    const csp =
      "default-src 'none'; " +
      "script-src 'unsafe-inline' blob: data:; " +
      "style-src 'unsafe-inline' blob: data:; " +
      "img-src blob: data:; media-src blob: data:; font-src blob: data:; " +
      "connect-src 'none'; frame-src 'none'; object-src 'none'; " +
      "form-action 'none'; base-uri 'none'; worker-src 'none';";

    const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, `<head$1>${meta}`);
    }
    return `${meta}${html}`;
  }

  async function buildSandboxDocument(apkBuffer, parsed, entrypoint) {
    const assetEntries = new Map(
      parsed.entries
        .filter((entry) => /^(?:assets\/|res\/raw\/)/i.test(entry.name))
        .map((entry) => [entry.name, entry])
    );

    const entry = assetEntries.get(entrypoint);
    if (!entry) throw new Error("Selected web entrypoint is not present.");

    const entryBytes = await extractEntry(apkBuffer, entry);
    let html = new TextDecoder().decode(entryBytes);

    const referenced = new Set();
    const attrRx = /\b(?:src|href)=["']([^"'#]+)["']/gi;
    let match;
    while ((match = attrRx.exec(html))) {
      const resolved = resolveRelative(entrypoint, match[1]);
      if (resolved && assetEntries.has(resolved)) referenced.add(resolved);
    }

    let total = entryBytes.length;
    const replacements = new Map();

    for (const name of referenced) {
      const assetEntry = assetEntries.get(name);
      if (!assetEntry) continue;

      const bytes = await extractEntry(apkBuffer, assetEntry);
      total += bytes.length;
      if (total > MAX_CONTAINER_TOTAL) {
        throw new Error("Web asset container exceeds safe extraction limit.");
      }

      const mime = mimeFor(name);
      const ext = name.toLowerCase().split(".").pop();

      if (ext === "js" || ext === "mjs") {
        const text = new TextDecoder().decode(bytes)
          .replace(/<\/script/gi, "<\\/script");
        replacements.set(name, { kind: "script", text });
      } else if (ext === "css") {
        const text = new TextDecoder().decode(bytes)
          .replace(/<\/style/gi, "<\\/style");
        replacements.set(name, { kind: "style", text });
      } else {
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        replacements.set(name, { kind: "url", url });
      }
    }

    html = html.replace(
      /<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
      (full, before, rel, after) => {
        const resolved = resolveRelative(entrypoint, rel);
        const rep = resolved ? replacements.get(resolved) : null;
        if (rep?.kind === "script") {
          return `<script${before}${after}>${rep.text}<\/script>`;
        }
        return "<!-- external/network script blocked by Android++ APK sandbox -->";
      }
    );

    html = html.replace(
      /<link\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>/gi,
      (full, before, rel, after) => {
        const resolved = resolveRelative(entrypoint, rel);
        const rep = resolved ? replacements.get(resolved) : null;
        if (rep?.kind === "style") {
          return `<style>${rep.text}</style>`;
        }
        if (rep?.kind === "url") {
          return `<link${before}href="${rep.url}"${after}>`;
        }
        return "<!-- external/network link blocked by Android++ APK sandbox -->";
      }
    );

    html = html.replace(
      /\b(src|poster)=["']([^"']+)["']/gi,
      (full, attr, rel) => {
        const resolved = resolveRelative(entrypoint, rel);
        const rep = resolved ? replacements.get(resolved) : null;
        if (rep?.kind === "url") return `${attr}="${rep.url}"`;
        if (/^(?:data:|blob:)/i.test(rel)) return full;
        return `${attr}=""`;
      }
    );

    html = injectCsp(html);

    return {
      html,
      revoke() {
        for (const rep of replacements.values()) {
          if (rep.kind === "url") URL.revokeObjectURL(rep.url);
        }
      }
    };
  }

  class AndroidPPAPKContainer {
    constructor() {
      this.buffer = null;
      this.parsed = null;
      this.summary = null;
      this.digest = null;
      this.source = null;
      this.runtimeProvider = null;
      this.sandboxCleanup = null;
    }

    async loadBuffer(buffer, source = {}) {
      if (!(buffer instanceof ArrayBuffer)) throw new TypeError("ArrayBuffer required.");
      if (buffer.byteLength > MAX_APK_BYTES) {
        throw new Error(`APK exceeds ${formatBytes(MAX_APK_BYTES)} inspection limit.`);
      }

      const parsed = parseCentralDirectory(buffer);
      const [digest, summary] = await Promise.all([
        sha256(buffer),
        Promise.resolve(summarize(buffer, parsed))
      ]);

      this.buffer = buffer;
      this.parsed = parsed;
      this.summary = summary;
      this.digest = digest;
      this.source = source;

      return this.getInfo();
    }

    async loadFile(file) {
      return this.loadBuffer(await file.arrayBuffer(), {
        kind: "file",
        name: file.name,
        size: file.size
      });
    }

    async loadUrl(url) {
      const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`APK fetch failed: HTTP ${response.status}.`);
      const length = Number(response.headers.get("content-length")) || 0;
      if (length > MAX_APK_BYTES) throw new Error("Hosted APK exceeds inspection limit.");
      return this.loadBuffer(await response.arrayBuffer(), {
        kind: "url",
        url,
        name: url.split("/").pop()
      });
    }

    getInfo() {
      if (!this.parsed) return null;
      return {
        source: this.source,
        size: this.buffer.byteLength,
        sizeFormatted: formatBytes(this.buffer.byteLength),
        sha256: this.digest,
        entryCount: this.parsed.entryCount,
        entries: this.parsed.entries.map((entry) => ({ ...entry })),
        ...this.summary
      };
    }

    registerRuntimeProvider(provider) {
      if (provider !== null && typeof provider !== "function") {
        throw new TypeError("Runtime provider must be a function or null.");
      }
      this.runtimeProvider = provider;
    }

    async runNativeProvider(options = {}) {
      if (!this.buffer) throw new Error("Load an APK first.");
      if (!this.runtimeProvider) throw new Error("No Android runtime provider registered.");
      return this.runtimeProvider({
        apk: this.buffer.slice(0),
        info: this.getInfo(),
        ...options
      });
    }

    async runWebAssetContainer(iframe, entrypoint = null) {
      if (!this.buffer || !this.parsed || !this.summary) throw new Error("Load an APK first.");
      const entry = entrypoint || this.summary.likelyEntrypoints[0];
      if (!entry) throw new Error("APK contains no runnable HTML asset.");

      this.resetSandbox(iframe);
      const built = await buildSandboxDocument(this.buffer, this.parsed, entry);
      this.sandboxCleanup = built.revoke;

      iframe.removeAttribute("src");
      iframe.srcdoc = built.html;
      iframe.hidden = false;

      return { entrypoint: entry };
    }

    resetSandbox(iframe) {
      if (this.sandboxCleanup) {
        try { this.sandboxCleanup(); } catch {}
        this.sandboxCleanup = null;
      }
      if (iframe) {
        iframe.srcdoc = "";
        iframe.hidden = true;
      }
    }
  }

  window.AndroidPPAPKContainer = AndroidPPAPKContainer;
  window.AndroidPPAPKTools = Object.freeze({
    parseCentralDirectory,
    formatBytes
  });
})();
