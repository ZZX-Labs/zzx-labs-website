(() => {
  "use strict";

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function bytesToBase64(bytes) {
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return btoa(binary);
  }

  function base64ToBytes(text) {
    const binary = atob(String(text).replace(/\s+/g, ""));
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  }

  function hexEncode(text) {
    return Array.from(enc.encode(text), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function hexDecode(text) {
    const clean = String(text).replace(/[\s:_-]+/g, "");
    if (!/^[0-9a-f]*$/i.test(clean) || clean.length % 2) {
      throw new Error("Invalid hexadecimal text.");
    }
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    }
    return dec.decode(bytes);
  }

  function rot13(text) {
    return String(text).replace(/[a-z]/gi, (c) => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(base + (c.charCodeAt(0) - base + 13) % 26);
    });
  }

  async function sha256(text) {
    const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  const operations = {
    "base64-encode": async (text) => bytesToBase64(enc.encode(text)),
    "base64-decode": async (text) => dec.decode(base64ToBytes(text)),
    "hex-encode": async (text) => hexEncode(text),
    "hex-decode": async (text) => hexDecode(text),
    "url-encode": async (text) => encodeURIComponent(text),
    "url-decode": async (text) => decodeURIComponent(text),
    "rot13": async (text) => rot13(text),
    "json-pretty": async (text) => JSON.stringify(JSON.parse(text), null, 2),
    "json-minify": async (text) => JSON.stringify(JSON.parse(text)),
    "upper": async (text) => String(text).toUpperCase(),
    "lower": async (text) => String(text).toLowerCase(),
    "sha256": async (text) => sha256(text)
  };

  window.AndroidPPTransforms = Object.freeze({
    names: Object.keys(operations),
    async run(name, text) {
      const op = operations[name];
      if (!op) throw new Error(`Unknown transform: ${name}`);
      return op(String(text ?? ""));
    },
    bytesToBase64,
    base64ToBytes
  });
})();
