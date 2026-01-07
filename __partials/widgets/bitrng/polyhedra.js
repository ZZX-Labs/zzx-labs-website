// __partials/widgets/bitrng/engines/polyhedra.js
"use strict";

function u32From(bytes, i) {
  // little-endian 4 bytes -> uint32
  const b0 = bytes[i % bytes.length];
  const b1 = bytes[(i + 1) % bytes.length];
  const b2 = bytes[(i + 2) % bytes.length];
  const b3 = bytes[(i + 3) % bytes.length];
  return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
}

function rollDie(u32, sides) {
  // bias-minimized-ish for our use: mod is fine here for UI RNG
  return (u32 % sides) + 1;
}

const MODES = [
  "d2","d3","d4","d6","d8","d10","d10%","d12","d16","d20","d32","d64","d100"
];

export const enginePolyhedra = {
  id: "polyhedra",
  title: "Polyhedra · Dice",
  modes: MODES,

  async run({ mode, entropyBytes }) {
    const m = String(mode || "d20");

    const sides = (m === "d10%") ? 100 : parseInt(m.replace("d",""), 10);
    const n = Number.isFinite(sides) && sides > 1 ? sides : 20;

    // produce 8 rolls per refresh for now
    const rolls = [];
    for (let i = 0; i < 8; i++) {
      const u = u32From(entropyBytes, i * 4);
      rolls.push(rollDie(u, n));
    }

    return {
      type: "dice",
      sides: n,
      rolls
    };
  }
};
