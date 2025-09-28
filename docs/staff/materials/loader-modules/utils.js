// Small shared helpers (v2: safer decode, better heading detection, anchor normalization)

export function safeDecode(str) {
  try { return decodeURIComponent(str); } catch { return String(str || ''); }
}

/** Slugify a string to [a-z0-9-], capped at 128 chars. */
export function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);
}

/** Normalize a MediaWiki-style anchor/heading for comparison. */
export function normalizeHeadingString(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/[–—]/g, '-')                // en/em dash to hyphen
    .replace(/[\u2000-\u206F]/g, '')      // general punctuation block
    .replace(/[^\p{L}\p{N}\s&-]/gu, '')   // keep letters/digits/space/&/-
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract the hash fragment from a URL (without the leading '#'). */
export function extractFragment(url) {
  try { return new URL(url).hash.replace(/^#/, '') || null; } catch { return null; }
}

/** Normalize an internal anchor id (best-effort; not full MW algorithm). */
export function normalizeAnchor(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, '_');  // MW typically replaces spaces with underscores
}

/** Convert a Wikipedia URL to a page title (decoded, no fragment). */
export function urlToTitle(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/wiki/')) {
      return safeDecode(u.pathname.replace('/wiki/', '')).split('#')[0];
    }
    const t = u.searchParams.get('title');
    if (t) return safeDecode(t).split('#')[0];
  } catch {}
  return safeDecode(String(url).split('/').pop() || '').split('#')[0].replace(/_/g, ' ');
}

/** Display-friendly title: decode percent escapes and swap underscores for spaces. */
export function displayTitleString(title) {
  return safeDecode(title).replace(/_/g, ' ');
}

/** Compose a cache key for a page + optional fragment. */
export function cacheKey(title, fragment) {
  return `${title}#${fragment || 'ALL'}`;
}

/** Compose a cache slug for static files. */
export function cacheSlug(title, fragment) {
  return slugify(`${title}--${fragment || 'all'}`);
}

/**
 * Decide if a heading should be treated as “references/citations-like” purely by its text.
 */
export function isCollapsibleHeading(line) {
  const h = normalizeHeadingString(line);
  if (!h) return false;

  const singles = new Set([
    'references','reference','citations','citation','notes','footnotes','footnote',
    'bibliography','external links','further reading','see also','sources','works cited','literature'
  ]);
  if (singles.has(h)) return true;

  if (/(notes?|references?|citations?|footnotes?)\s+(and|&)\s+(notes?|references?|citations?|footnotes?)/.test(h)) {
    return true;
  }
  if (/(references?|bibliography|works cited|sources).*(further reading|external links|see also)/.test(h)) {
    return true;
  }
  if (/(references?|notes?)\s*\/\s*(references?|notes?)/.test(h)) return true;

  return false;
}
