import { state } from './state.js';

export function normId(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
export function toWikiTitle(s) { return String(s || '').trim().replace(/\s+/g, '_'); }
export function dePunct(s) { return String(s||'').replace(/[.,'’"()!]/g, ''); }

export function slugTokensFrom(s) {
  return dePunct(String(s)).trim().replace(/[–—]/g, '-').replace(/\s+/g, ' ')
    .split(/[\s\-]+/).filter(Boolean).map(t => t.toLowerCase());
}
export function joinTokens(tokens) { return tokens.join('-'); }

const HONORIFICS = new Set(['mr','mrs','ms','sir','dame','dr','prof','professor','his','her','holiness','the','saint','st','of','tibet']);
function withoutHonorifics(tokens) {
  const t = tokens.slice();
  const long = t.join(' ');
  if (/(his\s+holiness).*dalai.*lama/i.test(long)) {
    return t.filter(x => !HONORIFICS.has(x) && !/^\d+(th|st|nd|rd)$/.test(x));
  }
  while (t.length && HONORIFICS.has(t[0])) t.shift();
  return t;
}
function withoutInitials(tokens) { return tokens.filter(t => t.length > 1 && !/^\d+(th|st|nd|rd)$/.test(t)); }
function compactInitials(tokens) {
  const out = []; let buf = '';
  for (const t of tokens) {
    if (t.length === 1) buf += t; else { if (buf) { out.push(buf); buf=''; } out.push(t); }
  }
  if (buf) out.push(buf);
  return out;
}

export function cardFileCandidates(fig) {
  const baseId = String(fig.id || '').trim();
  const nameLike = String(fig.name || fig.title || baseId.replace(/-/g, ' '));

  const idTokens   = slugTokensFrom(baseId.replace(/-/g, ' '));
  const nameTokens = slugTokensFrom(nameLike);

  const candidates = new Set();
  if (baseId) candidates.add(baseId);
  if (nameTokens.length) candidates.add(joinTokens(nameTokens));

  const noHon   = withoutHonorifics(nameTokens);
  const noInit  = withoutInitials(noHon);
  const compact = compactInitials(noHon);
  if (noHon.length)   candidates.add(joinTokens(noHon));
  if (noInit.length)  candidates.add(joinTokens(noInit));
  if (compact.length) candidates.add(joinTokens(compact));

  const idNoInit  = withoutInitials(idTokens);
  const idCompact = compactInitials(idTokens);
  if (idNoInit.length)  candidates.add(joinTokens(idNoInit));
  if (idCompact.length) candidates.add(joinTokens(idCompact));

  // Special heuristics
  const s = nameLike.toLowerCase();
  if (s.includes('dalai') && s.includes('lama')) { candidates.add('dalai-lama'); candidates.add('14th-dalai-lama'); candidates.add('tenzin-gyatso'); }
  if (s.includes('tim') && s.includes('berners') && s.includes('lee')) candidates.add('tim-berners-lee');
  if (s.includes('david') && s.includes('attenborough')) candidates.add('david-attenborough');
  if (s.includes('ed') && s.includes('felten')) { candidates.add('ed-felten'); candidates.add('edward-felten'); }
  if (s.includes('andreas') && s.includes('antonopoulos')) candidates.add('andreas-antonopoulos');
  if (s.includes('thomas') && s.includes('campbell')) candidates.add('thomas-campbell');
  if (s.includes('jacques') && s.includes('cousteau')) candidates.add('jacques-cousteau');
  if (s.includes('claude') && s.includes('shannon')) candidates.add('claude-shannon');
  if (s.includes('robert') && s.includes('clarke') && s.includes('connell')) { candidates.add('robert-clarke'); candidates.add('robert-c-clarke'); }
  if (s.includes('mira') && s.includes('murati')) candidates.add('mira-murati');

  return Array.from(candidates);
}

export function buildUrlIndex(urlsObj) {
  const idx = {};
  Object.entries(urlsObj || {}).forEach(([k, v]) => { idx[normId(k)] = v; });
  return idx;
}
export function getWikiUrl(fig, cardData) {
  if (cardData?.wikiOverride) return cardData.wikiOverride;
  const byId = state.urls[fig.id];
  if (byId) return byId;
  const ni = normId(fig.id);
  if (state.urlIndex[ni]) return state.urlIndex[ni];
  const nName = normId(fig.name || fig.display || fig.title || '');
  if (nName && state.urlIndex[nName]) return state.urlIndex[nName];
  const guessName = fig.name || fig.title || fig.id.replace(/-/g, ' ');
  return guessName ? `https://en.wikipedia.org/wiki/${encodeURIComponent(toWikiTitle(guessName))}` : null;
}
