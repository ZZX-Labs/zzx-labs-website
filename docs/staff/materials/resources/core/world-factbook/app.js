/* ZZX-Labs Factbook — app data/model layer
   - Loads urls.json (catalog) + merges locale/<slug>.json manifests
   - Provides getCatalog(), getLeaders() hooks (leaders optional later)
   - Maintains localStorage meta (last/next check) for schedule display
*/

(function(){
  const cfg = window.FACTBOOK_CONFIG || {};
  const { getCatalog, loadMeta } = window.FactbookApp;

  const $  = (s,c=document)=>c.querySelector(s);
  const els = {
    grid: $("#grid"),
    search: $("#search"),
    lastCheck: $("#lastCheck"),
    nextCheck: $("#nextCheck"),
    autoUpdate: $("#autoUpdate"),
    forceRefresh: $("#forceRefresh"),
    viewer: $("#viewer"),
    viewerTitle: $("#viewerTitle"),
    viewerClose: $("#viewerClose"),
    viewerContent: $("#viewerContent"),
    viewerSource: $("#viewerSource")
  };

  let catalog = [];
  let timer;

  function toLocal(iso){ try { return new Date(iso).toLocaleString(); } catch { return "—"; } }
  function renderStatus(){
    const meta = loadMeta() || {};
    els.lastCheck.textContent = meta.lastCheckISO ? toLocal(meta.lastCheckISO) : "—";
    els.nextCheck.textContent = meta.nextCheckISO ? toLocal(meta.nextCheckISO) : "—";
  }

  function escapeHTML(s){
    return String(s||"").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }
  function escapeAttr(s){ return escapeHTML(s); }

  function cardHTML(item){
    const updated = item.last_seen_iso ? new Date(item.last_seen_iso).toLocaleDateString() : "—";
    const summary = item.summary ? escapeHTML(item.summary).slice(0, 220) : "Local manifest pending.";
    // View always tries container if proxy enabled; else falls back to new tab.
    const canRender = !!cfg.USE_PROXY;
    const primaryAct = canRender ? "render" : "open";
    const primaryLabel = canRender ? "View" : "Open";
    return `
      <article class="card" role="listitem" data-slug="${item.slug}">
        <header>
          <h3>${escapeHTML(item.name)}</h3>
          <span class="badge"><span class="dot"></span> <small>${updated}</small></span>
        </header>
        <div class="body">
          <div><small class="muted">${escapeHTML(item.factsheet_url)}</small></div>
          <div style="margin-top:.35rem">${summary}</div>
        </div>
        <div class="actions">
          <button data-act="${primaryAct}">${primaryLabel}</button>
          <a class="btn" href="${escapeAttr(item.factsheet_url)}" target="_blank" rel="noopener">Open Source</a>
          ${item.pdf_saved ? `<a class="btn" href="${escapeAttr(item.pdf_saved)}" target="_blank" rel="noopener">PDF (local)</a>` : ``}
        </div>
      </article>`;
  }

  function renderGrid(){
    const q = (els.search.value||"").trim().toLowerCase();
    const list = catalog.filter(it=>{
      const hay = (it.name+" "+(it.region||"")+" "+(it.capital||"")).toLowerCase();
      return !q || hay.includes(q);
    });
    els.grid.innerHTML = list.map(cardHTML).join("") || `<div class="card" style="padding:1rem">No results.</div>`;
  }

  function wire(){
    els.search.addEventListener("input", renderGrid);
    els.viewerClose.addEventListener("click", ()=> els.viewer.close());
    els.forceRefresh.addEventListener("click", reload);

    els.grid.addEventListener("click", async (e)=>{
      const btn = e.target.closest("button[data-act]");
      if(!btn) return;
      const card = e.target.closest(".card");
      const slug = card?.dataset.slug;
      const item = catalog.find(d=>d.slug===slug);
      if(!item) return;

      if(btn.dataset.act === "open"){
        window.open(item.factsheet_url, "_blank", "noopener");
        return;
      }

      if(btn.dataset.act === "render"){
        // Ask our proxy to return sanitized HTML fragment for the URL
        try{
          const u = `${cfg.PROXY_BASE.replace(/\/$/,'')}/render?url=${encodeURIComponent(item.factsheet_url)}`;
          const r = await fetch(u, { method:"GET", cache:"no-store" });
          if(!r.ok) throw new Error(`Render ${r.status}`);
          const html = await r.text();
          // Inject sanitized HTML into container
          els.viewerTitle.textContent = item.name || "Factsheet";
          els.viewerSource.href = item.factsheet_url;
          els.viewerContent.innerHTML = html;
          // Ensure all links open away
          els.viewerContent.querySelectorAll('a[href]').forEach(a=>{
            a.setAttribute('target','_blank'); a.setAttribute('rel','noopener');
          });
          els.viewer.showModal();
        }catch(err){
          console.warn("Container render failed, opening source.", err);
          window.open(item.factsheet_url, "_blank", "noopener");
        }
      }
    });
  }

  async function reload(){
    try{
      catalog = await getCatalog();
      renderStatus();
      renderGrid();
    }catch(e){
      console.error(e);
      els.grid.innerHTML = `<div class="card" style="padding:1rem">Failed to load catalog.</div>`;
    }
  }

  async function init(){
    wire();
    await reload();
    if (timer) clearInterval(timer);
    const interval = (window.FACTBOOK_CONFIG.UPDATE_INTERVAL_MS) || (6*60*60*1000);
    timer = setInterval(()=>{ if(els.autoUpdate.checked) reload(); }, interval);
  }
  init();
})();
