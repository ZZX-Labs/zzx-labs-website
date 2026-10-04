// __partials/widgets/bitrng/engines/raw.js
"use strict";

export const engineRaw = {
  id: "raw",
  title: "Raw · WebCrypto seed",
  modes: ["256-bit", "512-bit"],

  async run({ mode, entropyBytes }) {
    const size = String(mode) === "256-bit" ? 32 : 64;
    if (!(entropyBytes instanceof Uint8Array) || entropyBytes.length < size) {
      throw new Error("insufficient entropy bytes");
    }
    return entropyBytes.slice(0, size);
  }
};
