// __partials/widgets/bitrng/entropy.js
// Security entropy is provided by Web Crypto API.
// Bitcoin network data is public context only; it is never counted as secret entropy.

"use strict";

const MEMPOOL = "https://mempool.space/api";
const enc = new TextEncoder();

function concatBytes(parts) {
  const chunks = parts.map((part) => {
    if (part instanceof Uint8Array) return part;
    if (part instanceof ArrayBuffer) return new Uint8Array(part);
    return enc.encode(String(part));
  });

  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

async function sha512(bytes) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto digest API unavailable");
  }
  const digest = await crypto.subtle.digest("SHA-512", bytes);
  return new Uint8Array(digest);
}

function secureRandomBytes(length) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Web Crypto random source unavailable");
  }

  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

async function getNetworkContext({ fetchJSON, fetchText } = {}) {
  const result = {
    available: false,
    tipHeight: null,
    tipHash: null,
    mempoolCount: null,
    mempoolVsize: null,
    mempoolFee: null
  };

  if (typeof fetchText !== "function" || typeof fetchJSON !== "function") {
    return result;
  }

  const [heightResult, hashResult, mempoolResult] = await Promise.allSettled([
    fetchText(`${MEMPOOL}/blocks/tip/height`),
    fetchText(`${MEMPOOL}/blocks/tip/hash`),
    fetchJSON(`${MEMPOOL}/mempool`)
  ]);

  if (heightResult.status === "fulfilled") {
    const height = Number.parseInt(String(heightResult.value).trim(), 10);
    if (Number.isFinite(height)) result.tipHeight = height;
  }

  if (hashResult.status === "fulfilled") {
    const hash = String(hashResult.value || "").trim();
    if (/^[0-9a-f]{64}$/i.test(hash)) result.tipHash = hash;
  }

  if (mempoolResult.status === "fulfilled" && mempoolResult.value && typeof mempoolResult.value === "object") {
    const m = mempoolResult.value;
    if (Number.isFinite(Number(m.count))) result.mempoolCount = Number(m.count);
    if (Number.isFinite(Number(m.vsize))) result.mempoolVsize = Number(m.vsize);
    if (Number.isFinite(Number(m.total_fee))) result.mempoolFee = Number(m.total_fee);
  }

  result.available = Boolean(
    result.tipHeight !== null ||
    result.tipHash ||
    result.mempoolCount !== null
  );

  return result;
}

export async function getEntropySnapshot(helpers = {}) {
  const random = secureRandomBytes(64); // 512 bits from browser CSPRNG
  const network = await getNetworkContext(helpers);

  const context = JSON.stringify({
    domain: "zzx-labs.bitrng.v2",
    generatedAt: new Date().toISOString(),
    performanceNow: globalThis.performance?.now?.() ?? null,
    network
  });

  // Hashing the CSPRNG output together with public context gives a fixed-size,
  // domain-separated 512-bit seed. Security does not depend on the public context.
  const entropyBytes = await sha512(concatBytes([
    "zzx-labs.bitrng.v2|",
    random,
    "|",
    context
  ]));

  return {
    entropyBytes,
    source: "Web Crypto API",
    health: "secure",
    rate: "on-demand",
    bits: 512,
    network,
    generatedAt: Date.now(),
    meta: {
      networkContextMixed: network.available,
      securityDependsOnNetwork: false
    }
  };
}
