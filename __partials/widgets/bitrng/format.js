// __partials/widgets/bitrng/format.js
"use strict";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function bytesToBase32(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }

    // Keep only the unconsumed tail so the accumulator never grows
    // beyond the small number of bits needed for the next byte.
    value = bits > 0 ? (value & ((1 << bits) - 1)) : 0;
  }

  if (bits > 0) {
    out += BASE32[(value << (5 - bits)) & 31];
  }

  return out;
}

export function render(raw, { kind = "hex" } = {}) {
  if (raw && typeof raw === "object" && raw.type === "dice") {
    const percentile = raw.label || `d${raw.sides}`;
    return {
      text: `${percentile}: ${raw.rolls.join(", ")}`,
      hint: "unbiased rejection-sampled dice",
      kind: "dice",
      bits: raw.bits ?? null
    };
  }

  if (raw instanceof Uint8Array) {
    if (kind === "base64") {
      return { text: bytesToBase64(raw), hint: "base64", kind: "base64", bits: raw.length * 8 };
    }

    if (kind === "base32") {
      return { text: bytesToBase32(raw), hint: "base32 (RFC 4648 alphabet, no padding)", kind: "base32", bits: raw.length * 8 };
    }

    return { text: bytesToHex(raw), hint: "hex", kind: "hex", bits: raw.length * 8 };
  }

  if (typeof raw === "string") {
    return { text: raw, hint: "text", kind: "text", bits: null };
  }

  return { text: "—", hint: "unsupported output", kind: "unknown", bits: null };
}
