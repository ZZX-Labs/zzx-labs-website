(function () {
  "use strict";
  const W = window.WFB;
  const client = window.ZZXWorldFactbook;
  if (!W || !client) return;
  const root = client.root;
  const $ = (selector) => document.querySelector(selector);
  const state = { catalogue:null, points:[], country:"", year:2004, yaw:0.2,
    layer:"map", renderer:null, candidates:[], version:0, available:new Set(),
    imageCache:new Map(), lastTexture:null, rotationSeconds:20, playing:true,
    dragging:false, lastFrame:0, boundaryManifest:null, boundaries:null,
    boundaryVersion:0, lookup:null, selectedRings:[], shapeVersion:0 };
  const sources = {
    map: {title:"Reference map · Natural Earth",link:"https://www.naturalearthdata.com/"},
    topo: {title:"Natural Earth shaded relief and map units",link:"https://www.naturalearthdata.com/"},
    satellite: {title:"NASA Blue Marble (2002 composite)",link:"https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/"},
    tactical: {title:"Reference map and geographic grid · Natural Earth",link:"https://www.naturalearthdata.com/"}
  };
  function fallbackTexture(){
    const c=document.createElement("canvas");c.width=1024;c.height=512;
    const ctx=c.getContext("2d");
    const gradient=ctx.createLinearGradient(0,0,0,512);
    gradient.addColorStop(0,"#142d37");gradient.addColorStop(.5,"#0d1e28");gradient.addColorStop(1,"#142d37");
    ctx.fillStyle=gradient;ctx.fillRect(0,0,1024,512);
    ctx.strokeStyle="rgba(139,186,166,.25)";
    for(let x=0;x<1024;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}
    for(let y=0;y<512;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1024,y);ctx.stroke();}
    return c;
  }
  function loadImage(url){
    if(state.imageCache.has(url)) return state.imageCache.get(url);
    const promise=new Promise((resolve,reject)=>{
      const img=new Image();img.crossOrigin="anonymous";
      img.onload=()=>resolve(img);img.onerror=()=>reject(Error("Unable to load globe texture"));img.src=url;
    });
    state.imageCache.set(url,promise);return promise;
  }
  function texturePath(layer){
    const dated=state.boundaries?.kind==="historical";
    const dir=dated&&["map","topo","tactical"].includes(layer)?
      `boundaries/editions/${state.year}/` : "boundaries/reference/";
    const name=layer==="satellite"?"satellite.png":layer==="topo"?"topo.png":"map.png";
    return `${dir}${name}`;
  }
  function layerTexture(layer){return loadImage(new URL(texturePath(layer),root).href);}
  async function setLayer(layer){
    if(!sources[layer])return;
    state.layer=layer;
    const credit=$("[data-wfb-globe-attribution]");
    credit.replaceChildren();
    const link=document.createElement("a");link.href=sources[layer].link;
    link.rel="noopener noreferrer";link.target="_blank";link.textContent=sources[layer].title;
    credit.append(link);
    if(layer==="satellite")credit.append(" · 2002 imagery; the edition year applies to data and borders");
    const token=++state.version;
    try{
      const image=await layerTexture(layer);
      if(token!==state.version) return;
      upload(image);
    }catch(error){
      if(token!==state.version) return;
      upload(fallbackTexture());
      credit.append(" · local layer missing; showing reference grid");
    }
    draw();
  }
  function upload(image){
    state.lastTexture=image;
    state.renderer?.setTexture(image);
  }
  function showRenderer(){
    const node=$("[data-wfb-globe-renderer]");
    if(node)node.textContent=`Renderer: ${state.renderer?.kind||"loading"}`;
  }
  function cpuFallback(){
    if(state.renderer?.kind==="Canvas 2D fallback")return;
    try{state.renderer?.destroy();}catch(error){console.warn("Globe GPU cleanup failed",error);}
    state.renderer=window.WFBGlobeRenderer.createCPU($("[data-wfb-globe-canvas]"));
    state.renderer.setTexture(state.lastTexture||fallbackTexture());
    showRenderer();draw();
  }
  function boundaryStatus(text){
    const node=$("[data-wfb-boundary-status]");if(node)node.textContent=text;
  }
  async function loadBoundaries(year){
    const generation=++state.boundaryVersion;
    const catalog=state.boundaryManifest;
    if(!catalog)return;
    const selected=catalog.editions?.[String(year)]||catalog.reference;
    if(!selected)return;
    try{
      const index=await getJSON(`boundaries/${selected}`);
      const base=selected.slice(0,selected.lastIndexOf("/")+1);
      const source=await loadImage(new URL(`boundaries/${base}${index.lookup}`,root).href);
      const c=document.createElement("canvas");c.width=source.naturalWidth;c.height=source.naturalHeight;
      const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(source,0,0);
      const bytes=ctx.getImageData(0,0,c.width,c.height).data;
      if(generation!==state.boundaryVersion)return;
      state.lookup={width:c.width,height:c.height,bytes,
        features:new Map(index.features.map(feature=>[feature.id,feature]))};
      state.boundaries={...index,base};
      for(const feature of index.features){
        if(state.points.some(point=>point.code===feature.code))continue;
        state.points.push({code:feature.code,name:feature.name,
          lat:feature.lat,lon:feature.lon,units:feature.label});
        const select=$("[data-wfb-globe-country]");
        if(![...select.options].some(option=>option.value===feature.code)){
          const option=document.createElement("option");option.value=feature.code;
          option.textContent=`${feature.name} [${feature.code}] · map unit`;select.append(option);
        }
      }
      boundaryStatus(index.kind==="historical"?
        `Boundaries: ${year} source geometry (${index.status})`:
        `Boundaries: present-day reference · ${year} historical geometry unavailable`);
      loadSelectedShape();setLayer(state.layer);draw();
    }catch(error){
      if(generation!==state.boundaryVersion)return;
      console.warn("Local boundary layer unavailable",error);
      state.lookup=null;state.boundaries=null;state.selectedRings=[];
      boundaryStatus("Boundaries unavailable; use location markers or the selector");
      setLayer(state.layer);draw();
    }
  }
  async function loadSelectedShape(){
    const token=++state.shapeVersion,code=state.country;
    state.selectedRings=[];
    const entry=state.boundaries?.features?.find(feature=>feature.code===code);
    if(!entry?.parts?.length){draw();return;}
    try{
      const shards=await Promise.all(entry.parts.map(name=>
        getJSON(`boundaries/${state.boundaries.base}${name}`)));
      if(token!==state.shapeVersion)return;
      const polygons=new Map();
      for(const shard of shards)for(const [poly,ring,start,coords] of shard.rings){
        if(!polygons.has(poly))polygons.set(poly,new Map());
        const rings=polygons.get(poly);
        if(!rings.has(ring))rings.set(ring,[]);
        rings.get(ring).push([start,coords]);
      }
      state.selectedRings=[];
      for(const rings of polygons.values())for(const parts of rings.values()){
        state.selectedRings.push(parts.sort((a,b)=>a[0]-b[0]).flatMap(part=>part[1]));
      }
      draw();
    }catch(error){if(token===state.shapeVersion)console.warn("Selected outline unavailable",error);}
  }
  function regionAt(x,y,width,height){
    const lookup=state.lookup;if(!lookup)return null;
    const radius=Math.min(width,height)*.4;
    const nx=(x-width/2)/radius,ny=(height/2-y)/radius;
    const distance=nx*nx+ny*ny;
    if(distance>1)return null;
    const longitude=Math.atan2(nx,Math.sqrt(Math.max(0,1-distance)))+state.yaw;
    const latitude=Math.asin(Math.max(-1,Math.min(1,ny)));
    const u=((longitude/(2*Math.PI)+.5)%1+1)%1;
    const v=Math.min(1-Number.EPSILON,Math.max(0,.5-latitude/Math.PI));
    const offset=(Math.floor(v*lookup.height)*lookup.width+Math.floor(u*lookup.width))*4;
    const id=lookup.bytes[offset]+256*lookup.bytes[offset+1]+65536*lookup.bytes[offset+2];
    return lookup.features.get(id)||null;
  }
  function drawOutline(ctx,width,height){
    if(!state.selectedRings.length)return;
    ctx.save();ctx.strokeStyle="#e6a42b";ctx.lineWidth=1.8;
    ctx.shadowColor="#0c1814";ctx.shadowBlur=2;
    for(const ring of state.selectedRings){
      let before=null;
      ctx.beginPath();
      for(const [lon,lat] of ring){
        const p=project({lon,lat},width,height);
        if(!p){before=null;continue;}
        if(before&&Math.hypot(p.x-before.x,p.y-before.y)<width*.18){
          ctx.lineTo(p.x,p.y);
        }else ctx.moveTo(p.x,p.y);
        before=p;
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function project(point,width,height){
    if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon))return null;
    const lat=point.lat*Math.PI/180,delta=point.lon*Math.PI/180-state.yaw;
    const z=Math.cos(lat)*Math.cos(delta);
    if(z<=0)return null;
    const radius=Math.min(width,height)*.4;
    return {x:width/2+Math.cos(lat)*Math.sin(delta)*radius,
            y:height/2-Math.sin(lat)*radius,z};
  }
  function draw(){
    const canvas=$("[data-wfb-globe-canvas]");
    const marker=$("[data-wfb-globe-markers]");
    if(!canvas||!marker)return;
    const width=Math.max(1,Math.round(canvas.clientWidth));
    const height=Math.max(1,Math.round(canvas.clientHeight));
    const ratio=Math.min(window.devicePixelRatio||1,2);
    const w=Math.round(width*ratio),h=Math.round(height*ratio);
    if(canvas.width!==w||canvas.height!==h){canvas.width=marker.width=w;canvas.height=marker.height=h;}
    try{state.renderer?.draw(w,h,state.yaw,false,state.layer==="tactical");}
    catch(error){console.warn("Globe GPU rendering failed",error);cpuFallback();}
    const ctx=marker.getContext("2d");ctx.clearRect(0,0,w,h);ctx.scale(ratio,ratio);
    drawOutline(ctx,width,height);
    state.candidates=[];
    for(const point of state.points){
      const p=project(point,width,height);if(!p)continue;
      const selected=point.code===state.country;
      const available=state.available.has(point.code);
      ctx.beginPath();ctx.arc(p.x,p.y,selected?5:available?2.8:1.4,0,Math.PI*2);
      ctx.fillStyle=selected?"#e6a42b":available?"#c0d674":"#657964";ctx.fill();
      if(selected){ctx.font="12px monospace";ctx.fillStyle="#f3e7ab";ctx.fillText(point.name,p.x+9,p.y-8);}
      state.candidates.push({...point,x:p.x,y:p.y});
    }
    ctx.setTransform(1,0,0,1,0,0);
  }
  const getJSON=async path=>{
    const response=await fetch(new URL(path,root));
    if(!response.ok)throw Error(`HTTP ${response.status} loading ${path}`);
    return response.json();
  };
  function status(text){$("[data-wfb-country-status]").textContent=text;}
  function choose(code){
    state.country=code;$("[data-wfb-globe-country]").value=code;
    const point=state.points.find(x=>x.code===code);
    if(point&&Number.isFinite(point.lon))state.yaw=point.lon*Math.PI/180;
    loadSelectedShape();draw();loadProfile();
  }
  let request=0;
  async function loadIndiaTrade(panel,year,requestId){
    const block=document.createElement("section");block.className="wfb-country-section wfb-trade";
    const title=document.createElement("h4");title.textContent="India imports, exports and trade balance";
    block.append(title);
    if(year<2022||year>2026){
      const note=document.createElement("p");
      note.textContent=`No separately sourced India trade observations have been supplied for fiscal year ending ${year}.`;
      block.append(note);panel.append(block);return;
    }
    try{
      const result=await getJSON(`api/india-trade/years/${year}.json`);
      if(requestId!==request)return;
      const entries=result.observations||[];
      const grouped=new Map();
      for(const item of entries){
        const code=item.partner||"IN";
        if(!grouped.has(code))grouped.set(code,{});
        grouped.get(code)[item.indicator]=item;
      }
      const explain=document.createElement("p");
      explain.textContent=`Fiscal year ${year-1}–${year} · goods · values in USD billions. Original source rows and report references remain attached to each observation.`;
      block.append(explain);
      const table=document.createElement("table");table.className="wfb-india-trade-table";
      const head=document.createElement("thead"),hrow=document.createElement("tr");
      for(const label of ["Partner","Exports","Imports","Trade balance","Total trade"]){
        const cell=document.createElement("th");cell.textContent=label;hrow.append(cell);
      }
      head.append(hrow);table.append(head);
      const body=document.createElement("tbody");
      const amount=item=>item?.value==null?"—":
        `${Number(item.value)<0?"−":""}$${(Math.abs(Number(item.value))/1e9).toLocaleString(undefined,{maximumFractionDigits:2,minimumFractionDigits:2})}bn`;
      for(const [code,items] of [...grouped.entries()].sort((a,b)=>a[0]==="IN"?-1:b[0]==="IN"?1:a[0].localeCompare(b[0]))){
        const tr=document.createElement("tr");
        const partner=code==="IN"?"India · national goods":state.points.find(p=>p.code===code)?.name||code;
        for(const value of [partner,amount(items.exports),amount(items.imports),amount(items.trade_balance),amount(items.total_trade)]){
          const cell=document.createElement("td");cell.textContent=value;tr.append(cell);
        }
        body.append(tr);
      }
      table.append(body);block.append(table);
      const source=entries.find(r=>r.sources?.length)?.sources?.[0];
      const credit=document.createElement("p");
      credit.textContent=source?`Source: ${source.agency||source.filename} · fiscal year ending ${year}.`:
        "Source details are attached to the exported observations.";
      block.append(credit);panel.append(block);
    }catch(error){
      if(requestId!==request)return;
      const note=document.createElement("p");note.textContent=`India trade records unavailable: ${error.message}`;
      block.append(note);panel.append(block);
    }
  }
  async function loadProfile(){
    const current=++request,code=state.country,year=state.year;
    const panel=$("[data-wfb-country-profile]");panel.replaceChildren();
    const selected=state.catalogue?.countries?.find(row=>row.code===code);
    $("[data-wfb-country-heading]").textContent=selected?.name||state.points.find(x=>x.code===code)?.name||"Select a location";
    if(!code){status("Choose a place to view an edition.");return;}
    const edition=state.catalogue?.years?.find(row=>row.year===year);
    const entry=selected?.years?.find(row=>row.year===year);
    if(!entry){
      status(`${year}: ${edition?.status||"missing"}. No source-backed Factbook profile is available for this location and edition.`);
      if(code==="IN")await loadIndiaTrade(panel,year,current);
      return;
    }
    status(`${year} · ${edition?.status||"partial"} · loading sourced fields…`);
    try{
      const index=await getJSON(entry.path);
      const parts=await Promise.all(index.parts.map(part=>getJSON(part.path)));
      if(current!==request)return;
      status(`${year} · ${edition?.status||"partial"} · ${index.fields} fields · ${index.media.length} media · ${index.source.name}`);
      const groups=new Map();
      for(const part of parts)for(const field of part.fields){
        if(!groups.has(field.category))groups.set(field.category,[]);
        groups.get(field.category).push(field);
      }
      for(const [category,fields] of groups){
        const section=document.createElement("section");section.className="wfb-country-section";
        const title=document.createElement("h4");title.textContent=category.replaceAll("-"," ");section.append(title);
        const dl=document.createElement("dl");
        for(const field of fields){
          const row=document.createElement("div");row.className="wfb-country-field";
          const dt=document.createElement("dt");dt.textContent=field.label;
          const dd=document.createElement("dd");dd.textContent=field.content;
          const cite=document.createElement("small");cite.textContent=`Source location: ${field.locator}`;
          dd.append(cite);row.append(dt,dd);dl.append(row);
        }
        section.append(dl);panel.append(section);
      }
      if(index.media.length){
        const section=document.createElement("section");section.className="wfb-country-section";
        const title=document.createElement("h4");title.textContent="Images, charts and diagrams";section.append(title);
        const grid=document.createElement("div");grid.className="wfb-country-media";
        for(const media of index.media){
          const figure=document.createElement("figure");
          const rights=String(media.rights||"").toLowerCase();
          const cleared=["public domain","public-domain","redistribution cleared","licensed"].includes(rights);
          if(cleared){
            const img=document.createElement("img");img.loading="lazy";
            img.src=new URL(media.path,root).href;img.alt=media.alt||media.label;
            figure.append(img);
          }else{
            const withheld=document.createElement("p");withheld.className="wfb-media-withheld";
            withheld.textContent="Image withheld pending source and rights review";
            figure.append(withheld);
          }
          const caption=document.createElement("figcaption");
          caption.textContent=`${media.kind}: ${media.label} · ${media.locator}${media.ocr?" · OCR available":""} · ${media.rights}`;
          figure.append(caption);
          if(media.ocr){
            const details=document.createElement("details"),summary=document.createElement("summary");
            summary.textContent="Extracted image text";
            const transcript=document.createElement("pre");transcript.textContent=media.ocr;
            details.append(summary,transcript);figure.append(details);
          }
          grid.append(figure);
        }
        section.append(grid);panel.append(section);
      }
      if(code==="IN")await loadIndiaTrade(panel,year,current);
    }catch(error){if(current===request)status(`Source data unavailable: ${error.message}`);}
  }
  function setYear(year){
    state.year=Number(year);$("[data-wfb-globe-year]").textContent=year;
    $("[data-wfb-globe-slider]").value=year;
    state.available=new Set((state.catalogue?.countries||[])
      .filter(row=>row.years?.some(entry=>entry.year===state.year)).map(row=>row.code));
    boundaryStatus(`Boundaries: loading geometry for ${year}…`);
    loadBoundaries(state.year);
    draw();
    loadProfile();
  }
  function connect(canvas){
    let down=null;
    canvas.addEventListener("pointerdown",event=>{
      if(event.button!==0)return;
      down={x:event.clientX,y:event.clientY,yaw:state.yaw,moved:false};
      state.dragging=true;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove",event=>{
      if(!down){
        const bounds=canvas.getBoundingClientRect();
        const x=event.clientX-bounds.left,y=event.clientY-bounds.top;
        const near=state.candidates.find(point=>Math.hypot(x-point.x,y-point.y)<10);
        const unit=near||regionAt(x,y,bounds.width,bounds.height);
        canvas.title=unit?`${unit.label||unit.name} · click to read ${state.year}`:"Drag to rotate Earth";
        return;
      }
      const dx=event.clientX-down.x;
      if(Math.abs(dx)+Math.abs(event.clientY-down.y)>5)down.moved=true;
      if(down.moved){state.yaw=down.yaw-dx*.007;draw();}
    });
    canvas.addEventListener("pointerup",event=>{
      if(!down)return;
      if(!down.moved){
        const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
        const near=state.candidates.map(p=>({...p,d:Math.hypot(x-p.x,y-p.y)})).sort((a,b)=>a.d-b.d)[0];
        if(near&&near.d<14)choose(near.code);
        else{
          const region=regionAt(x,y,rect.width,rect.height);
          if(region)choose(region.code);
        }
      }
      down=null;
      state.dragging=false;
    });
    canvas.addEventListener("pointercancel",()=>{down=null;state.dragging=false;});
  }
  function frame(now){
    const dt=state.lastFrame?Math.max(0,(now-state.lastFrame)/1000):0;
    state.lastFrame=now;
    if(!document.hidden&&state.playing&&!state.dragging){
      state.yaw=(state.yaw+2*Math.PI*dt/state.rotationSeconds)%(2*Math.PI);
      draw();
    }
    requestAnimationFrame(frame);
  }
  async function init(){
    const canvas=$("[data-wfb-globe-canvas]");if(!canvas)return;
    try{state.catalogue=await getJSON("api/country-archive/index.json");}
    catch(error){status("Country archive not generated yet. Run the local Factbook import and export commands.");}
    state.available=new Set((state.catalogue?.countries||[]).map(row=>row.code));
    try{state.points=(await getJSON("country-points.json")).points;}
    catch(error){status("Place coordinates unavailable; use the location selector.");}
    const select=$("[data-wfb-globe-country]");
    const listed=new Set();
    for(const point of state.points){if(listed.has(point.code))continue;listed.add(point.code);}
    for(const country of state.catalogue?.countries||[]){
      if(listed.has(country.code)){
        const point=state.points.find(p=>p.code===country.code);
        if(Number.isFinite(country.lat)&&Number.isFinite(country.lon)){
          point.lat=country.lat;point.lon=country.lon;
        }
        continue;
      }
      state.points.push({code:country.code,name:country.name,
        lat:Number.isFinite(country.lat)?country.lat:null,
        lon:Number.isFinite(country.lon)?country.lon:null});
    }
    for(const point of state.points.slice().sort((a,b)=>a.name.localeCompare(b.name))){
      const option=document.createElement("option");option.value=point.code;
      option.textContent=`${point.name} [${point.code}]`;select.append(option);
    }
    const years=state.catalogue?.years?.filter(row=>row.fields>0)||[];
    if(years.length)state.year=years[years.length-1].year;
    $("[data-wfb-globe-slider]").value=state.year;
    $("[data-wfb-globe-year]").textContent=state.year;
    state.renderer=await window.WFBGlobeRenderer.create(canvas,cpuFallback);
    showRenderer();
    connect(canvas);
    select.addEventListener("change",()=>choose(select.value));
    const slider=$("[data-wfb-globe-slider]");
    slider.addEventListener("input",()=>setYear(slider.value));
    document.querySelectorAll('input[name="wfb-layer"]').forEach(input=>input.addEventListener("change",()=>{
      if(input.checked)setLayer(input.value);
    }));
    const rotation=$("[data-wfb-rotation-seconds]");
    const period=$("[data-wfb-rotation-value]");
    const toggle=$("[data-wfb-rotation-toggle]");
    const updateToggle=()=>{
      toggle.textContent=state.playing?"Pause rotation":"Start rotation";
      toggle.setAttribute("aria-pressed",String(state.playing));
    };
    state.playing=!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    updateToggle();
    rotation.addEventListener("input",()=>{
      state.rotationSeconds=Math.min(30,Math.max(15,Number(rotation.value)||20));
      period.textContent=`${state.rotationSeconds} s`;
    });
    toggle.addEventListener("click",()=>{state.playing=!state.playing;updateToggle();draw();});
    if(window.ResizeObserver)new ResizeObserver(draw).observe(canvas.parentElement);
    else window.addEventListener("resize",draw);
    document.addEventListener("visibilitychange",()=>{state.lastFrame=0;if(!document.hidden)draw();});
    upload(fallbackTexture());draw();
    try{state.boundaryManifest=await getJSON("boundaries/manifest.json");}
    catch(error){boundaryStatus("Local boundaries not installed; use the location selector");}
    setYear(state.year);
    choose(state.catalogue?.countries?.find(x=>x.code==="IN")?.code||"");
    requestAnimationFrame(frame);
  }
  W.globe=Object.freeze({init,choose,setYear});
})();
