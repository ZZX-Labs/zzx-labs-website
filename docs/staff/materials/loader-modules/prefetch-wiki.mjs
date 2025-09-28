// /docs/staff/materials/loader-modules/prefetch-wiki.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const MW_API = 'https://en.wikipedia.org/w/api.php';
const ORIGIN = ''; // not needed from Node

function slugify(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,128); }
function extractFragment(u){ try { return new URL(u).hash.replace(/^#/, '') || null; } catch { return null; } }
function urlToTitle(u){
  try {
    const x=new URL(u);
    if(x.pathname.startsWith('/wiki/')) return decodeURIComponent(x.pathname.replace('/wiki/','')).split('#')[0];
    const t=x.searchParams.get('title'); if(t) return decodeURIComponent(t).split('#')[0];
  } catch {}
  return decodeURIComponent(String(u).split('/').pop()||'').split('#')[0].replace(/_/g,' ');
}

async function mw(params){
  const url = `${MW_API}?${params}${ORIGIN}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function resolve(title){
  const p = new URLSearchParams({
    action:'query', format:'json', redirects:'1', titles:title,
    prop:'info|revisions|pageprops', rvprop:'ids|timestamp', inprop:'url'
  }).toString();
  const data = await mw(p);
  const pages = data?.query?.pages || {};
  const first = Object.values(pages)[0];
  if(first?.missing) throw new Error(`Missing: ${title}`);
  const canonical = data?.query?.normalized?.[0]?.to || data?.query?.redirects?.[0]?.to || first?.title || title;
  const lastrevid = first?.revisions?.[0]?.revid || first?.lastrevid || null;
  const updated = first?.revisions?.[0]?.timestamp || null;
  const url = first?.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(canonical)}`;
  return { title: canonical, url, lastrevid, updated };
}

async function sections(title){
  const p = new URLSearchParams({ action:'parse', format:'json', prop:'sections', page:title }).toString();
  const data = await mw(p);
  return data?.parse?.sections || [];
}
async function sectionHTML(title, idx){
  const p = new URLSearchParams({ action:'parse', format:'json', prop:'text|revid', page:title, section:idx }).toString();
  const data = await mw(p);
  return { html: data.parse.text['*'], revid: data.parse.revid };
}

function sanitizeAndRewrite(html){ return html; } // client sanitizes further

async function readJSONMaybe(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return null; }
}

async function collectUrlsRecursive(dirAbs, seen = new Set()) {
  const out = [];
  const key = path.resolve(dirAbs);
  if (seen.has(key)) return out;
  seen.add(key);

  // this dir urls.json
  const urlsFile = path.join(dirAbs, 'urls.json');
  const urls = await readJSONMaybe(urlsFile);
  if (Array.isArray(urls)) {
    for (const u of urls) if (typeof u === 'string' && u.trim()) out.push(u.trim());
  }

  // manifest children
  const manifestFile = path.join(dirAbs, 'manifest.json');
  const manifest = await readJSONMaybe(manifestFile);
  const children = Array.isArray(manifest?.children) ? manifest.children : [];
  for (const child of children) {
    if (typeof child !== 'string' || !child.trim()) continue;
    const childDir = path.join(dirAbs, child);
    const childUrls = await collectUrlsRecursive(childDir, seen);
    out.push(...childUrls);
  }

  return out;
}

async function writeIfChanged(file, dataStr) {
  try {
    const cur = await fs.readFile(file, 'utf8');
    if (cur === dataStr) return false; // no change
  } catch {}
  await fs.writeFile(file, dataStr, 'utf8');
  return true;
}

async function main() {
  // Start dir: CLI arg or cwd
  const startDir = path.resolve(process.argv[2] || process.cwd());
  const allUrls = await collectUrlsRecursive(startDir);

  const cacheDir = path.join(startDir, 'cache');
  await fs.mkdir(cacheDir, { recursive: true });

  for (const u of allUrls) {
    try {
      const raw = urlToTitle(u);
      const frag = extractFragment(u);
      const info = await resolve(raw);
      const all = await sections(info.title);

      let list = all;
      if (frag) {
        const fragLower = frag.toLowerCase().replace(/_/g,' ');
        const byAnchor = all.find(s => (s.anchor||'').toLowerCase() === frag.toLowerCase());
        const byLine = all.find(s => (s.line||'').toLowerCase() === fragLower);
        list = (byAnchor || byLine) ? [byAnchor || byLine] : all;
      }

      const outSections = [];
      for (const s of list) {
        const { html } = await sectionHTML(info.title, s.index);
        outSections.push({ index: s.index, line: s.line, anchor: s.anchor, toclevel: s.toclevel, html: sanitizeAndRewrite(html) });
      }

      const rec = {
        key: `${info.title}#${frag || 'ALL'}`,
        title: info.title,
        url: info.url,
        updated: info.updated,
        lastrevid: info.lastrevid,
        sections: outSections
      };

      const file = path.join(cacheDir, `${slugify(`${info.title}--${frag||'all'}`)}.json`);
      const changed = await writeIfChanged(file, JSON.stringify(rec));
      if (changed) console.log('Cached (updated):', file);
      else console.log('Unchanged (skip):', file);
    } catch (e) {
      console.warn('Skip:', u, '→', e.message);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
