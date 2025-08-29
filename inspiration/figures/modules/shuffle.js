// /inspiration/figures/modules/shuffle.js

// Mulberry32: tiny fast PRNG for optional seeding (used only if seed is provided)
function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates shuffle
 * @param {Array} arr
 * @param {{ seed?: number }} [opts] optional seed for deterministic shuffle
 * @returns {Array}
 */
export function shuffle(arr, opts = {}) {
  const a = arr.slice();
  const n = a.length;

  // If a seed is provided, use a deterministic PRNG (session-stable if you reuse the seed)
  if (typeof opts.seed === 'number' && Number.isFinite(opts.seed)) {
    const rnd = mulberry32(opts.seed);
    for (let i = n - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Otherwise, prefer CSPRNG with rejection sampling to avoid modulo bias
  if (window.crypto?.getRandomValues) {
    // Draw one 32-bit int per iteration; rejection sampling ensures uniformity
    const u32 = new Uint32Array(1);
    for (let i = n - 1; i > 0; i--) {
      const max = 0x100000000;               // 2^32
      const limit = max - (max % (i + 1));   // highest usable value
      let r;
      do {
        crypto.getRandomValues(u32);
        r = u32[0];
      } while (r >= limit);
      const j = r % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Fallback: Math.random
  for (let i = n - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
