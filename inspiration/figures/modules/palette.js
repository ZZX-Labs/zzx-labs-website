// /inspiration/figures/modules/palette.js
export function normalizePalette(p) {
  const out = [];
  const seen = new Set();
  (Array.isArray(p) ? p : []).forEach(c => {
    if (!c) return;
    let s = String(c).trim();
    if (!s.startsWith('#')) s = `#${s}`;
    if (/^#[0-9a-fA-F]{6}$/.test(s) || /^#[0-9a-fA-F]{3}$/.test(s)) {
      const key = s.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(key); }
    }
  });
  return out;
}

export function ensureBaseColor(p, base = '#c0d674') {
  const b = base.toLowerCase();
  if (!p.some(c => c.toLowerCase() === b)) {
    p.splice(Math.floor(p.length / 2), 0, b);
  }
  return normalizePalette(p);
}

export function constrainPalette(p, min = 8, max = 16) {
  if (p.length <= max) return p;
  const out = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * (p.length - 1) / (max - 1));
    out.push(p[idx]);
  }
  return normalizePalette(out);
}
