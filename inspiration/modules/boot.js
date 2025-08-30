// /inspiration/modules/boot.js
// Orchestrator: load figures, palette, urls; build cards; assign colors; fetch wiki + cache
import { FIGURES_JSON, URLS_JSON, PALETTE_JSON, IMAGES_DIR, STATIC_CACHE_DIR } from './config.js';
import { idbGet, idbPut } from './cache.js';
import { displayTitleString, urlToTitle, cacheKey, extractFragment, assignBalancedColors } from './utils.js';
import { resolveAndInspect, getSections, getSectionHTML } from './mw.js';
import { mkFigureCard, renderFigureSectionsInto, attachHashOpenHandler } from './render.js';

/* ---------------- misc helpers ---------------- */
function seedFromCrypto() {
  if (window.crypto?.getRandomValues) { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] >>> 0; }
  return ((Math.random() * 0xffffffff) | 0) >>> 0;
}
function mulberry32(seed){ let t = seed>>>0; return ()=>{ t+=0x6D2B79F5; let r=Math.imul(t^(t>>>15),1|t); r^=r+Math.imul(r^(r>>>7),61|r); return ((r^(r>>>14))>>>0)/4294967296; }; }
function shuffleSeeded(arr, seed){ const a=arr.slice(), rnd=mulberry32(seed); for(let i=a.length-1;i>0;i--){ const j=(rnd()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } return a; }

function normalizePalette(p) {
  const HEX=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i, out=[], seen=new Set();
  (Array.isArray(p)?p:[]).forEach(c=>{
    if(!c) return; let s=String(c).trim(); if(!s.startsWith('#')) s=`#${s}`; const m=s.match(HEX); if(!m) return;
    let hex=m[1]; if(hex.length===3) hex=hex.split('').map(x=>x+x).join('');
    const key=`#${hex.toLowerCase()}`; if(!seen.has(key)){ seen.add(key); out.push(key); }
  });
  if(!seen.has('#c0d674')) out.splice(Math.floor(out.length/2),0,'#c0d674');
  if(out.length>16){ const sel=[]; for(let i=0;i<16;i++) sel.push(out[Math.round(i*(out.length-1)/15)]); return Array.from(new Set(sel)); }
  return out.length?out:['#c0d674'];
}

async function tryLoadStaticCache(slug){ try{ const res=await fetch(`${STATIC_CACHE_DIR}/${slug}.json`,{cache:'no-cache'}); if(!res.ok) return null; return await res.json(); }catch{ return null; } }
function cacheSlug(title, fragment){
  return (displayTitleString(title)+(fragment?`--${fragment}`:'--all')).toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,128);
}
async function fetchJSON(path){ const r=await fetch(path,{cache:'no-cache'}); if(!r.ok) throw new Error(`${path} (${r.status})`); return r.json(); }
async function loadFirst(paths, label){
  for (const p of paths) {
    try { return await fetchJSON(p); } catch (e) { console.warn(`[${label}] miss`, p, e?.message||e); }
  }
  throw new Error(`${label} not found in any candidate path`);
}
function updateCount(countEl, shown, total){ if(countEl) countEl.textContent = `${shown} shown of ${total}`; }

/* --------- ensure/repair grid so cards actually render --------- */
function ensureGridContainer() {
  let grid = document.getElementById('figure-grid')
         || document.querySelector('.feature-card-container')
         || document.querySelector('[data-fig-grid]');

  if (!grid) {
    grid = document.createElement('div');
    grid.id = 'figure-grid';
    grid.className = 'feature-card-container';
    const host = document.querySelector('section.features') || document.querySelector('main') || document.body;
    host.appendChild(grid);
  }

  // Make sure the grid class is present for your CSS, and add a fallback grid inline.
  grid.classList.add('feature-card-container');
  const cs = getComputedStyle(grid);
  if (cs.display !== 'grid') {
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
    grid.style.gap = '8px';
  }
  grid.style.marginInline = 'auto';
  grid.style.width = '100%';

  return grid;
}

/* ---------------- boot ---------------- */
export async function boot() {
  if (location.protocol === 'file:') {
    const grid = ensureGridContainer();
    grid.innerHTML = `<p class="error">This page is served via <code>file://</code>. Run a local web server so module imports & JSON fetches work.</p>`;
    return;
  }

  const grid     = ensureGridContainer();
  const filterEl = document.getElementById('figure-filter');
  const countEl  = document.getElementById('figure-count');

  // Try multiple paths for each JSON so a misplaced folder doesn’t yield 0 cards.
  const here = new URL('.', location.href).pathname.replace(/\/+$/,''); // e.g. /inspiration
  const candidates = {
    figures: [
      FIGURES_JSON,
      `${here}/figures/figures.json`,
      `./figures/figures.json`,
      `../figures/figures.json`,
      `/inspiration/figures/figures.json`,
      `/figures/figures.json`,
    ],
    palette: [
      PALETTE_JSON,
      `${here}/figures/color-palette.json`,
      `./figures/color-palette.json`,
      `../figures/color-palette.json`,
      `/inspiration/figures/color-palette.json`,
      `/figures/color-palette.json`,
    ],
    urls: [
      URLS_JSON,
      `${here}/figures/urls.json`,
      `./figures/urls.json`,
      `../figures/urls.json`,
      `/inspiration/figures/urls.json`,
      `/figures/urls.json`,
    ],
  };

  let figures = [];
  try { figures = await loadFirst(candidates.figures, 'figures'); }
  catch (e) {
    grid.innerHTML = `<p class="error">Failed to load figures: ${e?.message || e}</p>`;
    updateCount(countEl, 0, 0);
    return;
  }

  let paletteRaw = null, urlMap = {};
  try { paletteRaw = await loadFirst(candidates.palette, 'palette'); } catch (e) { console.warn('[palette] all candidates failed:', e?.message||e); paletteRaw = ['#c0d674']; }
  try { urlMap     = await loadFirst(candidates.urls, 'urls');       } catch (e) { console.warn('[urls] all candidates failed:', e?.message||e); urlMap = {}; }

  // Shuffle once per session for stability
  const ORDER_SEED = (window.__FIG_ORDER_SEED__ ??= seedFromCrypto());
  const ordered = shuffleSeeded(Array.isArray(figures) ? figures : [], ORDER_SEED);

  // Build cards immediately
  grid.innerHTML = '';
  const cards = [];
  for (const fig of ordered) {
    try {
      const img = `${IMAGES_DIR}/${fig.id}.jpg`;
      const card = mkFigureCard({ id: fig.id, name: fig.name || fig.id, imgUrl: img });
      const imgEl = card.querySelector('img');
      if (imgEl) imgEl.addEventListener('error', () => { imgEl.src = '/static/images/placeholder.jpg'; }, { once: true });
      grid.appendChild(card);
      cards.push(card);
    } catch (err) {
      console.error('mkFigureCard failed for', fig, err);
    }
  }

  if (!cards.length) {
    grid.innerHTML = `<p class="error">No cards rendered. Check that your figures JSON has entries and the grid is on the page.</p>`;
    updateCount(countEl, 0, 0);
    return;
  }

  // Rim colors, no wash
  const palette = normalizePalette(paletteRaw);
  assignBalancedColors(cards, palette, grid);

  // Filter + count
  const applyFilter = () => {
    const q = (filterEl?.value || '').trim().toLowerCase();
    let shown = 0;
    for (const card of cards) {
      const nm = card.querySelector('h3')?.textContent?.toLowerCase() || '';
      const id = (card.id || '').toLowerCase();
      const hit = !q || nm.includes(q) || id.includes(q);
      card.style.display = hit ? '' : 'none';
      if (hit) shown++;
    }
    updateCount(countEl, shown, cards.length);
  };
  updateCount(countEl, cards.length, cards.length);
  filterEl?.addEventListener('input', () => requestAnimationFrame(applyFilter));
  applyFilter();

  // Hash → open collapsible hook
  attachHashOpenHandler();

  // Wikipedia content
  for (let i = 0; i < ordered.length; i++) {
    const fig = ordered[i];
    const card = cards[i];
    const url = urlMap?.[fig.id];

    if (!url) {
      const content = card.querySelector('.card-content');
      if (content) content.innerHTML = `<p class="error">No Wikipedia URL configured for ${fig.name || fig.id}.</p>`;
      continue;
    }

    try {
      const rawTitle = urlToTitle(url);
      const fragment = extractFragment(url);
      const info = await resolveAndInspect(rawTitle);
      if (info.missing) {
        card.querySelector('.card-content').innerHTML = `<p class="error">Page not found: “${rawTitle}”.</p>`;
        continue;
      }

      const key  = cacheKey(info.title, fragment);
      const slug = cacheSlug(info.title, fragment);

      // Static cache, then IDB
      let record = await tryLoadStaticCache(slug);
      if (!record) record = await idbGet(key);

      if (!record || String(record.lastrevid) !== String(info.lastrevid)) {
        const allSections = await getSections(info.title);
        let sectionList = allSections;
        if (fragment) {
          const fl = fragment.toLowerCase().replace(/_/g,' ');
          const byAnchor = allSections.find(s => (s.anchor || '').toLowerCase() === fragment.toLowerCase());
          const byLine   = allSections.find(s => (s.line   || '').toLowerCase() === fl);
          sectionList = byAnchor ? [byAnchor] : (byLine ? [byLine] : allSections);
        }

        const outSections = [];
        for (const s of sectionList) {
          try {
            const { html } = await getSectionHTML(info.title, s.index);
            outSections.push({ index: s.index, line: s.line, anchor: s.anchor, toclevel: s.toclevel, html });
          } catch (err) {
            outSections.push({ index: s.index, line: s.line, anchor: s.anchor, toclevel: s.toclevel,
              html: `<div class="error">Section failed: ${err.message}</div>` });
          }
        }

        record = {
          key, title: info.title, url: info.url,
          updated: info.updated ? info.updated.toISOString() : null,
          lastrevid: info.lastrevid || null,
          sections: outSections
        };
        await idbPut(record);
      }

      renderFigureSectionsInto(card, {
        url: record.url,
        updated: record.updated ? new Date(record.updated) : null
      }, record.sections);

    } catch (err) {
      const content = card.querySelector('.card-content');
      if (content) content.innerHTML = `<p class="error">Load error: ${err.message}</p>`;
      console.error('Figure load error', fig.id, err);
    }
  }
}
