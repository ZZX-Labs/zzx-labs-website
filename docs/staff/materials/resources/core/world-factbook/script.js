/* ZZX-Labs Factbook — UI/controller layer
   - Renders cards
   - Search filter
   - Modal iframe viewer (opens source factsheet URL)
   - Refreshes local manifests every 6h (reload catalog)
*/

(function(){
  const cfg = window.FACTBOOK_CONFIG || {};
  const { getCatalog, getLeaders, loadMeta, toLocal } = window.FactbookApp;

  const $  = (s,c=document)=>c.querySelector(s);
  const $$ = (s,c=document)=>Array.from(c.querySelectorAll(s));

  const els = {
    grid: $("#grid"),
    search: $("#search"),
    lastCheck: $("#lastCheck"),
    nextCheck: $("#nextCheck"),
    autoUpdate: $("#autoUpdate"),
    forceRefresh: $("#forceRefresh"),
    viewer: $("#viewer"),
    viewerFrame: $("#viewerFrame"),
    viewerTitle: $("#viewerTitle"),
    viewerClose: $("#viewerClose")
  };

  let catalog = [];  // merged: urls.json + locale manifests
  let intervalId = null;

  function renderStatus() {
    const meta = loadMeta() || {};
    els.lastCheck.textContent = meta.lastCheckISO ? toLocal(meta.lastCheckISO) : "—";
    els.nextCheck.textContent = meta.nextCheckISO ? toLocal(meta.nextCheckISO) : "—";
  }

  function cardHTML(item){
    const updated = item.last_seen_iso ? new Date(item.last_seen_iso).toLocaleDateString() : "—";
    const summary = item.summary ? escapeHTML(item.summary).slice(0, 220) : "Local manifest pending.";
    return `
      <article class="card" role="listitem" data-slug="${item.slug}">
        <header>
          <h3>${escapeHTML(item.name)}</h3>
          <span class="badge" title="Last seen in local manifest">
            <span class="dot"></span> <small>${updated}</small>
          </span>
        </header>
        <div class="body">
          <div><small class="muted">${escapeHTML(item.factsheet_url)}</small></div>
          <div style="margin-top:.35rem">${summary}</div>
        </div>
        <div class="actions">
          <button data-act="view" aria-label="View ${escapeHTML(item.name)} factsheet">View</button>
          <a class="btn" href="${item.factsheet_url}" target="_blank" rel="noopener" aria-label="Open source">Open Source</a>
          ${item.pdf_saved ? `<a class="btn" href="${escapeAttr(item.pdf_saved)}" target="_blank" rel="noopener">PDF (local)</a>` : ``}
        </div>
      </article>`;
  }

  function renderGrid(){
    const q = String(els.search.value||"").trim().toLowerCase();
    const list = catalog.filter(it => {
      const hay = (it.name+" "+(it.region||"")+" "+(it.capital||"")).toLowerCase();
      return !q || hay.includes(q);
    });
    els.grid.innerHTML = list.map(cardHTML).join("") || `<div class="card" style="padding:1rem">No results.</div>`;
  }

  function wireEvents(){
    els.search.addEventListener("input", renderGrid);
    els.viewerClose.addEventListener("click", ()=> els.viewer.close());

    els.grid.addEventListener("click", (e)=>{
      const btn = e.target.closest("button[data-act]");
      if(!btn) return;
      const card = e.target.closest(".card");
      const slug = card?.dataset.slug;
      const item = catalog.find(d=>d.slug===slug);
      if(!item) return;

      if(btn.dataset.act === "view"){
        openViewer(item.name, item.factsheet_url);
      }
    });

    els.forceRefresh.addEventListener("click", reloadAll);
  }

  function openViewer(title, url){
    els.viewerTitle.textContent = title || "Factsheet";
    els.viewerFrame.src = url;
    els.viewer.showModal();
  }

  async function reloadAll(){
    try{
      catalog = await getCatalog();
      renderStatus();
      renderGrid();
    }catch(err){
      console.error(err);
      els.grid.innerHTML = `<div class="card" style="padding:1rem">Failed to load catalog.</div>`;
    }
  }

  function escapeHTML(s){
    return String(s||"").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }
  function escapeAttr(s){ return escapeHTML(s); }

  async function init(){
    wireEvents();
    await reloadAll();
    if(intervalId) clearInterval(intervalId);
    intervalId = setInterval(()=> {
      if($("#autoUpdate").checked) reloadAll();
    }, cfg.UPDATE_INTERVAL_MS || (6*60*60*1000));
  }

  init();
})();
