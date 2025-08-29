import { state } from './state.js';
import { CARDS_DIR } from './paths.js';
import { j, urlJoin } from './net.js';
import { cardFileCandidates } from './names.js';

export function normalizeCard(id, raw = {}) {
  const lc = {}; Object.keys(raw).forEach(k => lc[k.toLowerCase()] = raw[k]);

  const name = lc.name || lc.titlename || lc.display || lc.title || id.replace(/-/g,' ');
  const alt  = lc.alt || name;

  const image = lc.image || lc.imagefile || lc.img || lc.picture || lc.photourl || `${id}.jpg`;
  const legacyImageSrc = lc.legacyimagesrc || lc.legacy || null;

  let meta = [];
  if (Array.isArray(lc.meta)) meta = lc.meta.slice();
  else if (Array.isArray(lc.h5)) meta = lc.h5.slice();
  else if (Array.isArray(lc.bullets)) meta = lc.bullets.slice();
  else if (Array.isArray(lc.lines)) meta = lc.lines.slice();

  const addIf = (label, key) => { if (lc[key]) meta.push(`${label}: ${lc[key]}`); };
  addIf('Background', 'background');
  addIf('Known For',  'knownfor');
  addIf('Field',      'field');
  addIf('Contributions', 'contributions');

  const htmlKey = lc.abouthtml ?? lc.about_html ?? lc.summaryhtml ?? lc.summary_html;
  let aboutHtml = '';
  let textKey = lc.about ?? lc.summary ?? lc.description ?? lc.desc ?? lc.blurb;
  if (!textKey && lc.bio) textKey = Array.isArray(lc.bio) ? lc.bio : String(lc.bio);

  if (htmlKey) aboutHtml = String(htmlKey);
  else if (textKey) aboutHtml = Array.isArray(textKey) ? textKey.map(p => `<p>${String(p)}</p>`).join('') : `<p>${String(textKey)}</p>`;

  const wikiOverride = lc.wikipedia || lc.wiki || lc.url || lc.href || null;

  return { name, alt, image, legacyImageSrc, meta, aboutHtml, wikiOverride };
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
