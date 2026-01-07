// __partials/widgets/bitrng/engines/hash-sha256.js
"use strict";

async function sha256(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(hash);
}

export const engineHashSHA256 = {
  id: "hash-sha256",
  title: "Hash · SHA-256",
  modes: ["single", "double"],

  async run({ mode, entropyBytes }) {
    const m = String(mode || "single");
    if (m === "double") {
      const a = await sha256(entropyBytes);
      const b = await sha256(a);
      return b; // Uint8Array
    }
    return await sha256(entropyBytes);
  }
};
