// inspiration/modules/utils.js
// Helpers: slugging, wiki title handling, sanitizer, and rim-only color assignment

/* ================== String + URL helpers ================== */
export function slugify(str) {
  return (str || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);
}

export function displayTitleString(title) {
  try { title = decodeURIComponent(title); } catch {}
  return (title || '').replace(/_/g, ' ');
}

export function urlToTitle(url) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/wiki/')) return decodeURIComponent(u.pathname.replace('/wiki/', '')).split('#')[0];
    const t = u.searchParams.get('title');
    if (t) return decodeURIComponent(t).split('#')[0];
  } catch {}
  return decodeURIComponent(String(url).split('/').pop() || '').split('#')[0].replace(/_/g, ' ');
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

/* ================== Minimal sanitizer ================== */
// Strip dangerous/irrelevant bits and rewrite links to open in a new tab
export function sanitizeAndRewrite(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  ['script','style','meta','link','noscript'].forEach(sel =>
    doc.querySelectorAll(sel).forEach(n => n.remove())
  );

  doc.querySelectorAll('.mw-editsection, .toc, .navbox, .metadata').forEach(n => n.remove());

  doc.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!href) return;
    if (href.startsWith('#')) return;
    if (href.startsWith('/')) {
      a.setAttribute('href', `https://en.wikipedia.org${href}`);
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  // Clean inline styles that slip through
  doc.querySelectorAll('[style]').forEach(n => n.removeAttribute('style'));

  return doc.body.innerHTML;
}

/* ================== Grid + colors (RIM ONLY) ================== */
/**
 * Compute current column count from a CSS grid container.
 * Works with repeat(auto-fill, minmax(...)) by reading the resolved template.
 */
export function computeColumnCount(gridEl) {
  if (!gridEl) return 1;
  const cs = getComputedStyle(gridEl);
  const tpl = cs.getPropertyValue('grid-template-columns') || '';
  // If the browser expands repeat(...) you'll get a list like "376px 376px 376px"
  const parts = tpl.trim().split(/\s+/).filter(Boolean);
  if (parts.length && tpl !== 'none') return parts.length;

  // Fallback heuristic (min card 280 + gap ~16)
  const w = gridEl.clientWidth || 1200;
  const gap = parseFloat(cs.columnGap || '16') || 16;
  const min = 280;
  return Math.max(1, Math.floor((w + gap) / (min + gap)));
}

/**
 * Assign balanced, non-adjacent rim colors.
 * - Colors are applied to the OUTER RIM ONLY via CSS var `--edge`
 * - Card background/text remain Theme-controlled (no overrides here)
 * - Avoid immediate left/above collisions, balance usage across palette
 * - Stable-ish: if a card already has a color and it’s still valid, keep it
 *
 * @param {HTMLElement[]} cards - list of card <article.feature-card> elements
 * @param {string[]} palette - array of hex colors (#rrggbb)
 * @param {HTMLElement} gridEl - the grid container (used to infer columns)
 */
export function assignBalancedColors(cards, palette, gridEl) {
  if (!Array.isArray(cards) || !cards.length || !Array.isArray(palette) || !palette.length) return;

  // Normalize + dedupe palette
  const pal = Array.from(new Set(palette.map(normalizeHex))).filter(Boolean);
  if (!pal.length) return;

  // Columns based on current layout
  const cols = computeColumnCount(gridEl);

  // Usage counts seeded with already-assigned colors (keeps balance + stability)
  const usage = Object.fromEntries(pal.map(c => [c, 0]));
  const visCards = cards.filter(c => c && c.offsetParent !== null);

  visCards.forEach(card => {
    const prev = normalizeHex(card.dataset.colorResolved || card.style.getPropertyValue('--edge'));
    if (prev && usage[prev] != null) usage[prev]++;
  });

  const maxTarget = Math.ceil(visCards.length / pal.length);

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card) continue;

    // Derive row/col in the visual sequence
    const row = Math.floor(i / cols);
    const col = i % cols;

    const left  = (col > 0     && cards[i - 1]) ? getResolvedColor(cards[i - 1]) : null;
    const above = (row > 0     && cards[i - cols]) ? getResolvedColor(cards[i - cols]) : null;

    const current = getResolvedColor(card);

    // Keep current if it doesn't collide
    if (current && current !== left && current !== above) {
      // Make sure CSS var is set if coming from data only
      applyRimColor(card, current);
      continue;
    }

    // Allowed palette (avoid immediate neighbors)
    let allowed = pal.filter(c => c !== left && c !== above);
    if (!allowed.length) allowed = pal.slice();

    // Choose least-used
    const minUse = Math.min(...allowed.map(c => usage[c] ?? 0));
    let candidates = allowed.filter(c => (usage[c] ?? 0) === minUse);

    // Prefer not to blow past an even spread
    const underCap = candidates.filter(c => (usage[c] ?? 0) < maxTarget);
    if (underCap.length) candidates = underCap;

    // Mild randomization within the least-used set
    const pick = candidates[(Math.random() * candidates.length) | 0] || pal[0];

    applyRimColor(card, pick);
    usage[pick] = (usage[pick] ?? 0) + 1;
  }
}

/* ---------- internals ---------- */
const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function normalizeHex(input) {
  if (!input || typeof input !== 'string') return '';
  const s = input.trim();
  const m = s.match(HEX_RE);
  if (!m) return '';
  let hex = m[1].toLowerCase();
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); // #rgb → #rrggbb
  if (hex.length === 8) hex = hex.slice(0, 6); // drop alpha
  return `#${hex}`;
}

function getResolvedColor(card) {
  const d = normalizeHex(card?.dataset?.colorResolved);
  if (d) return d;
  const inline = normalizeHex(card?.style?.getPropertyValue('--edge'));
  if (inline) return inline;
  return '';
}

function applyRimColor(card, color) {
  // Rim only
  card.style.setProperty('--edge', color);
  card.dataset.colorResolved = color;

  // Swatch in header (tiny UI mirror)
  const sw = card.querySelector('.swatch');
  if (sw) sw.style.backgroundColor = color;
}
