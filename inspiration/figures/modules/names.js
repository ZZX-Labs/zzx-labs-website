// /inspiration/figures/modules/names.js
import { state } from './state.js';

/* ---------- base utils ---------- */
export function normId(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
export function toWikiTitle(s) {
  return String(s || '').trim().replace(/\s+/g, '_');
}
export function dePunct(s) {
  return String(s || '').replace(/[.,'’"()!&]/g, ''); // include & as well
}

/* ---------- robust slug helpers ---------- */
function stripDiacritics(s) {
  try { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  catch { return s; }
}
function baseClean(s) {
  return stripDiacritics(String(s || '')
    .replace(/[“”‘’]/g, '"')
    .replace(/[(){}\[\].,]/g, ' ')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[+]/g, ' plus ')
    .replace(/\s+/g, ' ')
    .trim());
}
function slugify(s) {
  return baseClean(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
export function slugTokensFrom(s) {
  return baseClean(dePunct(String(s)))
    .replace(/[–—]/g, '-')
    .split(/[\s\-]+/)
    .filter(Boolean)
    .map(t => t.toLowerCase());
}
export function joinTokens(tokens) { return tokens.join('-'); }

/* ---------- token transforms ---------- */
const HONORIFICS = new Set([
  'mr','mrs','ms','sir','dame','dr','prof','professor',
  'his','her','holiness','saint','st'
]);
// light stopwords used for “extra” candidates (we still keep originals)
const STOPWORDS = new Set(['of','the','and','von','van','de','da','del','la','le','di','du','dos','das','y','ii','iii','iv','xiv']);

function withoutHonorifics(tokens) {
  const t = tokens.slice();
  const long = t.join(' ');
  // special: His Holiness the 14th Dalai Lama of Tibet → strip ceremony words
  if (/(his\s+holiness).*dalai.*lama/i.test(long)) {
    return t.filter(x => !HONORIFICS.has(x) && !STOPWORDS.has(x) && !/^\d+(th|st|nd|rd)$/.test(x));
  }
  while (t.length && HONORIFICS.has(t[0])) t.shift();
  return t;
}
function withoutInitials(tokens) {
  // remove 1-letter tokens and ordinal numbers
  return tokens.filter(t => t.length > 1 && !/^\d+(th|st|nd|rd)$/.test(t));
}
function compactInitials(tokens) {
  // "B. R. Ambedkar" → ["br","ambedkar"]
  const out = []; let buf = '';
  for (const t of tokens) {
    if (t.length === 1) buf += t;
    else { if (buf) { out.push(buf); buf=''; } out.push(t); }
  }
  if (buf) out.push(buf);
  return out;
}
function withoutStopwords(tokens) {
  return tokens.filter(t => !STOPWORDS.has(t));
}

/* ---------- candidate builder for card JSON filenames ---------- */
export function cardFileCandidates(fig) {
  const baseId   = String(fig.id || '').trim();
  const nameLike = String(fig.name || fig.title || baseId.replace(/-/g, ' '));

  const idTokens   = slugTokensFrom(baseId.replace(/-/g, ' '));
  const nameTokens = slugTokensFrom(nameLike);

  const ordered = [];
  const push = v => { if (v && !ordered.includes(v)) ordered.push(v); };

  // raw id & raw name slug (most likely)
  if (baseId) push(slugify(baseId));
  if (nameTokens.length) push(joinTokens(nameTokens));

  // variants from name
  const noHon    = withoutHonorifics(nameTokens);
  const noInit   = withoutInitials(noHon);
  const compact  = compactInitials(noHon);        // e.g., "b r ambedkar" -> "br-ambedkar"
  const noStops  = withoutStopwords(noInit);      // e.g., remove 'of', 'the', etc.

  if (noHon.length)   push(joinTokens(noHon));
  if (noInit.length)  push(joinTokens(noInit));
  if (compact.length) push(joinTokens(compact));
  if (noStops.length) push(joinTokens(noStops));

  // variants from id
  const idNoInit   = withoutInitials(idTokens);
  const idCompact  = compactInitials(idTokens);
  const idNoStops  = withoutStopwords(idNoInit);

  if (idNoInit.length)  push(joinTokens(idNoInit));
  if (idCompact.length) push(joinTokens(idCompact));
  if (idNoStops.length) push(joinTokens(idNoStops));

  // Specific heuristics (common cases in your dataset)
  const s = nameLike.toLowerCase();

  // Dalai Lama
  if (s.includes('dalai') && s.includes('lama')) {
    push('dalai-lama'); push('14th-dalai-lama'); push('tenzin-gyatso');
  }

  // Sir Tim Berners-Lee
  if (s.includes('tim') && s.includes('berners') && s.includes('lee')) push('tim-berners-lee');

  // Sir David Attenborough
  if (s.includes('david') && s.includes('attenborough')) push('david-attenborough');

  // Edward "Ed" Felten
  if (/\bed\b/.test(s) && s.includes('felten')) { push('ed-felten'); push('edward-felten'); }

  // Andreas M. Antonopoulos
  if (s.includes('andreas') && s.includes('antonopoulos')) push('andreas-antonopoulos');

  // Thomas P. Campbell
  if (s.includes('thomas') && s.includes('campbell')) push('thomas-campbell');

  // Jacques-Yves Cousteau (often just "Jacques Cousteau")
  if (s.includes('jacques') && s.includes('cousteau')) push('jacques-cousteau');

  // Claude E. Shannon → Claude Shannon
  if (s.includes('claude') && s.includes('shannon')) push('claude-shannon');

  // Robert Connell Clarke variants
  if (s.includes('robert') && s.includes('clarke') && s.includes('connell')) {
    push('robert-clarke'); push('robert-c-clarke');
  }

  // Mira Murati
  if (s.includes('mira') && s.includes('murati')) push('mira-murati');

  // S. N. Goenka
  if (s.includes('goenka')) { push('sn-goenka'); push('s-n-goenka'); push('satya-narayan-goenka'); }

  // B. R. Ambedkar
  if (s.includes('ambedkar')) { push('br-ambedkar'); push('b-r-ambedkar'); push('bhimrao-ramji-ambedkar'); }

  // Claude E Shannon sometimes present as "Claude E Shannon" (no dots)
  if (/\bclaude\b.*\bshannon\b/.test(s)) push('claude-e-shannon');

  return ordered;
}

/* ---------- URL index + wiki URL ---------- */
export function buildUrlIndex(urlsObj) {
  const idx = {};
  Object.entries(urlsObj || {}).forEach(([k, v]) => {
    const k1 = String(k);
    const norm = normId(k1);
    const slug = slugify(k1);
    idx[norm] = v;
    idx[slug] = v;
    // also map without dots/spaces (e.g., "Claude E Shannon")
    idx[normId(k1.replace(/[.\s]/g, ''))] = v;
  });
  return idx;
}

export function getWikiUrl(fig, cardData) {
  if (cardData?.wikiOverride) return cardData.wikiOverride;

  // explicit by id key
  const byId = state.urls?.[fig.id];
  if (byId) return byId;

  // index hits
  const ni      = normId(fig.id);
  const slugId  = slugify(fig.id);
  const nameStr = fig.name || fig.display || fig.title || '';
  const nn      = normId(nameStr);
  const slugNm  = slugify(nameStr);

  const idx = state.urlIndex || {};
  if (idx[ni])     return idx[ni];
  if (idx[slugId]) return idx[slugId];
  if (idx[nn])     return idx[nn];
  if (idx[slugNm]) return idx[slugNm];

  // last resort: guess Wikipedia title from name or id
  const guessName = nameStr || String(fig.id || '').replace(/-/g, ' ');
  return guessName ? `https://en.wikipedia.org/wiki/${encodeURIComponent(toWikiTitle(guessName))}` : null;
}
