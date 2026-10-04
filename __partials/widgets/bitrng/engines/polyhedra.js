// __partials/widgets/bitrng/engines/polyhedra.js
// Uniform dice via SHA-256 counter expansion + rejection sampling.
"use strict";

const enc = new TextEncoder();
const MODES = ["d2","d3","d4","d6","d8","d10","d10%","d12","d16","d20","d32","d64","d100"];

function concatBytes(parts) {
  const chunks = parts.map((part) => part instanceof Uint8Array ? part : enc.encode(String(part)));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

function u32be(bytes, offset) {
  return (
    (bytes[offset] * 0x1000000) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  ) >>> 0;
}

async function uniformRolls(entropyBytes, sides, count, label) {
  const rolls = [];
  const range = 0x100000000;
  const limit = Math.floor(range / sides) * sides;
  let counter = 0;

  while (rolls.length < count) {
    const block = await sha256(concatBytes([
      "zzx-labs.bitrng.polyhedra.v2|",
      entropyBytes,
      "|",
      label,
      "|",
      String(counter++)
    ]));

    for (let i = 0; i + 3 < block.length && rolls.length < count; i += 4) {
      const value = u32be(block, i);
      if (value >= limit) continue;
      rolls.push((value % sides) + 1);
    }
  }

  return rolls;
}

export const enginePolyhedra = {
  id: "polyhedra",
  title: "Polyhedra · Dice",
  modes: MODES,

  async run({ mode, entropyBytes }) {
    if (!globalThis.crypto?.subtle) {
      throw new Error("Web Crypto digest API unavailable");
    }

    const label = String(mode || "d20");
    const sides = label === "d10%" ? 100 : Number.parseInt(label.replace(/^d/, ""), 10);
    const safeSides = Number.isFinite(sides) && sides > 1 ? sides : 20;
    const rolls = await uniformRolls(entropyBytes, safeSides, 8, label);

    return {
      type: "dice",
      label,
      sides: safeSides,
      rolls,
      bits: null
    };
  }
};
