(async function(){
  const cfg = window.PAGE_CONFIG;
  const $ = (s,c=document)=>c.querySelector(s);
  const toLocal = iso => { try{return new Date(iso).toLocaleDateString();}catch{return "—"} };
  function escapeHTML(s){return String(s||"").replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
  function setRich(id,val){ const el=$(id); if(!el) return; el.innerHTML = val ? val : `<span class="muted">No data yet.</span>`; }

  async function loadManifest(){
    const r = await fetch(cfg.MANIFEST_URL, {cache:"no-store"});
    if(!r.ok) throw new Error(`manifest -> ${r.status}`);
    return r.json();
  }

  // Build UHD sat snapshot using Leaflet + leaflet-image
  async function buildMapImage(boundaryGeoJSON){
    // Setup map offscreen
    const mapEl = $("#map");
    const map = L.map(mapEl, { zoomControl:false, attributionControl:false, preferCanvas:true });
    L.tileLayer(cfg.SAT_TILES, { attribution: cfg.SAT_ATTR, maxZoom: 19 }).addTo(map);

    let layer;
    if(boundaryGeoJSON){
      layer = L.geoJSON(boundaryGeoJSON, {
        style: {
          color: cfg.BRAND_COLOR || "#c0d674",
          weight: cfg.OUTLINE_WEIGHT ?? 3,
          fill: false
        }
      }).addTo(map);
      try { map.fitBounds(layer.getBounds(), { padding:[40,40] }); } catch {}
    }

    return new Promise((resolve,reject)=>{
      window.leafletImage(map, (err, canvas) => {
        try { map.remove(); } catch {}
        if(err) return reject(err);
        // upscale for UHD if needed
        if (cfg.EXPORT_SCALE && cfg.EXPORT_SCALE > 1) {
          const upscale = document.createElement("canvas");
          upscale.width = canvas.width * cfg.EXPORT_SCALE;
          upscale.height = canvas.height * cfg.EXPORT_SCALE;
          const ctx = upscale.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(canvas, 0, 0, upscale.width, upscale.height);
          resolve(upscale.toDataURL("image/png"));
        } else {
          resolve(canvas.toDataURL("image/png"));
        }
      });
    });
  }

  function renderLeaders(container, leaders){
    container.innerHTML = "";
    if(!leaders || typeof leaders !== "object"){
      container.innerHTML = `<div><small>Head of state</small><span>—</span></div>
                             <div><small>Head of government</small><span>—</span></div>`;
      return;
    }
    for(const [k,v] of Object.entries(leaders)){
      const row = document.createElement("div");
      row.innerHTML = `<small>${escapeHTML(k.replace(/[_-]/g," ").replace(/\b\w/g,c=>c.toUpperCase()))}</small><span>${escapeHTML(String(v||"—"))}</span>`;
      container.appendChild(row);
    }
  }

  try{
    const m = await loadManifest();

    // Header & subtitle
    $("#title").textContent = m.name || "Country";
    document.title = `${m.name || "Country"} — World Factbook (ZZX)`;
    const subParts = [];
    if(m.region) subParts.push(m.region);
    if(m.capital) subParts.push(`Capital: ${m.capital}`);
    if(m.version) subParts.push(`Version: ${m.version}`);
    if(m.last_seen_iso) subParts.push(`Last Seen: ${toLocal(m.last_seen_iso)}`);
    $("#subtitle").textContent = subParts.join(" · ") || "—";

    // Source link
    if(m.factsheet_url) $("#sourceLink").href = m.factsheet_url;

    // Key/value sidebar
    $("#kvRegion").textContent = m.region || "—";
    $("#kvCapital").textContent = m.capital || "—";
    $("#kvPop").textContent = m.population ? String(m.population) : "—";
    $("#kvCur").textContent = m.currency || "—";
    $("#kvTZ").textContent = m.timezone || "—";
    $("#kvVer").textContent = m.version || "—";
    $("#kvSeen").textContent = m.last_seen_iso ? toLocal(m.last_seen_iso) : "—";

    renderLeaders($("#leaders"), m.leaders);

    // Main sections
    setRich("#summary", m.summary);
    setRich("#economy", m.economy);
    setRich("#geography", m.geography);
    setRich("#security", m.security);
    setRich("#infrastructure", m.infrastructure);

    // Build UHD satellite map image
    const start = performance.now();
    const dataUrl = await buildMapImage(m.boundary_geojson || null);
    $("#satImage").src = dataUrl;
    $("#mapMeta").textContent = `Rendered ${Math.round((performance.now()-start))} ms • ${cfg.EXPORT_SCALE}× scale`;

    // Regenerate on demand
    $("#regen").addEventListener("click", async ()=>{
      $("#mapMeta").textContent = "Rendering…";
      const t0 = performance.now();
      const dataUrl2 = await buildMapImage(m.boundary_geojson || null);
      $("#satImage").src = dataUrl2;
      $("#mapMeta").textContent = `Rendered ${Math.round((performance.now()-t0))} ms • ${cfg.EXPORT_SCALE}× scale`;
    });

  }catch(e){
    console.error(e);
    $("#summary").innerHTML = `<span class="muted">Failed to load manifest.</span>`;
  }
})();
