// __partials/widgets/bitrng/entropy.js
// Entropy sources (composable)
// Returns { entropyBytes: Uint8Array, source, health, rate, meta:{} }

"use strict";

function utf8(s) { return new TextEncoder().encode(String(s)); }

function concatBytes(chunks) {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function sha256(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(hash);
}

// NOTE: we keep direct mempool urls here; later we can route through AllOrigins if needed.
const MEMPOOL = "https://mempool.space/api";

export async function getEntropySnapshot({ fetchJSON, fetchText }) {
  // local jitter (always available)
  const jitter = crypto.getRandomValues(new Uint8Array(32));

  try {
    const tipTxt = await fetchText(`${MEMPOOL}/blocks/tip/height`);
    const tip = parseInt(String(tipTxt).trim(), 10);

    // txids endpoint can be heavy; we only want a small slice
    // If it fails, we still have tip + jitter.
    let txidsSlice = "";
    try {
      const txids = await fetchJSON(`${MEMPOOL}/mempool/txids`);
      if (Array.isArray(txids) && txids.length) txidsSlice = txids.slice(0, 8).join("");
    } catch {}

    const seedMaterial = concatBytes([
      utf8("mempool.space|"),
      utf8(Number.isFinite(tip) ? String(tip) : "x"),
      utf8("|"),
      utf8(txidsSlice),
      utf8("|"),
      jitter,
      utf8("|"),
      utf8(new Date().toISOString()),
    ]);

    // compress to fixed entropy bytes
    const entropyBytes = await sha256(seedMaterial);

    return {
      entropyBytes,
      source: "mempool.space + local jitter",
      health: "ok",
      rate: "on-demand",
      meta: { tip: Number.isFinite(tip) ? tip : null, txids: txidsSlice || null },
    };
  } catch {
    // fallback-only mode
    const seedMaterial = concatBytes([
      utf8("fallback|"),
      jitter,
      utf8("|"),
      utf8(new Date().toISOString()),
      utf8("|"),
      utf8(Math.random().toString()),
    ]);

    const entropyBytes = await sha256(seedMaterial);

    return {
      entropyBytes,
      source: "local fallback",
      health: "degraded",
      rate: "on-demand",
      meta: {},
    };
  }
}
