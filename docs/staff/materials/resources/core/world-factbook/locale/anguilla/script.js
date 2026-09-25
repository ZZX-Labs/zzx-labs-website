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

  // Dependency-free canvas boundary snapshot. No Leaflet/npm/CDN runtime.
  async function buildMapImage(boundaryGeoJSON){
    const canvas=document.createElement("canvas");
    canvas.width=1920*(cfg.EXPORT_SCALE||1);
    canvas.height=1080*(cfg.EXPORT_SCALE||1);
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#050705";ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle="rgba(192,214,116,.10)";ctx.lineWidth=1;
    for(let lon=-180;lon<=180;lon+=30){const x=(lon+180)/360*canvas.width;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    for(let lat=-60;lat<=60;lat+=30){const y=(90-lat)/180*canvas.height;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
    const project=coord=>[(coord[0]+180)/360*canvas.width,(90-coord[1])/180*canvas.height];
    const rings=[];
    function collect(g){
      if(!g)return;
      if(g.type==="Feature")return collect(g.geometry);
      if(g.type==="FeatureCollection"){for(const f of g.features||[])collect(f);return;}
      if(g.type==="Polygon")rings.push(...(g.coordinates||[]));
      if(g.type==="MultiPolygon")for(const p of g.coordinates||[])rings.push(...p);
    }
    collect(boundaryGeoJSON);
    ctx.strokeStyle=cfg.BRAND_COLOR||"#c0d674";ctx.lineWidth=(cfg.OUTLINE_WEIGHT||3)*(cfg.EXPORT_SCALE||1);
    for(const ring of rings){ctx.beginPath();ring.forEach((c,i)=>{const [x,y]=project(c);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();}
    return canvas.toDataURL("image/png");
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
