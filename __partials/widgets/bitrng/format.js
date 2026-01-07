// __partials/widgets/bitrng/format.js
"use strict";

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2,"0")).join("");
}

function bytesToBase64(bytes) {
  // browser-safe
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function render(raw, { kind = "hex" } = {}) {
  const k = String(kind || "hex");

  // Dice objects
  if (raw && typeof raw === "object" && raw.type === "dice") {
    const text = `d${raw.sides}: ` + raw.rolls.join(", ");
    return { text, hint: "polyhedra rolls" };
  }

  // Bytes
  if (raw instanceof Uint8Array) {
    if (k === "base64") return { text: bytesToBase64(raw), hint: "base64" };
    return { text: bytesToHex(raw), hint: "hex" };
  }

  // Strings (fallback)
  if (typeof raw === "string") return { text: raw, hint: "text" };

  // Unknown
  return { text: "—", hint: "unsupported output" };
}
