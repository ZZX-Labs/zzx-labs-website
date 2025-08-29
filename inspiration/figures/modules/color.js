// /inspiration/figures/modules/color.js
// Rim-only color: sets --edge on the card + paints .swatch.
// Card background/text remain controlled by CSS theme.

/* ---------- utils ---------- */
const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function readAccentFallback() {
  // Read --accent from :root; fallback to brand green if missing
  const root = getComputedStyle(document.documentElement);
  const v = root.getPropertyValue('--accent').trim();
  return v ? normalizeHex(v, '#c0d674') : '#c0d674';
}

export function normalizeHex(input, fallback = '#c0d674') {
  if (!input || typeof input !== 'string') return fallback;
  const s = input.trim();
  const m = s.match(HEX_RE);
  if (!m) return fallback;
  let hex = m[1];           // 3, 6, or 8 chars (8 = RGBA)
  if (hex.length === 3) {   // expand #rgb → #rrggbb
    hex = hex.split('').map(c => c + c).join('');
  } else if (hex.length === 8) {
    // Drop alpha (#rrggbbaa → #rrggbb); rim color doesn't need alpha here
    hex = hex.slice(0, 6);
  }
  return `#${hex.toLowerCase()}`;
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex);
  const r = parseInt(h.slice(1,3),16);
  const g = parseInt(h.slice(3,5),16);
  const b = parseInt(h.slice(5,7),16);
  return { r, g, b };
}

export function rgbToHex(r,g,b) {
  const h = n => Math.max(0, Math.min(255, n|0)).toString(16).padStart(2,'0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function mixHex(aHex, bHex, t) {
  const a = hexToRgb(aHex), b = hexToRgb(bHex);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return rgbToHex(r,g,bl);
}

export function luminance(hex) {
  const {r,g,b} = hexToRgb(hex);
  const lin = c => {
    const s = c/255;
    return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4);
  };
  return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
}

export function contrastRatio(a, b) {
  const L1 = Math.max(luminance(a), luminance(b));
  const L2 = Math.min(luminance(a), luminance(b));
  return (L1 + 0.05) / (L2 + 0.05);
}

export function chooseTextColor(bg) {
  const white = '#ffffff';
  const black = '#111111';
  const rW = contrastRatio(bg, white);
  const rB = contrastRatio(bg, black);
  return (rW >= rB) ? white : black;
}

/* ---------- rim-only paint ---------- */
export function setCardPaint(card, colorHex) {
  if (!card) return;

  // Resolve a valid hex, prefer provided → existing → theme accent
  const fallback = readAccentFallback();
  const desired = normalizeHex(colorHex || card.dataset.colorResolved || fallback, fallback);

  // No-op if already applied
  if (card.dataset.colorResolved === desired) return;

  // Expose the color to CSS; style.css uses --edge to draw the ring
  card.style.setProperty('--edge', desired);

  // Explicitly avoid overriding themed body styles
  card.style.removeProperty('background');
  card.style.removeProperty('color');
  card.style.removeProperty('borderColor');
  card.style.removeProperty('--card-accent');
  card.style.removeProperty('--card-text');

  // Header swatch
  const swatch = card.querySelector('.swatch');
  if (swatch) {
    swatch.style.background = desired;
    // subtle outline that adapts to light/dark colors
    const outline = chooseTextColor(desired) + '40'; // ~25% alpha
    swatch.style.outlineColor = outline;
  }

  // Let links inherit theme colors
  card.querySelectorAll('a').forEach(a => {
    a.style.color = '';
    a.style.textDecorationColor = '';
  });

  // Persist
  card.dataset.colorResolved = desired;
}
