import { state } from './state.js';

export function hexToRgb(hex) {
  const h = hex.replace('#','').trim();
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
export function shade(hex, amount=0.22) { return mixHex(hex, '#000000', amount); }

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
  if (rW >= 4.5 || rB >= 4.5) return (rW >= rB) ? white : black;
  return (rW >= rB) ? white : black;
}

export function setCardPaint(card, colorHex) {
  const base   = colorHex;
  const top    = shade(base, 0.22);
  const bot    = base;
  const border = shade(base, 0.4);
  const text   = chooseTextColor(base);

  card.style.background = `linear-gradient(145deg, ${top} 0%, ${bot} 100%)`;
  card.style.borderColor = border;
  card.style.setProperty('--card-accent', base);
  card.style.setProperty('--card-text', text);
  card.style.color = text;

  card.querySelectorAll('a').forEach(a => {
    a.style.color = text;
    a.style.textDecorationColor = text;
  });

  card.dataset.bgColor = base;
}
