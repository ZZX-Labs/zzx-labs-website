// /inspiration/figures/modules/palette.js

const BRAND = '#c0d674';     // keep
const OLIVE = '#6b8e23';     // olive drab, requested

/* --------------------- tiny color utils --------------------- */
function hexToRgb(hex) {
  const h = String(hex).replace('#','').trim();
  const v = (s) => parseInt(s, 16);
  if (h.length === 3) return { r: v(h[0]+h[0]), g: v(h[1]+h[1]), b: v(h[2]+h[2]) };
  return { r: v(h.slice(0,2)), g: v(h.slice(2,4)), b: v(h.slice(4,6)) };
}
function rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h, s, l=(max+min)/2;
  if(max===min){ h=0; s=0; }
  else{
    const d=max-min;
    s=l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h=(g-b)/d + (g<b?6:0); break;
      case g: h=(b-r)/d + 2; break;
      default: h=(r-g)/d + 4; break;
    }
    h*=60;
  }
  return { h, s, l };
}
function hslFromHex(hex){ const {r,g,b}=hexToRgb(hex); return rgbToHsl(r,g,b); }
function hueDist(a,b){ const d=Math.abs(a-b)%360; return Math.min(d,360-d)/180; } // 0..1
function hslDistance(c1,c2){
  // emphasize hue + some saturation; small weight on lightness
  const dh = hueDist(c1.h, c2.h);
  const ds = Math.abs(c1.s - c2.s);
  const dl = Math.abs(c1.l - c2.l);
  return Math.sqrt( (dh*1.0)**2 + (ds*0.6)**2 + (dl*0.25)**2 );
}

/* --------------------- public API --------------------- */

// Normalize to unique #rrggbb/#rgb, keep order of first appearance
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

// Always include BRAND and OLIVE (in natural middle-ish positions)
export function ensureBaseColor(p, base = BRAND) {
  const arr = normalizePalette(p).slice();
  const need = [base.toLowerCase(), OLIVE];
  need.forEach((col, i) => {
    if (!arr.includes(col)) {
      const pos = Math.min(Math.max(Math.floor(arr.length * (0.4 + i*0.2)), 0), arr.length);
      arr.splice(pos, 0, col);
    }
  });
  return normalizePalette(arr);
}

// Constrain palette size and spread colors to reduce collisions.
// - Removes near-duplicates
// - Ensures BRAND + OLIVE present
// - If >max, samples farthest-first; if <=max, just reorders to be well-spaced
export function constrainPalette(p, min = 8, max = 16) {
  let arr = ensureBaseColor(normalizePalette(p));

  // de-duplicate "too similar" colors (by HSL distance)
  arr = dedupeNear(arr, 0.10); // ~10% in our composite metric feels right

  if (arr.length <= 2) return arr.slice(0, Math.min(arr.length, max));

  if (arr.length > max) {
    return distinctSample(arr, max);
  } else {
    // reorder to max distinctness while keeping all
    return distinctSample(arr, arr.length);
  }
}

/* --------------------- helpers used by constrain --------------------- */

function dedupeNear(list, minD = 0.1) {
  const out = [];
  const hsl = list.map(c => [c, hslFromHex(c)]);
  for (let i=0;i<hsl.length;i++){
    const [ci, hi] = hsl[i];
    let tooClose = false;
    for (let j=0;j<out.length;j++){
      const hj = hslFromHex(out[j]);
      if (hslDistance(hi, hj) < minD) { tooClose = true; break; }
    }
    if (!tooClose) out.push(ci);
  }
  // make sure BRAND & OLIVE survive dedupe
  if (!out.includes(BRAND) && list.includes(BRAND)) out.unshift(BRAND);
  if (!out.includes(OLIVE) && list.includes(OLIVE)) out.splice(1,0,OLIVE);
  return normalizePalette(out);
}

function distinctSample(list, k) {
  // farthest-point sampling seeded with BRAND→OLIVE if present
  const pool = list.slice();
  const picked = [];

  const hasBrand = pool.includes(BRAND);
  const hasOlive = pool.includes(OLIVE);

  if (hasBrand) picked.push(BRAND);
  if (hasOlive && (!hasBrand || OLIVE !== BRAND)) picked.push(OLIVE);

  // remove already picked from pool
  for (const c of picked) {
    const at = pool.indexOf(c);
    if (at >= 0) pool.splice(at,1);
  }

  // precompute HSL
  const hslMap = new Map();
  function getHsl(c){ if (!hslMap.has(c)) hslMap.set(c, hslFromHex(c)); return hslMap.get(c); }

  while (picked.length < k && pool.length) {
    // pick the color with the largest min-distance to current picked
    let best = pool[0], bestScore = -1;
    for (const c of pool) {
      const hc = getHsl(c);
      const score = picked.length
        ? Math.min(...picked.map(p => hslDistance(hc, getHsl(p))))
        : 1; // if none picked (edge), any is fine
      if (score > bestScore) { best = c; bestScore = score; }
    }
    picked.push(best);
    pool.splice(pool.indexOf(best),1);
  }
  return normalizePalette(picked.slice(0, k));
}
