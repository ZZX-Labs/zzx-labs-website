// __partials/widgets/bitrng/engines/hash-sha256.js
"use strict";

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto digest API unavailable");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

export const engineHashSHA256 = {
  id: "hash-sha256",
  title: "Hash · SHA-256",
  modes: ["single", "double"],

  async run({ mode, entropyBytes }) {
    const first = await sha256(entropyBytes);
    if (String(mode) === "double") return await sha256(first);
    return first;
  }
};
