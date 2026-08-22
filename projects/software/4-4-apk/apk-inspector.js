(() => {
  "use strict";

  const MAX_BYTES = 512 * 1024 * 1024;
  const SIG_LOCAL = 0x04034b50;
  const SIG_CENTRAL = 0x02014b50;
  const SIG_EOCD = 0x06054b50;
  const APK_SIG_MAGIC = new TextEncoder().encode("APK Sig Block 42");

  function bytesToHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

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

  async function sha256(buffer) {
    if (!crypto?.subtle) throw new Error("Web Crypto API is unavailable.");
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return bytesToHex(new Uint8Array(digest));
  }

  function findEocd(view) {
    const min = Math.max(0, view.byteLength - 65557);
    for (let offset = view.byteLength - 22; offset >= min; offset--) {
      if (view.getUint32(offset, true) === SIG_EOCD) return offset;
    }
    return -1;
  }

  function decodeName(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
    }
  }

  function parseCentralDirectory(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    if (view.byteLength < 4 || view.getUint32(0, true) !== SIG_LOCAL) {
      throw new Error("File does not begin with a ZIP local-file header.");
    }

    const eocd = findEocd(view);
    if (eocd < 0) throw new Error("ZIP end-of-central-directory record not found.");

    const entryCount = view.getUint16(eocd + 10, true);
    const directorySize = view.getUint32(eocd + 12, true);
    const directoryOffset = view.getUint32(eocd + 16, true);

    if (entryCount === 0xffff ||
        directorySize === 0xffffffff ||
        directoryOffset === 0xffffffff) {
      throw new Error("ZIP64 APKs are not supported by this lightweight inspector.");
    }

    if (directoryOffset + directorySize > view.byteLength) {
      throw new Error("ZIP central directory points beyond the end of the file.");
    }

    const entries = [];
    let offset = directoryOffset;

    for (let i = 0; i < entryCount; i++) {
      if (offset + 46 > view.byteLength) {
        throw new Error("Truncated ZIP central-directory entry.");
      }

      if (view.getUint32(offset, true) !== SIG_CENTRAL) {
        throw new Error(`Invalid central-directory signature at entry ${i}.`);
      }

      const method = view.getUint16(offset + 10, true);
      const crc32 = view.getUint32(offset + 16, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);

      const nameStart = offset + 46;
      const nameEnd = nameStart + nameLength;
      if (nameEnd > view.byteLength) {
        throw new Error("ZIP entry name exceeds file boundary.");
      }

      const name = decodeName(bytes.subarray(nameStart, nameEnd));

      entries.push({
        name,
        method,
        crc32: crc32.toString(16).padStart(8, "0"),
        compressedSize,
        uncompressedSize,
        localOffset
      });

      offset = nameEnd + extraLength + commentLength;
    }

    return {
      entryCount,
      directorySize,
      directoryOffset,
      eocdOffset: eocd,
      entries
    };
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
    const names = parsed.entries.map((entry) => entry.name);
    const nameSet = new Set(names);

    const dexFiles = names.filter((name) => /^classes(?:\d+)?\.dex$/i.test(name));
    const nativeLibs = names.filter((name) => /^lib\/[^/]+\/[^/]+\.so$/i.test(name));
    const legacySignatureFiles = names.filter((name) =>
      /^META-INF\/.*\.(RSA|DSA|EC)$/i.test(name) ||
      /^META-INF\/MANIFEST\.MF$/i.test(name)
    );

    const bytes = new Uint8Array(buffer);
    const signingScanStart = Math.max(0, parsed.directoryOffset - 1024 * 1024);
    const hasApkSigningBlock = hasSequence(
      bytes,
      APK_SIG_MAGIC,
      signingScanStart,
      parsed.directoryOffset
    );

    return {
      zip: true,
      androidManifest: nameSet.has("AndroidManifest.xml"),
      resourcesArsc: nameSet.has("resources.arsc"),
      dexFiles,
      nativeLibs,
      legacySignatureFiles,
      hasApkSigningBlock,
      likelyApk:
        nameSet.has("AndroidManifest.xml") &&
        dexFiles.length > 0
    };
  }

  async function inspectBuffer(buffer, metadata = {}) {
    if (!(buffer instanceof ArrayBuffer)) {
      throw new TypeError("inspectBuffer expects an ArrayBuffer.");
    }

    if (buffer.byteLength > MAX_BYTES) {
      throw new Error(`APK exceeds inspection limit (${formatBytes(MAX_BYTES)}).`);
    }

    const parsed = parseCentralDirectory(buffer);
    const digest = await sha256(buffer);
    const summary = summarize(buffer, parsed);

    return {
      source: metadata.source || "buffer",
      name: metadata.name || null,
      url: metadata.url || null,
      size: buffer.byteLength,
      sizeFormatted: formatBytes(buffer.byteLength),
      sha256: digest,
      ...parsed,
      ...summary
    };
  }

  async function inspectFile(file) {
    if (!(file instanceof File)) throw new TypeError("A File object is required.");
    if (file.size > MAX_BYTES) {
      throw new Error(`APK exceeds inspection limit (${formatBytes(MAX_BYTES)}).`);
    }

    return inspectBuffer(await file.arrayBuffer(), {
      source: "local-file",
      name: file.name
    });
  }

  async function inspectUrl(url) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`APK fetch failed: HTTP ${response.status}`);
    }

    const length = Number(response.headers.get("content-length")) || 0;
    if (length > MAX_BYTES) {
      throw new Error(`Hosted APK exceeds inspection limit (${formatBytes(MAX_BYTES)}).`);
    }

    const buffer = await response.arrayBuffer();
    return inspectBuffer(buffer, {
      source: "hosted-url",
      url,
      name: url.split("/").pop() || "package.apk"
    });
  }

  window.APKInspector = Object.freeze({
    version: "1.0.0",
    MAX_BYTES,
    inspectBuffer,
    inspectFile,
    inspectUrl,
    parseCentralDirectory,
    formatBytes
  });
})();
