// /inspiration/figures/modules/images.js
import { IMGS_DIR } from './paths.js';
import { urlJoin } from './net.js';

export const PLACEHOLDERS = [
  'figure-placeholder.webp',
  'figure-placeholder.png',
  'placeholder.webp',
  'placeholder.png',
  'placeholder.jpg',
];

// Absolute/relative passthrough; otherwise join to IMGS_DIR
export function asDocUrl(pathOrName) {
  if (!pathOrName) return null;
  const s = String(pathOrName).trim();
  if (/^(?:[a-z]+:|\/|\.{1,2}\/)/i.test(s)) return s;
  return String(urlJoin(IMGS_DIR, s));
}

// ---------- helpers ----------
function stripDiacritics(s) {
  try { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  catch { return s; }
}
function cleanBase(s) {
  return stripDiacritics(String(s || '')
    .replace(/[\(\)\[\]{}'"“”‘’.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}
function slugify(s) {
  return cleanBase(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function titleUnderscore(s) {
  return cleanBase(s)
    .split(/\s+/)
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join('_');
}

// Build ordered candidates: explicit → best guesses → placeholders
export function imageCandidates(id, name, primary, legacy) {
  const list = [];
  const pushFile = (fn) => { if (fn) list.push(asDocUrl(fn)); };

  // 1) Explicit inputs first
  pushFile(primary);
  pushFile(legacy);

  // 2) Guesses based on id/name in several common patterns
  const baseId   = slugify(id);
  const nameSlug = slugify(name || id);
  const titleU   = titleUnderscore(name || id);
  const titleD   = titleU.replace(/_/g, '-');

  const bases = Array.from(new Set([baseId, nameSlug, titleU, titleD].filter(Boolean)));
  const exts = ['webp', 'jpg', 'jpeg', 'png']; // prefer modern → common

  for (const b of bases) {
    for (const ext of exts) pushFile(`${b}.${ext}`);
  }

  // 3) Final fallbacks (in /images/)
  for (const ph of PLACEHOLDERS) pushFile(ph);

  // De-dupe while preserving order
  const seen = new Set();
  return list.filter(u => {
    const k = String(u);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Optional vanilla <img> fallback handler
export function applyImgFallback(imgEl, candidates) {
  if (!imgEl || !candidates?.length) return;
  let i = 0;
  const tryNext = () => {
    if (i >= candidates.length) return;
    imgEl.src = candidates[i++];
  };
  imgEl.addEventListener('error', tryNext, { once: false });
  if (!imgEl.getAttribute('src')) tryNext();
}
