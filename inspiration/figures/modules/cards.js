// /inspiration/figures/modules/cards.js
import { state } from './state.js';
import { CARDS_DIR, IMAGES_DIR, PLACEHOLDER_IMG } from './paths.js';
import { j, urlJoin } from './net.js';
import { cardFileCandidates } from './names.js';

const VALID_EXTS = ['.jpg','.jpeg','.png','.webp','.avif','.gif'];

const hasProto = v => /^https?:\/\//i.test(v) || /^data:|^blob:/.test(v);
const hasExt   = v => VALID_EXTS.some(ext => v.toLowerCase().endsWith(ext));
const isRooted = v => v.startsWith('/');

function resolveImagePath(id, candidate, legacy) {
  // 1) hard absolute (http, data, blob) → return as-is
  if (candidate && hasProto(candidate)) return candidate;

  // 2) legacy absolute → prefer if present
  if (legacy && hasProto(legacy)) return legacy;

  // 3) already rooted path “/images/foo.jpg” → keep as-is
  if (candidate && isRooted(candidate)) return candidate;

  // 4) bare filename or relative → map to images/
  let base = candidate || `${id}.jpg`;
  if (!hasExt(base)) base += '.jpg';
  return urlJoin(IMAGES_DIR, base);
}

export function normalizeCard(id, raw = {}) {
  const lc = {};
  Object.keys(raw).forEach(k => (lc[k.toLowerCase()] = raw[k]));

  const name = lc.name || lc.titlename || lc.display || lc.title || id.replace(/-/g,' ');
  const alt  = lc.alt || name;

  // grab image hints
  const imageCandidate = lc.image || lc.imagefile || lc.img || lc.picture || lc.photourl || null;
  const legacyImageSrc = lc.legacyimagesrc || lc.legacy || null;

  // final image path (rooted/absolute respected, otherwise /images)
  const image = resolveImagePath(id, imageCandidate, legacyImageSrc);
  const placeholder = PLACEHOLDER_IMG;

  // meta bullets
  let meta = [];
  if (Array.isArray(lc.meta)) meta = lc.meta.slice();
  else if (Array.isArray(lc.h5)) meta = lc.h5.slice();
  else if (Array.isArray(lc.bullets)) meta = lc.bullets.slice();
  else if (Array.isArray(lc.lines)) meta = lc.lines.slice();

  const addIf = (label, key) => { if (lc[key]) meta.push(`${label}: ${lc[key]}`); };
  addIf('Background',     'background');
  addIf('Known For',      'knownfor');
  addIf('Field',          'field');
  addIf('Contributions',  'contributions');

  // about block
  const htmlKey = lc.abouthtml ?? lc.about_html ?? lc.summaryhtml ?? lc.summary_html;
  let aboutHtml = '';
  let textKey = lc.about ?? lc.summary ?? lc.description ?? lc.desc ?? lc.blurb;
  if (!textKey && lc.bio) textKey = Array.isArray(lc.bio) ? lc.bio : String(lc.bio);

  if (htmlKey) aboutHtml = String(htmlKey);
  else if (textKey) {
    aboutHtml = Array.isArray(textKey)
      ? textKey.map(p => `<p>${String(p)}</p>`).join('')
      : `<p>${String(textKey)}</p>`;
  }

  const wikiOverride = lc.wikipedia || lc.wiki || lc.url || lc.href || null;

  return { name, alt, image, placeholder, legacyImageSrc, meta, aboutHtml, wikiOverride };
}

export async function loadCard(fig) {
  const bases = cardFileCandidates(fig);
  for (const base of bases) {
    const url = urlJoin(CARDS_DIR, `${base}.json`);
    try {
      const data = await j(url);
      state.cards[fig.id] = data || {};
      return;
    } catch (_) { /* try next candidate */ }
  }
  console.warn(`[cards] No card JSON found for ${fig.id} (tried: ${bases.map(b=>b+'.json').join(', ')})`);
  state.cards[fig.id] = {};
}
