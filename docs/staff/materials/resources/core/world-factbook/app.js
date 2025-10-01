/* ZZX-Labs Factbook — app data/model layer
   - Loads urls.json (catalog) + merges locale/<slug>.json manifests
   - Provides getCatalog(), getLeaders() hooks (leaders optional later)
   - Maintains localStorage meta (last/next check) for schedule display
*/

(function(){
  const cfg = window.FACTBOOK_CONFIG || {};
  const META_KEY = "factbook.meta";

  function loadJSON(url) {
    return fetch(url, { cache: "no-store" }).then(r => {
      if (!r.ok) throw new Error(`${url} -> ${r.status}`);
      return r.json();
    });
  }

  function saveMeta(meta){ localStorage.setItem(META_KEY, JSON.stringify(meta)); }
  function loadMeta(){
    try { return JSON.parse(localStorage.getItem(META_KEY) || ""); } catch { return {}; }
  }

  function nextISO(ms){ return new Date(Date.now()+ms).toISOString(); }
  function toLocal(iso){ try { return new Date(iso).toLocaleString(); } catch { return "—"; } }

  async function getCatalog() {
    // Base catalog
    const base = await loadJSON(cfg.URLS_JSON);
    // Merge each with local manifest if present
    const merged = [];
    for (const item of base) {
      const slug = item.slug || slugify(item.name);
      let manifest = {};
      try {
        manifest = await loadJSON(`${cfg.LOCALE_DIR}/${slug}.json`);
      } catch { /* ok if missing */ }
      merged.push({
        ...item,
        slug,
        // fields from manifest take precedence if provided
        last_seen_iso: manifest.last_seen_iso || null,
        version: manifest.version || null,
        summary: manifest.summary || null,
        pdf_saved: manifest.pdf_saved || null,
        leaders: manifest.leaders || null
      });
    }
    // meta bookkeeping
    const meta = loadMeta();
    meta.lastCheckISO = new Date().toISOString();
    meta.nextCheckISO = nextISO(cfg.UPDATE_INTERVAL_MS || (6*60*60*1000));
    saveMeta(meta);
    return merged;
  }

  // optional: placeholder for leaders dataset (can be piped in later)
  async function getLeaders(){ return []; }

  function slugify(s){
    return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  // expose
  window.FactbookApp = {
    getCatalog, getLeaders, loadMeta, toLocal,
    slugify
  };
})();
