(() => {
  "use strict";

  const TEXT_EXT = new Set([
    "txt","md","markdown","csv","tsv","json","jsonl","xml","html","htm","css",
    "js","mjs","cjs","ts","tsx","jsx","py","sh","bash","zsh","ps1","java","kt",
    "kts","c","h","cpp","hpp","rs","go","rb","php","pl","lua","sql","yaml","yml",
    "toml","ini","cfg","conf","log","tex","rtf"
  ]);

  const IMAGE_EXT = new Set(["png","jpg","jpeg","gif","webp","bmp","avif"]);
  const AUDIO_EXT = new Set(["mp3","wav","ogg","m4a","aac","flac","opus"]);
  const VIDEO_EXT = new Set(["mp4","webm","mov","mkv","m4v","avi"]);
  const ARCHIVE_EXT = new Set(["zip","tar","gz","tgz","bz2","xz","7z","rar"]);

  function extension(name) {
    const p = String(name || "").toLowerCase().split(".");
    return p.length > 1 ? p.pop() : "";
  }

  function category(file) {
    const ext = extension(file.name);
    const type = file.type || "";

    if (type.startsWith("image/") || IMAGE_EXT.has(ext)) return "image";
    if (type.startsWith("audio/") || AUDIO_EXT.has(ext)) return "audio";
    if (type.startsWith("video/") || VIDEO_EXT.has(ext)) return "video";
    if (type.startsWith("text/") || TEXT_EXT.has(ext)) return "text";
    if (ARCHIVE_EXT.has(ext) || /zip|tar|gzip|compressed|archive/i.test(type)) return "archive";
    return "binary";
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    const units = ["B","KiB","MiB","GiB","TiB"];
    let n = bytes, i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024; i++;
    }
    return `${n.toFixed(i ? 2 : 0)} ${units[i]}`;
  }

  async function sha256(file) {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
  }

  function textStats(text) {
    const value = String(text || "");
    const lines = value ? value.split(/\r?\n/).length : 0;
    const words = value.trim() ? value.trim().split(/\s+/).length : 0;
    const chars = value.length;
    return { lines, words, chars };
  }

  async function readText(file, limit = 4 * 1024 * 1024) {
    const blob = file.slice(0, Math.min(file.size, limit));
    const text = await blob.text();
    return {
      text,
      truncated: file.size > limit,
      ...textStats(text)
    };
  }

  async function imageInfo(file) {
    const bitmap = await createImageBitmap(file);
    const width = bitmap.width;
    const height = bitmap.height;

    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, 8, 8);
    bitmap.close();

    const pixels = ctx.getImageData(0,0,8,8).data;
    const gray = [];
    for (let i = 0; i < pixels.length; i += 4) {
      gray.push((pixels[i] * .299) + (pixels[i+1] * .587) + (pixels[i+2] * .114));
    }
    const avg = gray.reduce((a,b) => a+b, 0) / gray.length;
    let bits = "";
    for (const g of gray) bits += g >= avg ? "1" : "0";

    let hash = "";
    for (let i = 0; i < bits.length; i += 4) {
      hash += parseInt(bits.slice(i, i+4), 2).toString(16);
    }

    return {
      width, height,
      aspectRatio: height ? width / height : null,
      perceptualHash: hash
    };
  }

  async function mediaInfo(file, kind) {
    const url = URL.createObjectURL(file);
    try {
      const el = document.createElement(kind === "audio" ? "audio" : "video");
      el.preload = "metadata";
      el.src = url;

      await new Promise((resolve, reject) => {
        el.onloadedmetadata = resolve;
        el.onerror = () => reject(new Error(`Unable to decode ${kind} metadata.`));
      });

      return {
        duration: Number.isFinite(el.duration) ? el.duration : null,
        width: kind === "video" ? el.videoWidth : null,
        height: kind === "video" ? el.videoHeight : null
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function parseZipEntries(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const SIG = 0x06054b50;
    let eocd = -1;
    const min = Math.max(0, buffer.byteLength - 65557);

    for (let o = buffer.byteLength - 22; o >= min; o--) {
      if (view.getUint32(o, true) === SIG) { eocd = o; break; }
    }
    if (eocd < 0) return [];

    const count = view.getUint16(eocd + 10, true);
    const offset = view.getUint32(eocd + 16, true);
    let p = offset;
    const out = [];

    for (let i = 0; i < count && i < 5000; i++) {
      if (p + 46 > buffer.byteLength || view.getUint32(p, true) !== 0x02014b50) break;
      const csize = view.getUint32(p+20, true);
      const usize = view.getUint32(p+24, true);
      const nlen = view.getUint16(p+28, true);
      const xlen = view.getUint16(p+30, true);
      const clen = view.getUint16(p+32, true);
      const name = new TextDecoder().decode(bytes.subarray(p+46, p+46+nlen));
      out.push({ name, compressedSize: csize, size: usize });
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }

  function parseTarEntries(buffer) {
    const bytes = new Uint8Array(buffer);
    const dec = new TextDecoder();
    const out = [];

    function readString(offset, length) {
      const raw = dec.decode(bytes.subarray(offset, offset+length));
      return raw.replace(/\0.*$/s,"").trim();
    }

    for (let offset = 0; offset + 512 <= bytes.length && out.length < 5000;) {
      const name = readString(offset, 100);
      if (!name) break;
      const sizeRaw = readString(offset+124, 12);
      const size = parseInt(sizeRaw || "0", 8) || 0;
      const typeFlag = readString(offset+156,1) || "0";
      out.push({ name, size, typeFlag });
      offset += 512 + Math.ceil(size/512)*512;
    }
    return out;
  }

  async function archiveInfo(file) {
    const ext = extension(file.name);
    if (ext === "zip") {
      const buffer = await file.arrayBuffer();
      const entries = parseZipEntries(buffer);
      return { archiveFormat: "zip", archiveEntries: entries, archiveEntryCount: entries.length };
    }

    if (ext === "tar") {
      const buffer = await file.arrayBuffer();
      const entries = parseTarEntries(buffer);
      return { archiveFormat: "tar", archiveEntries: entries, archiveEntryCount: entries.length };
    }

    return {
      archiveFormat: ext || "archive",
      archiveEntries: [],
      archiveEntryCount: null
    };
  }

  async function extract(file) {
    const cat = category(file);
    const base = {
      name: file.name,
      size: file.size,
      sizeFormatted: formatBytes(file.size),
      type: file.type || "application/octet-stream",
      extension: extension(file.name),
      category: cat,
      lastModified: file.lastModified || null,
      lastModifiedIso: file.lastModified ? new Date(file.lastModified).toISOString() : null
    };

    let extra = {};
    if (cat === "text") extra = await readText(file);
    else if (cat === "image") extra = await imageInfo(file);
    else if (cat === "audio" || cat === "video") extra = await mediaInfo(file, cat);
    else if (cat === "archive") extra = await archiveInfo(file);

    return { ...base, ...extra };
  }

  function hammingHex(a, b) {
    if (!a || !b || a.length !== b.length) return Infinity;
    let d = 0;
    for (let i = 0; i < a.length; i++) {
      let x = parseInt(a[i],16) ^ parseInt(b[i],16);
      while (x) { d += x & 1; x >>= 1; }
    }
    return d;
  }

  window.ArchiveTaggerMetadata = Object.freeze({
    extract, sha256, category, extension, formatBytes,
    textStats, hammingHex
  });
})();
