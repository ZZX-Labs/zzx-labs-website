// Only color the rim (ring) + small swatch in the header.
// Card background & text stay on your theme from CSS.

/* ---------- helpers ---------- */
export function hexToRgb(hex) {
  const h = String(hex || '').replace('#','').trim();
  if (h.length === 3) {
    const r = parseInt(h[0]+h[0],16), g = parseInt(h[1]+h[1],16), b = parseInt(h[2]+h[2],16);
    return { r, g, b };
  }
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return { r, g, b };
}
export function rgbToHex(r,g,b) {
  const h = n => Math.max(0, Math.min(255, n|0)).toString(16).padStart(2,'0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
export function mixHex(aHex, bHex, t) {
  const a = hexToRgb(aHex), b = hexToRgb(bHex);
  const r = Math.round(a.r + (b.r - a.r)*t);
  const g = Math.round(a.g + (b.g - a.g)*t);
  const b3 = Math.round(a.b + (b.b - a.b)*t);
  return rgbToHex(r,g,b3);
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
  const base = String(colorHex || '').startsWith('#') ? colorHex : `#${colorHex}`;

  // expose the color to CSS; style.css uses --edge to draw the ring
  card.style.setProperty('--edge', base);

  // do NOT overwrite the themed background/text
  card.style.removeProperty('background');
  card.style.removeProperty('color');
  card.style.removeProperty('borderColor');
  card.style.removeProperty('--card-accent');
  card.style.removeProperty('--card-text');

  // swatch in header
  const swatch = card.querySelector('.swatch');
  if (swatch) {
    swatch.style.background = base;
    const outline = chooseTextColor(base) + '40'; // ~25% alpha
    swatch.style.outlineColor = outline;
  }

  // leave links to theme
  card.querySelectorAll('a').forEach(a => {
    a.style.color = '';
    a.style.textDecorationColor = '';
  });

  card.dataset.colorResolved = base;
}
