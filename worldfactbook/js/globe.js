(function () {
  "use strict";
  const W = window.WFB;
  const client = window.ZZXWorldFactbook;
  if (!W || !client) return;
  const root = client.root;
  const $ = (selector) => document.querySelector(selector);
  const state = { catalogue:null, points:[], country:"", year:2004, yaw:0.2,
    layer:"tactical", layers:new Map(), renderer:null, candidates:[], version:0, available:new Set(),
    imageCache:new Map(), lastTexture:null, rotationSeconds:20, playing:true,
    dragging:false, lastFrame:0, boundaryManifest:null, boundaries:null,
    boundaryVersion:0, lookup:null, selectedRings:[], shapeVersion:0,
    water:null, waterFeature:null, waterAnchor:null, waterVersion:0,
    selectionVersion:0,
    zoom:1, axis:0, pitchOffset:0, flat:false, rate:1, direction:1,
    theme:window.WFBGlobeConfig?.themes?.[0]||null, portal:null };
  const TAU=Math.PI*2, RAD=Math.PI/180, SIDEREAL_DAY=86164.0905;
  function sunPosition(){
    const now=new Date(),start=Date.UTC(now.getUTCFullYear(),0,0);
    const day=(now.getTime()-start)/86400000;
    const decl=23.44*RAD*Math.sin(TAU*(day-80)/365.2422);
    const utc=(now.getUTCHours()*3600+now.getUTCMinutes()*60+now.getUTCSeconds())/86400;
    return {sunLon:(.5-utc)*TAU,sunDecl:decl};
  }
  function pitch(){return state.pitchOffset+state.axis*23.44*RAD;}
  function themeAccent(){return window.WFBGlobeConfig.rgb(state.theme?.accent||"#c0d674");}
  function applyTheme(id){
    const chosen=window.WFBGlobeConfig.themes.find(item=>item.id===id)||window.WFBGlobeConfig.themes[0];
    state.theme=chosen;
    const node=$("[data-wfb-globe-studio]");node.dataset.theme=chosen.id;
    const tokens={"--wfb-panel":chosen.panel,"--wfb-bg-2":chosen.background,
      "--wfb-green":chosen.accent,"--wfb-amber":chosen.gold,"--wfb-text":"#e0e8d7",
      "--wfb-text-soft":"#c1cdb9","--wfb-muted":"#a0afa0"};
    for(const [name,value] of Object.entries(tokens))node.style.setProperty(name,value);
    const rgb=window.WFBGlobeConfig.rgb(chosen.accent).map(x=>Math.round(x*255));
    node.style.setProperty("--wfb-line",`rgba(${rgb.join(",")},.30)`);
    node.style.setProperty("--wfb-line-strong",`rgba(${rgb.join(",")},.55)`);
    node.style.setProperty("--wfb-line-soft",`rgba(${rgb.join(",")},.14)`);
    draw();
  }
  function setZoom(value){
    state.zoom=Math.min(6,Math.max(1,Number(value)||1));
    const knob=$("[data-wfb-knob=zoom]");
    knob.setAttribute("aria-valuenow",String(Math.round(state.zoom*100)));
    knob.style.setProperty("--knob-angle",`${(state.zoom-1)/5*270}deg`);
    knob.classList.toggle("at-limit",state.zoom===1||state.zoom===6);
    $("[data-wfb-zoom-value]").textContent=`${Math.round(state.zoom*100)}%`;
    draw();
  }
  function setAxis(value){
    state.axis=Math.min(1,Math.max(0,Number(value)/100||0));
    const knob=$("[data-wfb-knob=axis]");
    knob.setAttribute("aria-valuenow",String(Math.round(state.axis*100)));
    knob.style.setProperty("--knob-angle",`${state.axis*270}deg`);
    const label=state.axis===1?"Earth time":state.axis===0?"map spin":"blended";
    $("[data-wfb-axis-value]").textContent=`${Math.round(state.axis*100)}% · ${label}`;
    $("[data-wfb-rotation-value]").textContent=state.axis===1?"23 h 56 m":
      `${state.rotationSeconds} s`;
    draw();
  }
  function bindKnob(selector,get,set,step){
    const knob=$(selector);let down=null;
    knob.addEventListener("pointerdown",event=>{
      down={y:event.clientY,start:get()};knob.setPointerCapture(event.pointerId);
    });
    knob.addEventListener("pointermove",event=>{if(down)set(down.start+(down.y-event.clientY)*step);});
    knob.addEventListener("pointerup",()=>{down=null;});
    knob.addEventListener("pointercancel",()=>{down=null;});
    knob.addEventListener("wheel",event=>{event.preventDefault();set(get()+(event.deltaY<0?step*8:-step*8));},{passive:false});
    knob.addEventListener("keydown",event=>{
      const sign=["ArrowUp","ArrowRight"].includes(event.key)?1:
        ["ArrowDown","ArrowLeft"].includes(event.key)?-1:0;
      if(sign){event.preventDefault();set(get()+sign*step*8);}
      if(event.key==="Home"||event.key==="End"){
        event.preventDefault();set(event.key==="Home"?Number(knob.getAttribute("aria-valuemin")):
          Number(knob.getAttribute("aria-valuemax")));
      }
    });
  }
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
    const entry=state.layers.get(layer);
    if(!entry)return "boundaries/reference/map.png";
    if(state.boundaries?.kind==="historical" && ["tactical","political","topographic"].includes(layer)){
      const name=layer==="topographic"?"topo.png":"map.png";
      return `boundaries/${state.boundaries.base}${name}`;
    }
    return entry.file;
  }
  function layerTexture(layer){return loadImage(new URL(texturePath(layer),root).href);}
  async function setLayer(layer){
    const entry=state.layers.get(layer);if(!entry?.installed)return;
    state.layer=layer;
    const credit=$("[data-wfb-globe-attribution]");
    credit.replaceChildren();
    const link=document.createElement("a");link.href=entry.url;
    link.rel="noopener noreferrer";link.target="_blank";link.textContent=entry.credit;
    credit.append(link);
    if(entry.imagery_year)credit.append(` · ${entry.imagery_year} imagery; edition year applies to data and dated borders`);
    else if(entry.file.startsWith("boundaries/custom/"))credit.append(" · reference imagery; selected Factbook edition may differ");
    if(entry.relief)credit.append(" · relief is illustrative until a measured elevation raster is installed");
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
    try{state.renderer?.setTexture(image);}catch(error){console.warn("Globe texture unsupported by GPU",error);cpuFallback();}
  }
  function showRenderer(){
    const node=$("[data-wfb-globe-renderer]");
    if(node)node.textContent=`Renderer: ${state.renderer?.kind||"loading"}`;
  }
  function cpuFallback(){
    if(state.renderer?.kind==="Canvas 2D fallback")return;
    try{state.renderer?.destroy();}catch(error){console.warn("Globe GPU cleanup failed",error);}
    state.renderer=window.WFBGlobeRenderer.createCPU($("[data-wfb-globe-canvas]"));
    state.renderer.setRelief(fallbackTexture());
    state.renderer.setTexture(state.lastTexture||fallbackTexture());
    showRenderer();draw();
  }
  function boundaryStatus(text){
    const node=$("[data-wfb-boundary-status]");if(node)node.textContent=text;
  }
  function waterStatus(text){
    const node=$("[data-wfb-water-status]");if(node)node.textContent=text;
  }
  async function loadWater(year){
    const token=++state.waterVersion;
    try{
      const dataset=await window.WFBWaterBoundaries.open(root,year);
      if(token!==state.waterVersion)return;
      state.water=dataset;
      waterStatus(dataset.historical?`Water: ${year} source geometry (${dataset.index.status})`:
        `Water: ${dataset.features.length.toLocaleString()} reference features · historical year unavailable`);
      const select=$("[data-wfb-water-body]");
      const version=`${dataset.index.kind}:${dataset.index.year??"reference"}`;
      if(select.dataset.version!==version){
        const fragment=document.createDocumentFragment();
        const placeholder=document.createElement("option");placeholder.value="";
        placeholder.textContent="Choose water geography";fragment.append(placeholder);
        for(const feature of dataset.features.slice().sort((a,b)=>a.name.localeCompare(b.name))){
          const option=document.createElement("option");option.value=String(feature.id);
          option.textContent=`${feature.name} · ${feature.kind}`;fragment.append(option);
        }
        select.replaceChildren(fragment);select.dataset.version=version;
      }
      if(state.waterFeature){
        const active=dataset.features.find(feature=>feature.source_id===state.waterFeature.source_id);
        if(active){state.waterFeature=active;
          const groups=await dataset.geometry(active);
          if(token!==state.waterVersion||state.waterFeature?.source_id!==active.source_id)return;
          state.selectedRings=groups.flat();
          select.value=String(active.id);draw();loadProfile();
        }else{state.waterFeature=null;state.waterAnchor=null;select.value="";draw();loadProfile();}
      }
    }catch(error){
      if(token!==state.waterVersion)return;
      console.warn("Water reference geometry unavailable",error);
      state.water=null;
      waterStatus("Water geometry unavailable; reinstall the cited water index");
    }
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
      if(state.country)loadSelectedShape(true);
      setLayer(state.layer);draw();
    }catch(error){
      if(generation!==state.boundaryVersion)return;
      console.warn("Local boundary layer unavailable",error);
      state.lookup=null;state.boundaries=null;
      if(state.country)state.selectedRings=[];
      boundaryStatus("Boundaries unavailable; use location markers or the selector");
      setLayer(state.layer);draw();
    }
  }
  async function loadSelectedShape(fit=false){
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
      if(fit){
        const centre=state.points.find(point=>point.code===code);
        const values=state.selectedRings.flat();
        if(centre&&values.length){
          let minLon=180,maxLon=-180,minLat=90,maxLat=-90;
          for(const [lon,lat] of values){
            const diff=((lon-centre.lon+540)%360)-180;
            minLon=Math.min(minLon,diff);maxLon=Math.max(maxLon,diff);
            minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);
          }
          const lonSpan=maxLon-minLon,latSpan=maxLat-minLat;
          setZoom(Math.min(6,Math.max(1.15,Math.min(140/Math.max(lonSpan,4),
            100/Math.max(latSpan,4)))));
        }
      }
      draw();
    }catch(error){if(token===state.shapeVersion)console.warn("Selected outline unavailable",error);}
  }
  function coordinatesAt(x,y,width,height){
    let longitude,latitude;
    if(state.flat){
      longitude=(x/width-.5)*TAU/state.zoom+state.yaw;
      latitude=(.5-y/height)*Math.PI/state.zoom;
      if(Math.abs(latitude)>Math.PI/2)return null;
    }else{
      const radius=Math.min(width,height)*.4*state.zoom;
      const nx=(x-width/2)/radius,ny=(height/2-y)/radius;
      const distance=nx*nx+ny*ny;if(distance>1)return null;
      const nz=Math.sqrt(Math.max(0,1-distance));
      const gy=Math.cos(pitch())*ny+Math.sin(pitch())*nz;
      const gz=-Math.sin(pitch())*ny+Math.cos(pitch())*nz;
      longitude=Math.atan2(nx,gz)+state.yaw;
      latitude=Math.asin(Math.max(-1,Math.min(1,gy)));
    }
    return {lon:((longitude/RAD+540)%360+360)%360-180,lat:latitude/RAD};
  }
  function regionAt(x,y,width,height,position=coordinatesAt(x,y,width,height)){
    const lookup=state.lookup;if(!lookup||!position)return null;
    const u=((position.lon/360+.5)%1+1)%1;
    const v=Math.min(1-Number.EPSILON,Math.max(0,.5-position.lat/180));
    const offset=(Math.floor(v*lookup.height)*lookup.width+Math.floor(u*lookup.width))*4;
    const id=lookup.bytes[offset]+256*lookup.bytes[offset+1]+65536*lookup.bytes[offset+2];
    return lookup.features.get(id)||null;
  }
  function drawOutline(ctx,width,height){
    if(!state.selectedRings.length)return;
    ctx.save();ctx.strokeStyle=state.waterFeature?"#82d1dc":state.theme.gold;ctx.lineWidth=1.8;
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
    const lat=point.lat*RAD;
    const delta=((point.lon*RAD-state.yaw+Math.PI)%TAU+TAU)%TAU-Math.PI;
    if(state.flat)return {x:width/2+delta/TAU*width*state.zoom,
      y:height/2-lat/Math.PI*height*state.zoom,z:1};
    const rawz=Math.cos(lat)*Math.cos(delta);
    const y=Math.cos(pitch())*Math.sin(lat)-Math.sin(pitch())*rawz;
    const z=Math.sin(pitch())*Math.sin(lat)+Math.cos(pitch())*rawz;
    if(z<=0)return null;
    const radius=Math.min(width,height)*.4*state.zoom;
    return {x:width/2+Math.cos(lat)*Math.sin(delta)*radius,
            y:height/2-y*radius,z};
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
    const layer=state.layers.get(state.layer),solar=sunPosition();
    try{state.renderer?.draw(w,h,{yaw:state.yaw,pitch:pitch(),zoom:state.zoom,
      flat:state.flat,tactical:Boolean(layer?.grid),relief:layer?.relief||0,
      realism:state.axis,sunLon:solar.sunLon,sunDecl:solar.sunDecl,accent:themeAccent()});}
    catch(error){console.warn("Globe GPU rendering failed",error);cpuFallback();}
    const ctx=marker.getContext("2d");ctx.clearRect(0,0,w,h);ctx.scale(ratio,ratio);
    drawOutline(ctx,width,height);
    state.candidates=[];
    for(const point of state.points){
      const p=project(point,width,height);if(!p)continue;
      const selected=point.code===state.country;
      const available=state.available.has(point.code);
      ctx.beginPath();ctx.arc(p.x,p.y,selected?5:available?2.8:1.4,0,Math.PI*2);
      ctx.fillStyle=selected?state.theme.gold:available?state.theme.accent:"#657964";ctx.fill();
      if(selected){ctx.font="12px monospace";ctx.fillStyle=state.theme.accent;ctx.fillText(point.name,p.x+9,p.y-8);}
      state.candidates.push({...point,x:p.x,y:p.y});
    }
    const waterPoint=state.waterFeature&&state.waterAnchor?
      project(state.waterAnchor,width,height):null;
    if(waterPoint){
      ctx.beginPath();ctx.arc(waterPoint.x,waterPoint.y,5,0,TAU);
      ctx.fillStyle="#82d1dc";ctx.fill();
      ctx.font="12px monospace";ctx.fillText(state.waterFeature.name,
        waterPoint.x+9,waterPoint.y-8);
    }
    ctx.setTransform(1,0,0,1,0,0);
    const callout=$("[data-wfb-globe-callout]");
    const anchor=waterPoint||state.candidates.find(point=>point.code===state.country);
    callout.hidden=!anchor;
    if(anchor){callout.style.left=`${Math.max(165,Math.min(width-165,anchor.x))}px`;
      callout.style.top=`${Math.max(115,anchor.y)}px`;}
  }
  const getJSON=async path=>{
    const response=await fetch(new URL(path,root));
    if(!response.ok)throw Error(`HTTP ${response.status} loading ${path}`);
    return response.json();
  };
  function status(text){$("[data-wfb-country-status]").textContent=text;}
  function choose(code){
    state.selectionVersion++;
    state.waterFeature=null;state.waterAnchor=null;
    $("[data-wfb-water-body]").value="";
    state.country=code;$("[data-wfb-globe-country]").value=code;
    const point=state.points.find(x=>x.code===code);
    if(point&&Number.isFinite(point.lon))state.yaw=point.lon*RAD;
    loadSelectedShape(true);draw();loadProfile();
  }
  async function chooseWater(feature,anchor,readyPaths){
    const token=++state.selectionVersion;
    let groups=readyPaths;
    if(!groups){
      try{groups=await state.water.geometry(feature);}
      catch(error){waterStatus(`Unable to load water outline: ${error.message}`);return;}
    }
    if(token!==state.selectionVersion)return;
    ++state.shapeVersion;
    state.waterFeature=feature;
    state.waterAnchor=anchor||{lon:feature.lon,lat:feature.lat};
    state.country="";$("[data-wfb-globe-country]").value="";
    $("[data-wfb-water-body]").value=String(feature.id);
    state.selectedRings=groups.flat();
    state.yaw=state.waterAnchor.lon*RAD;
    if(!anchor){
      const [west,south,east,north]=feature.bbox;
      const span=Math.max(east-west,north-south);
      setZoom(Math.min(6,Math.max(1,125/Math.max(span,5))));
    }
    draw();loadProfile();
  }
  let request=0;
  function callout(rows,statusLabel){
    const box=$("[data-wfb-globe-callout]");box.replaceChildren();
    if(state.waterFeature){
      const feature=state.waterFeature;
      const title=document.createElement("strong");title.textContent=feature.name;
      const subtitle=document.createElement("small");
      subtitle.textContent=`${feature.kind} · ${state.water?.historical?state.year+" source":"present-day reference"}`;
      box.append(title,subtitle);
      const source=document.createElement("small");
      source.textContent=state.water?.sources.get(feature.source)?.id||feature.source;
      box.append(source);box.hidden=false;return;
    }
    const point=state.points.find(item=>item.code===state.country);
    if(!point){box.hidden=true;return;}
    const title=document.createElement("strong");title.textContent=`${point.name} · ${state.year}`;
    const subtitle=document.createElement("small");subtitle.textContent=statusLabel;
    box.append(title,subtitle);
    for(const [label,value] of rows){
      const line=document.createElement("small");line.textContent=`${label}: ${value}`;box.append(line);
    }
    box.hidden=false;
  }
  async function loadLegacyProfile(panel,code,year,current){
    let edition;
    try{edition=await getJSON(`api/editions/${year}/index.json`);}
    catch(error){
      if(current===request){
        status(`${year}: no public country archive or legacy edition is installed.`);
        callout([],"No source-backed profile available");
      }
      return;
    }
    if(current!==request)return;
    if(!edition.chunks || edition.status==="missing"){
      status(`${year}: edition source missing. No country record is available.`);
      callout([],"Edition source missing");return;
    }
    const note=document.createElement("p");note.className="wfb-country-notice";
    note.textContent="Provisional legacy transcription. Country and category assignments in this corpus have not been fully reviewed and some are demonstrably incorrect. Read the original excerpts and source links; do not use these as verified edition facts.";
    panel.append(note);
    const pages=await Promise.allSettled((edition.categories||[]).filter(item=>
      typeof item.path==="string"&&item.path.startsWith(`editions/${year}/`)&&item.path.endsWith(".json"))
      .map(async item=>({category:item.id,data:await getJSON(`api/${item.path}`)})));
    if(current!==request)return;
    let total=0,failed=0;
    for(const result of pages){
      if(result.status!=="fulfilled"){failed++;continue;}
      const {category,data}=result.value;
      const excerpts=(data.chunks||[]).filter(row=>row.entity_code===code);
      if(!excerpts.length)continue;
      const section=document.createElement("section");section.className="wfb-country-section";
      const heading=document.createElement("h4");heading.textContent=category.replaceAll("-"," ");section.append(heading);
      for(const chunk of excerpts){
        total++;
        const pre=document.createElement("pre");pre.textContent=chunk.content||"";section.append(pre);
        const source=document.createElement("p");source.className="wfb-country-source";
        source.textContent=`Legacy excerpt ${chunk.ordinal??"?"} · ${chunk.source_identifier||"source identifier unavailable"} · edition assignment unreviewed`;
        if(/^https:\/\//.test(chunk.source_url||"")){
          const link=document.createElement("a");link.href=chunk.source_url;
          link.rel="noopener noreferrer";link.target="_blank";link.textContent=" · original source";
          source.append(link);
        }
        section.append(source);
      }
      panel.append(section);
    }
    status(`${year} · ${total} unreviewed excerpts for ${code}${failed?` · ${failed} category files unavailable`:""}`);
    if(!total){const empty=document.createElement("p");empty.className="wfb-country-notice";
      empty.textContent="This corpus has no country-tagged excerpt for the selected year and location.";panel.append(empty);}
    callout([],`${total} unreviewed excerpts; no verified summary`);
  }
  async function loadIndiaTrade(panel,year,requestId){
    const block=document.createElement("section");block.className="wfb-country-section wfb-trade";
    const title=document.createElement("h4");title.textContent="India imports, exports and trade balance";
    block.append(title);
    if(year<2022||year>2026){
      if(requestId!==request)return;
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
    panel.dataset.waterCode=state.waterFeature?.source_id||"";
    if(state.waterFeature){
      const feature=state.waterFeature,source=state.water?.sources.get(feature.source);
      $("[data-wfb-country-heading]").textContent=feature.name;
      status(`${feature.kind} · ${state.water?.historical?year+" sourced boundary":"present-day reference boundary"}`);
      callout([],"Water boundary");
      const note=document.createElement("p");note.className="wfb-country-notice";
      note.textContent=state.water?.historical?
        `${year} water geometry is source-dated and awaits review against that edition.`:
        `The ${year} slider selects Factbook country data. This water geometry is a current map reference and makes no claim about the ${year} shoreline or water extent.`;
      panel.append(note);
      const section=document.createElement("section");section.className="wfb-country-section wfb-water-section";
      const title=document.createElement("h4");title.textContent="Water body / source record";section.append(title);
      const dl=document.createElement("dl");
      for(const [label,value] of [["Feature class",feature.kind],
        ["Geometry",feature.geometry==="line"?"mapped centerline · select within the highlighted path":"mapped area · exact vector outline"],
        ["Source identifier",feature.source_id],
        ["Reference coordinates",`${feature.lat.toFixed(5)}°, ${feature.lon.toFixed(5)}°`],
        ["Rights",source?.license||"See source"]]){
        const row=document.createElement("div");row.className="wfb-country-field";
        const dt=document.createElement("dt"),dd=document.createElement("dd");
        dt.textContent=label;dd.textContent=value;row.append(dt,dd);dl.append(row);
      }
      section.append(dl);
      const cite=document.createElement("p");cite.className="wfb-country-source";
      cite.append("Geography: ");
      const link=document.createElement("a");link.href=source?.url||"https://www.naturalearthdata.com/";
      link.target="_blank";link.rel="noopener noreferrer";link.textContent=source?.id||"Natural Earth";
      cite.append(link,` · source SHA-256 ${source?.sha256||"not recorded"}`);
      section.append(cite);panel.append(section);
      return;
    }
    const selected=state.catalogue?.countries?.find(row=>row.code===code);
    $("[data-wfb-country-heading]").textContent=selected?.name||state.points.find(x=>x.code===code)?.name||"Select a location";
    if(!code){status("Choose a place to view an edition.");return;}
    const edition=state.catalogue?.years?.find(row=>row.year===year);
    const entry=selected?.years?.find(row=>row.year===year);
    if(!entry){
      await loadLegacyProfile(panel,code,year,current);
      if(current!==request)return;
      if(code==="IN")await loadIndiaTrade(panel,year,current);
      return;
    }
    status(`${year} · ${edition?.status||"partial"} · loading sourced fields…`);
    try{
      const index=await getJSON(entry.path);
      const parts=await Promise.all(index.parts.map(part=>getJSON(part.path)));
      if(current!==request)return;
      status(`${year} · ${edition?.status||"partial"} · ${index.fields} fields · ${index.media.length} media · ${index.source.name}`);
      const allFields=parts.flatMap(part=>part.fields||[]);
      const extract=(matcher)=>allFields.find(field=>matcher.test(field.label||""))?.content;
      callout([["Capital",extract(/^capital$/i)],["Population",extract(/^population$/i)],
        ["GDP",extract(/^gdp(?:\s|$|\s*-)/i)]].filter(pair=>pair[1]),
        `${edition?.status||"partial"} · ${index.fields} sourced fields`);
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
          const cleared=["public domain","public-domain","redistribution cleared"].includes(rights);
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
    state.selectionVersion++;
    state.year=Number(year);$("[data-wfb-globe-year]").textContent=year;
    $("[data-wfb-globe-slider]").value=year;
    state.available=new Set((state.catalogue?.countries||[])
      .filter(row=>row.years?.some(entry=>entry.year===state.year)).map(row=>row.code));
    boundaryStatus(`Boundaries: loading geometry for ${year}…`);
    loadBoundaries(state.year);
    loadWater(state.year);
    draw();
    loadProfile();
  }
  function connect(canvas){
    let down=null,hover=0;
    canvas.addEventListener("pointerdown",event=>{
      if(event.button!==0&&event.button!==1)return;
      event.preventDefault();
      down={x:event.clientX,y:event.clientY,yaw:state.yaw,pitch:state.pitchOffset,
        moved:false,button:event.button};
      state.dragging=true;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove",event=>{
      if(!down){
        const bounds=canvas.getBoundingClientRect();
        const x=event.clientX-bounds.left,y=event.clientY-bounds.top;
        const near=state.candidates.find(point=>Math.hypot(x-point.x,y-point.y)<10);
        const geo=coordinatesAt(x,y,bounds.width,bounds.height);
        const land=regionAt(x,y,bounds.width,bounds.height,geo);
        const unit=near||land;
        canvas.title=unit?`${unit.label||unit.name} · click to read ${state.year}`:"Drag to rotate Earth";
        const token=++hover;
        if(!near&&geo&&state.water){
          setTimeout(async()=>{
            if(token!==hover||down)return;
            try{
              const water=await state.water.hit(geo.lon,geo.lat,x,y,
                point=>project(point,bounds.width,bounds.height),
                bounds.width,bounds.height,state.zoom,Boolean(land));
              if(token===hover&&water)canvas.title=`${water.feature.name} · ${water.feature.kind} · click to inspect`;
            }catch(error){console.warn("Water hover unavailable",error);}
          },120);
        }
        return;
      }
      const dx=event.clientX-down.x;
      if(Math.abs(dx)+Math.abs(event.clientY-down.y)>5)down.moved=true;
      if(down.moved){
        state.yaw=down.yaw-dx*.007;
        if(!state.flat)state.pitchOffset=Math.max(-1.2,Math.min(1.2,down.pitch-(event.clientY-down.y)*.006));
        draw();
      }
    });
    canvas.addEventListener("pointerup",async event=>{
      if(!down)return;
      const pick=!down.moved&&down.button===0;
      down=null;state.dragging=false;
      if(pick){
        const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
        const near=state.candidates.map(p=>({...p,d:Math.hypot(x-p.x,y-p.y)})).sort((a,b)=>a.d-b.d)[0];
        if(near&&near.d<14)choose(near.code);
        else{
          const geo=coordinatesAt(x,y,rect.width,rect.height);
          const land=regionAt(x,y,rect.width,rect.height,geo);
          const token=++state.selectionVersion;
          if(geo&&state.water){
            try{
              const water=await state.water.hit(geo.lon,geo.lat,x,y,
                point=>project(point,rect.width,rect.height),
                rect.width,rect.height,state.zoom,Boolean(land));
              if(token!==state.selectionVersion)return;
              if(water){chooseWater(water.feature,geo,water.paths);return;}
            }catch(error){console.warn("Water click unavailable",error);}
          }
          if(token===state.selectionVersion&&land)choose(land.code);
        }
      }
    });
    canvas.addEventListener("pointercancel",()=>{down=null;state.dragging=false;});
    canvas.addEventListener("wheel",event=>{
      event.preventDefault();setZoom(state.zoom*Math.exp(-event.deltaY*.001));
    },{passive:false});
    canvas.addEventListener("contextmenu",event=>{
      event.preventDefault();$("[data-wfb-country-profile]").scrollIntoView({behavior:"smooth",block:"start"});
    });
  }
  function frame(now){
    const dt=state.lastFrame?Math.max(0,(now-state.lastFrame)/1000):0;
    state.lastFrame=now;
    if(!document.hidden&&state.playing&&!state.dragging){
      const custom=state.rate/state.rotationSeconds;
      const turns=(1-state.axis)*custom-state.axis/SIDEREAL_DAY;
      state.yaw=(state.yaw+state.direction*TAU*dt*turns)%TAU;
      draw();
    }
    requestAnimationFrame(frame);
  }
  async function init(){
    const canvas=$("[data-wfb-globe-canvas]");if(!canvas)return;
    try{
      const manifest=await getJSON("boundaries/layers.json");
      if(!Array.isArray(manifest.layers))throw Error("Invalid layer catalog");
      const select=$("[data-wfb-layer]");
      for(const layer of manifest.layers){
        state.layers.set(layer.id,layer);
        const option=document.createElement("option");option.value=layer.id;
        option.disabled=!layer.installed;
        option.textContent=layer.name+(layer.installed?"":" · install local raster");
        select.append(option);
      }
      select.value="tactical";
      select.addEventListener("change",()=>setLayer(select.value));
    }catch(error){
      state.layers.set("tactical",{file:"boundaries/reference/map.png",grid:true,relief:0,
        credit:"Natural Earth",url:"https://www.naturalearthdata.com/",installed:true});
    }
    const theme=$("[data-wfb-theme]");
    for(const option of window.WFBGlobeConfig.themes){
      const node=document.createElement("option");node.value=option.id;node.textContent=option.name;
      theme.append(node);
    }
    theme.value="theme-1";theme.addEventListener("change",()=>applyTheme(theme.value));
    applyTheme("theme-1");
    try{state.catalogue=await getJSON("api/country-archive/index.json");}
    catch(error){status("Country archive pending; provisional year/category excerpts will load when available.");}
    try{state.portal=await getJSON("api/portal-index.json");}catch(error){state.portal=null;}
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
    else{
      const legacy=(state.portal?.editions||[]).filter(row=>row.chunks>0);
      if(legacy.length)state.year=Number(legacy[legacy.length-1].year);
    }
    $("[data-wfb-globe-slider]").value=state.year;
    $("[data-wfb-globe-year]").textContent=state.year;
    state.renderer=await window.WFBGlobeRenderer.create(canvas,cpuFallback);
    state.renderer.setRelief(fallbackTexture());
    showRenderer();
    connect(canvas);
    select.addEventListener("change",()=>choose(select.value));
    $("[data-wfb-water-body]").addEventListener("change",event=>{
      const feature=state.water?.features.find(item=>item.id===Number(event.target.value));
      if(feature)chooseWater(feature);
      else if(state.waterFeature)choose("");
    });
    const slider=$("[data-wfb-globe-slider]");
    let yearTimer=0;
    slider.addEventListener("input",()=>{
      $("[data-wfb-globe-year]").textContent=slider.value;
      clearTimeout(yearTimer);
      yearTimer=setTimeout(()=>setYear(slider.value),180);
    });
    slider.addEventListener("change",()=>{clearTimeout(yearTimer);setYear(slider.value);});
    bindKnob('[data-wfb-knob="zoom"]',()=>state.zoom*100,value=>setZoom(value/100),2);
    bindKnob('[data-wfb-knob="axis"]',()=>state.axis*100,setAxis,1);
    setZoom(1);setAxis(0);
    document.querySelectorAll("[data-wfb-view]").forEach(button=>button.addEventListener("click",()=>{
      state.flat=button.dataset.wfbView==="2d";
      document.querySelectorAll("[data-wfb-view]").forEach(item=>
        item.setAttribute("aria-pressed",String(item===button)));
      draw();
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
      period.textContent=state.axis===1?"23 h 56 m":`${state.rotationSeconds} s`;
    });
    toggle.addEventListener("click",()=>{state.playing=!state.playing;updateToggle();draw();});
    const reverse=$("[data-wfb-rotation-reverse]");
    reverse.addEventListener("click",()=>{state.direction*=-1;
      reverse.setAttribute("aria-pressed",String(state.direction<0));});
    $("[data-wfb-rotation-rate]").addEventListener("change",event=>{
      state.rate=Number(event.target.value)||1;
    });
    if(window.ResizeObserver)new ResizeObserver(draw).observe(canvas.parentElement);
    else window.addEventListener("resize",draw);
    document.addEventListener("visibilitychange",()=>{state.lastFrame=0;if(!document.hidden)draw();});
    upload(fallbackTexture());draw();
    try{
      const relief=await loadImage(new URL("boundaries/reference/relief-base.png",root).href);
      state.renderer.setRelief(relief);
    }catch(error){console.warn("Local relief not installed",error);}
    try{state.boundaryManifest=await getJSON("boundaries/manifest.json");}
    catch(error){boundaryStatus("Local boundaries not installed; use the location selector");}
    setYear(state.year);
    choose(state.catalogue?.countries?.find(x=>x.code==="IN")?.code||"");
    requestAnimationFrame(frame);
  }
  W.globe=Object.freeze({init,choose,setYear});
})();
