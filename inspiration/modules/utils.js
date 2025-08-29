// Helpers: slugging, wiki title handling, adjacency, color assignment, sanitizer
export function slugify(str) {
  return (str || '').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,128);
}

export function displayTitleString(title) {
  try { title = decodeURIComponent(title); } catch {}
  return (title || '').replace(/_/g,' ');
}

export function urlToTitle(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/wiki/')) return decodeURIComponent(u.pathname.replace('/wiki/','')).split('#')[0];
    const t = u.searchParams.get('title'); if (t) return decodeURIComponent(t).split('#')[0];
  } catch {}
  return decodeURIComponent(String(url).split('/').pop() || '').split('#')[0].replace(/_/g,' ');
}

export function cacheKey(title, fragment) {
  return `${title}#${fragment || 'ALL'}`;
}

export function extractFragment(url) {
  try { return new URL(url).hash.replace(/^#/, '') || null; } catch { return null; }
}

export function isCollapsibleHeading(line) {
  return /^(references?|citations?|notes|footnotes?|bibliography|external links|further reading|see also)$/i
    .test((line || '').trim());
}

// DOM sanitize minimal (strip scripts/styles, rewrite links)
export function sanitizeAndRewrite(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  ['script','style','meta','link'].forEach(sel => doc.querySelectorAll(sel).forEach(n => n.remove()));

  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) return;
    else if (href.startsWith('/')) {
      a.setAttribute('href', `https://en.wikipedia.org${href}`);
      a.setAttribute('target', '_blank'); a.setAttribute('rel','noopener noreferrer');
    } else if (/^https?:\/\//i.test(href)) {
      a.setAttribute('target','_blank'); a.setAttribute('rel','noopener noreferrer');
    }
  });

  // clean inline styles
  doc.querySelectorAll('[style]').forEach(n => n.removeAttribute('style'));
  doc.querySelectorAll('.mw-editsection, .toc, .navbox, .metadata').forEach(n => n.remove());

  return doc.body.innerHTML;
}

/* ===== Color assignment with adjacency constraint =====
   - After cards are in the grid, compute columns via gridTemplateColumns.
   - Greedy, load-balanced palette: choose among allowed colors with least usage.
*/
export function computeColumnCount(gridEl) {
  const cs = getComputedStyle(gridEl);
  const cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
  if (cols > 0) return cols;
  // Fallback: estimate via min card width of 280px + gap 16px
  const w = gridEl.clientWidth || 1200;
  return Math.max(1, Math.floor((w + 16) / (280 + 16)));
}

export function assignBalancedColors(cards, palette, gridEl) {
  const n = cards.length;
  if (!n || !palette?.length) return;
  const cols = computeColumnCount(gridEl);
  const colorOf = new Array(n).fill(null);
  const counts = new Map(palette.map((c) => [c, 0]));

  const neighbors = (i) => {
    const res = [];
    const row = Math.floor(i / cols);
    const col = i % cols;
    if (col > 0) res.push(i - 1);
    if (col < cols - 1 && i + 1 < n) res.push(i + 1);
    if (i - cols >= 0) res.push(i - cols);
    if (i + cols < n) res.push(i + cols);
    return res;
  };

  const order = [...Array(n).keys()];
  // shuffle to randomize pattern
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  for (const idx of order) {
    const forb = new Set(neighbors(idx).map(j => colorOf[j]).filter(Boolean));
    // candidate colors sorted by usage (low first)
    const candidates = palette
      .filter(c => !forb.has(c))
      .sort((a,b) => (counts.get(a) - counts.get(b)) || (Math.random() - 0.5));
    const chosen = candidates[0] || palette.sort((a,b)=>counts.get(a)-counts.get(b))[0];
    colorOf[idx] = chosen;
    counts.set(chosen, counts.get(chosen) + 1);
  }

  cards.forEach((card, i) => {
    const c = colorOf[i];
    card.style.setProperty('--card-accent', c);
    const swatch = card.querySelector('.swatch');
    if (swatch) swatch.style.background = c;
    // optional border tint
    card.style.boxShadow = `0 6px 24px ${hexToRGBA(c, .25)}`;
  });
}

function hexToRGBA(hex, a) {
  const m = hex.replace('#','');
  const bigint = parseInt(m, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${a})`;
}
