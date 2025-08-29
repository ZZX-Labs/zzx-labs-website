// Small shared helpers

export function slugify(str) {
  return (str || '').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,128);
}

export function extractFragment(url) {
  try { return new URL(url).hash.replace(/^#/, '') || null; } catch { return null; }
}

export function urlToTitle(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/wiki/')) {
      return decodeURIComponent(u.pathname.replace('/wiki/','')).split('#')[0];
    }
    const t = u.searchParams.get('title');
    if (t) return decodeURIComponent(t).split('#')[0];
  } catch {}
  return decodeURIComponent(String(url).split('/').pop() || '')
    .split('#')[0].replace(/_/g,' ');
}

export function displayTitleString(title) {
  try { title = decodeURIComponent(title); } catch {}
  return title.replace(/_/g,' ');
}

export function cacheKey(title, fragment) {
  return `${title}#${fragment || 'ALL'}`;
}
export function cacheSlug(title, fragment) {
  return slugify(`${title}--${fragment || 'all'}`);
}

export function isCollapsibleHeading(line) {
  return /^(references?|citations?|notes|footnotes?|bibliography|external links|further reading|see also)$/i
    .test((line || '').trim());
}
