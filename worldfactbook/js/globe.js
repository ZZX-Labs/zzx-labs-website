(function () {
  "use strict";
  const W = window.WFB;
  const client = window.ZZXWorldFactbook;
  if (!W || !client) return;
  const feed = W.CountryFeed;
  const root = client.root;
  const $ = (selector) => document.querySelector(selector);
  const state = { catalogue:null, points:[], country:"", year:2004, yaw:0.2,
    layer:"tactical", layers:new Map(), renderer:null, candidates:[], version:0, available:new Set(), verifiedHTML:null,
    imageCache:new Map(), lastTexture:null, rotationSeconds:20, playing:true,
    dragging:false, lastFrame:0, boundaryManifest:null, boundaries:null,
    boundaryVersion:0, lookup:null, waterLookup:null, waterFeatures:new Map(), selectedRings:[], shapeVersion:0,
    zoom:1, axis:0, pitchOffset:0, flat:false, rate:1, direction:1,
    axialTilt:23.44, solarSync:100, seasonDay:172, simulatedMs:Date.now(),
    clockEpochMs:Date.now(), sunOrbitSpeed:1, moonOrbitSpeed:1,
    showSun:true, showMoon:true,
    theme:window.WFBGlobeConfig?.themes?.[0]||null, portal:null };
  const TAU=Math.PI*2, RAD=Math.PI/180, SIDEREAL_DAY=86164.0905;
  function orbitalDate(){
    const base=new Date(state.clockEpochMs+(state.simulatedMs-state.clockEpochMs)*state.sunOrbitSpeed);
    const start=Date.UTC(base.getUTCFullYear(),0,0);
    const day=(base.getTime()-start)/86400000;
    return new Date(base.getTime()+(state.seasonDay-day)*(1-state.solarSync/100)*86400000);
  }
  function sunPosition(){
    const now=orbitalDate(),start=Date.UTC(now.getUTCFullYear(),0,0);
    const day=(now.getTime()-start)/86400000;
    const decl=state.axialTilt*RAD*Math.sin(TAU*(day-80)/365.2422);
    const utc=(now.getUTCHours()*3600+now.getUTCMinutes()*60+now.getUTCSeconds()+now.getUTCMilliseconds()/1000)/86400;
    return {sunLon:(.5-utc)*TAU,sunDecl:decl, date:now};
  }
  function pitch(){return state.pitchOffset+state.axis*state.axialTilt*RAD;}
  function themeAccent(){return window.WFBGlobeConfig.rgb(state.theme?.accent||"#c0d674");}
  function themeTint(){
    const green=themeAccent(),gold=window.WFBGlobeConfig.rgb(state.theme?.gold||"#e6a42b");
    return green.map((value,index)=>Math.min(1,value*.75+gold[index]*.25));
  }
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
  function setOrbitControl(name,value){
    const limits={tilt:[0,23.44],sync:[0,100],season:[1,365]};
    const [min,max]=limits[name], amount=Math.max(min,Math.min(max,Number(value)||min));
    if(name==="tilt")state.axialTilt=amount;
    if(name==="sync"){
      if(amount===100&&state.solarSync!==100)state.simulatedMs=Date.now();
      state.solarSync=amount;
    }
    if(name==="season")state.seasonDay=amount;
    const knob=$(`[data-wfb-knob="${name}"]`);
    knob.setAttribute("aria-valuenow",String(Math.round(amount*100)/100));
    knob.style.setProperty("--knob-angle",`${(amount-min)/(max-min)*270}deg`);
    knob.classList.toggle("at-limit",amount===min||amount===max);
    const output=$(`[data-wfb-${name}-value]`);
    if(name==="tilt")output.textContent=`${amount.toFixed(1)}°`;
    if(name==="sync")output.textContent=`${Math.round(amount)}% · ${amount===100?"UTC":"manual blend"}`;
    if(name==="season")output.textContent=new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",timeZone:"UTC"})
      .format(new Date(Date.UTC(2025,0,Math.round(amount))));
    draw();
  }
  function setBodySpeed(body,value){
    const amount=Math.min(8,Math.max(.25,Number(value)||.25));
    state[body==="sun"?"sunOrbitSpeed":"moonOrbitSpeed"]=amount;
    const knob=$(`[data-wfb-knob="${body}-speed"]`);
    knob.setAttribute("aria-valuenow",String(Math.round(amount*100)/100));
    knob.style.setProperty("--knob-angle",`${(amount-.25)/7.75*270}deg`);
    knob.classList.toggle("at-limit",amount===.25||amount===8);
    $(`[data-wfb-${body}-speed-value]`).textContent=`${amount.toFixed(2)}×`;
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
      loadSelectedShape(Boolean(state.country));setLayer(state.layer);draw();
    }catch(error){
      if(generation!==state.boundaryVersion)return;
      console.warn("Local boundary layer unavailable",error);
      state.lookup=null;state.boundaries=null;state.selectedRings=[];
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
  function geoAt(x,y,width,height){
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
    return {u:((longitude/TAU+.5)%1+1)%1,
            v:Math.min(1-Number.EPSILON,Math.max(0,.5-latitude/Math.PI))};
  }
  function featureAt(lookup,position){
    if(!lookup||!position)return null;
    const {u,v}=position;
    const offset=(Math.floor(v*lookup.height)*lookup.width+Math.floor(u*lookup.width))*4;
    const id=lookup.bytes[offset]+256*lookup.bytes[offset+1]+65536*lookup.bytes[offset+2];
    return lookup.features.get(id)||null;
  }
  function waterFits(feature){
    if(!feature||state.zoom<feature.min_zoom)return false;
    // The lookup pixel already proves that the selected water body occupies
    // this screen location. A whole-river bounding box is not a click target:
    // long rivers would be impossible to select even at maximum zoom.
    return feature.kind==="ocean"||state.zoom>1;
  }
  function waterAt(position){
    const feature=featureAt(state.waterLookup,position);
    return waterFits(feature)?feature:null;
  }
  function drawOutline(ctx,width,height){
    if(!state.selectedRings.length)return;
    ctx.save();ctx.strokeStyle=state.theme.gold;ctx.lineWidth=1.8;
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
  function drawOrbit(ctx,width,height,solar){
    if(state.flat)return;
    const r=Math.min(width,height)*.4*state.zoom;
    // The circular orbit is a visual approximation. Calendar and lunar phase
    // advance from the same simulation clock as the Earth rotation.
    const days=(state.clockEpochMs-Date.UTC(2000,0,6,18,14))/86400000+
      (state.simulatedMs-state.clockEpochMs)*state.moonOrbitSpeed/86400000;
    const phase=TAU*days/27.321661;
    const orbitR=r*1.22, orbitY=r*.33;
    ctx.save();
    if(state.showMoon){
      ctx.strokeStyle="rgba(192,214,116,.20)";ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(width/2,height/2,orbitR,orbitY,0,0,TAU);ctx.stroke();
    }
    const mx=width/2+orbitR*Math.cos(phase),my=height/2+orbitY*Math.sin(phase);
    if(state.showMoon&&mx>=8&&mx<width-8&&my>=8&&my<height-8){
      ctx.beginPath();ctx.arc(mx,my,Math.max(3,Math.min(9,r*.025)),0,TAU);
      ctx.fillStyle="#d9dfd3";ctx.fill();
      ctx.fillStyle=state.theme.accent;ctx.font="11px monospace";ctx.fillText("Moon",mx+10,my-9);
    }
    const sx=width/2+Math.max(r*1.45,120)*Math.cos(solar.sunLon-state.yaw);
    const sy=height/2-Math.max(r*.5,60)*Math.sin(solar.sunDecl);
    if(state.showSun&&sx>=10&&sx<width-10&&sy>=10&&sy<height-10){
      const glow=ctx.createRadialGradient(sx,sy,2,sx,sy,28);
      glow.addColorStop(0,"rgba(230,164,43,.82)");glow.addColorStop(1,"rgba(230,164,43,0)");
      ctx.fillStyle=glow;ctx.fillRect(sx-28,sy-28,56,56);
      ctx.fillStyle=state.theme.gold;ctx.font="11px monospace";ctx.fillText("Sun",sx+12,sy-8);
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
      realism:state.axis,sunLon:solar.sunLon,sunDecl:solar.sunDecl,accent:themeAccent(),
      tint:themeTint(),tintStrength:/(?:satellite|nasa|blue.marble)/i.test(state.layer+" "+(layer?.file||""))?0:
        state.layer==="tactical"?.34:state.layer==="topographic"?.16:.23});}
    catch(error){console.warn("Globe GPU rendering failed",error);cpuFallback();}
    const ctx=marker.getContext("2d");ctx.clearRect(0,0,w,h);ctx.scale(ratio,ratio);
    drawOrbit(ctx,width,height,solar);
    drawOutline(ctx,width,height);
    state.candidates=[];
    for(const point of state.points){
      if(point.kind && (point.kind!=="ocean"&&point.code!==state.country||!waterFits(point)))continue;
      const p=project(point,width,height);if(!p)continue;
      const selected=point.code===state.country;
      const available=state.available.has(point.code);
      ctx.beginPath();ctx.arc(p.x,p.y,selected?5:available?2.8:1.4,0,Math.PI*2);
      ctx.fillStyle=selected?state.theme.gold:available?state.theme.accent:"#657964";ctx.fill();
      if(selected){ctx.font="12px monospace";ctx.fillStyle=state.theme.accent;ctx.fillText(point.name,p.x+9,p.y-8);}
      state.candidates.push({...point,x:p.x,y:p.y});
    }
    ctx.setTransform(1,0,0,1,0,0);
    const callout=$("[data-wfb-globe-callout]");
    const anchor=state.candidates.find(point=>point.code===state.country);
    callout.hidden=!state.country;
    if(state.country){
      const halfCard=Math.min(width/2,Math.max(70,callout.offsetWidth/2));
      const minY=Math.min(height-14,callout.offsetHeight+25);
      const x=anchor?.x??width-halfCard-16;
      const y=anchor?.y??minY;
      callout.style.left=`${Math.max(halfCard+8,Math.min(width-halfCard-8,x))}px`;
      callout.style.top=`${Math.max(minY,Math.min(height-14,y))}px`;
    }
  }
  const getJSON=async path=>{
    const response=await fetch(new URL(path,root));
    if(!response.ok)throw Error(`HTTP ${response.status} loading ${path}`);
    return response.json();
  };
  function status(text){$("[data-wfb-country-status]").textContent=text;}
  function choose(code){
    state.country=code;
    const select=$("[data-wfb-globe-country]");
    if(code&&!Array.from(select.options).some(option=>option.value===code)){
      const option=document.createElement("option");option.value=code;
      option.textContent=`${state.waterFeatures.get(code)?.name||code} · water`;select.append(option);
    }
    select.value=code;
    const point=state.points.find(x=>x.code===code);
    if(point&&Number.isFinite(point.lon))state.yaw=point.lon*RAD;
    loadSelectedShape(true);draw();loadProfile();
  }
  let request=0;
  function callout(rows,statusLabel){
    const box=$("[data-wfb-globe-callout]");box.replaceChildren();
    const point=state.points.find(item=>item.code===state.country);
    if(!point){box.hidden=true;return;}
    const title=document.createElement("strong");title.textContent=`${point.name} · ${state.year}`;
    const subtitle=document.createElement("small");subtitle.textContent=statusLabel;
    box.append(title,subtitle);
    for(const [label,value] of rows){
      const summary=String(value).split(/\n/).find(part=>part.trim())?.replace(/^(?:name|total):\s*/i,"").trim()||"";
      const line=document.createElement("small");line.textContent=`${label}: ${summary.slice(0,140)}`;box.append(line);
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
        panel.append(Object.assign(document.createElement("p"),{className:"wfb-country-notice",
          textContent:"No location record has been supplied for this edition. Other archived web features may still be available below."}));
      }
      return;
    }
    if(current!==request)return;
    if(!edition.chunks || edition.status==="missing"){
      status(`${year}: edition source missing. No country record is available.`);
      callout([],"Edition source missing");return;
    }
    // Legacy category files were assigned by weak headings. Some 2025-labelled
    // files are explicitly titled 2014 and even the US Introduction contains
    // the edition preface and other territories. Do not turn those raw chunks
    // into a country profile, regardless of their entity_code tag.
    const note=document.createElement("p");note.className="wfb-country-notice";
    note.textContent=`No reviewed ${year} ${state.points.find(point=>point.code===code)?.name||code} country profile has been installed. ${edition.chunks||0} archival excerpts remain edition-wide source material pending edition-year and location review.`;
    panel.append(note);
    const link=document.createElement("a");
    link.href=new URL(`api/editions/${year}/index.json`,root).href;
    link.textContent=`Inspect ${year} source inventory and provenance ↗`;
    link.target="_blank";link.rel="noopener noreferrer";
    panel.append(link);
    status(`${year} · country profile pending attribution review · ${edition.chunks||0} edition-wide source excerpts indexed`);
    callout([],"Country profile pending source review");
  }
  async function loadWebFeatures(panel,code,year,current){
    try{
      const manifest=await getJSON(`api/web-archive/years/${year}/index.json`);
      if(current!==request)return;
      const selected=[...(manifest.countries?.[code]||[]),...(manifest.common||[])];
      const parts=await Promise.all(selected.map(item=>getJSON(`api/${item.path}`)));
      if(current!==request)return;
      feed.web(panel,parts.flatMap(part=>part.records||[]),root,code,
        state.points.find(point=>point.code===code)?.name||code,year);
    }catch(error){/* No web captures are installed for this year. */}
  }
  async function loadLeadership(panel,code,year,current){
    try{
      const manifest=await getJSON(`api/leaders/countries/${code}/${year}/index.json`);
      const parts=await Promise.all((manifest.parts||[]).map(path=>getJSON(path)));
      if(current!==request)return;
      feed.leaders(panel,parts.flatMap(part=>part.terms||[]),year);
    }catch(error){/* No sourced leadership terms are installed for this country/year. */}
  }
  async function loadHTMLProfile(panel,record,code,year,current){
    const data=await getJSON(record.path);
    if(current!==request)return;
    if(data.country!==code||Number(data.year)!==year)throw Error("HTML edition identity mismatch");
    const fields=(data.fields||[]).filter(row=>row.country===code&&Number(row.edition_year)===year);
    const visuals=data.media||[];
    const source=`${data.source.name} · ${data.source.member} · SHA-256 ${data.source.sha256.slice(0,16)}…`;
    feed.begin(panel,{name:data.name,code,year,status:data.status,source,kind:"SOURCE EDITION PROFILE"});
    feed.fields(panel,fields,"",visuals,root);
    const extract=matcher=>fields.find(row=>matcher.test(row.label||""))?.content;
    callout([["Capital",extract(/^capital$/i)],["Population",extract(/^population$/i)],
      ["GDP",extract(/^gdp(?:\s|$|\s*-)/i)]].filter(pair=>pair[1]),
      `${fields.length} fields · ${year} HTML edition`);
    status(`${year} · ${data.name} · ${fields.length} sourced fields · ${visuals.length} edition images · field review pending`);
    if(code==="IN")await loadIndiaTrade(panel,year,current);
    if(current===request)await loadWebFeatures(panel,code,year,current);
    if(current===request)await loadLeadership(panel,code,year,current);
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
    const selected=state.catalogue?.countries?.find(row=>row.code===code);
    $("[data-wfb-country-heading]").textContent=selected?.name||state.points.find(x=>x.code===code)?.name||"Select a location";
    if(!code){status("Choose a place to view an edition.");return;}
    const edition=state.catalogue?.years?.find(row=>row.year===year);
    const entry=selected?.years?.find(row=>row.year===year);
    const water=state.waterFeatures.get(code);
    const htmlProfile=state.verifiedHTML?.countries?.[code]?.find(row=>Number(row.year)===year);
    feed.begin(panel,{name:$("[data-wfb-country-heading]").textContent,code,year,
      status:edition?.status||"unreviewed",kind:water&&!entry&&!htmlProfile?"WATER REFERENCE":entry||htmlProfile?"BOOK PROFILE":"ARCHIVE INDEX"});
    if(htmlProfile&&!entry){
      try{await loadHTMLProfile(panel,htmlProfile,code,year,current);}
      catch(error){if(current===request)status(`HTML edition unavailable: ${error.message}`);}
      return;
    }
    if(water&&!entry){
      const section=document.createElement("section");section.className="wfb-country-section";
      const heading=document.createElement("h4");heading.textContent=`${water.name} · ${water.kind}`;
      const notice=document.createElement("p");notice.className="wfb-country-notice";
      notice.textContent="This selectable water boundary is present-day reference geography. It is not a verified boundary or country profile for the selected Factbook edition.";
      const source=document.createElement("a");source.textContent="View geographic source ↗";
      source.href=water.source_url;source.target="_blank";source.rel="noopener noreferrer";
      section.append(heading,notice,source);panel.append(section);
      status(`${water.name} · ${water.kind} · present-day reference · ${year} edition profile pending`);
      callout([],`${water.kind} · present-day reference`);
      return;
    }
    if(!entry){
      await loadLegacyProfile(panel,code,year,current);
      if(current!==request)return;
      if(code==="IN")await loadIndiaTrade(panel,year,current);
      if(current===request)await loadWebFeatures(panel,code,year,current);
      if(current===request)await loadLeadership(panel,code,year,current);
      return;
    }
    status(`${year} · ${edition?.status||"partial"} · loading sourced fields…`);
    try{
      const index=await getJSON(entry.path);
      const [parts,mediaParts]=await Promise.all([
        Promise.all(index.parts.map(part=>getJSON(part.path))),
        Promise.all((index.media_parts||[]).map(part=>getJSON(part.path)))
      ]);
      if(current!==request)return;
      const visuals=[...(index.media||[]),...mediaParts.flatMap(part=>part.media||[])];
      status(`${year} · ${edition?.status||"partial"} · ${index.fields} fields · ${visuals.length} media · ${index.source.name}`);
        const allFields=parts.flatMap(part=>part.fields||[]).filter(field=>
          (!field.country||field.country===code) &&
          (!field.edition_year||Number(field.edition_year)===year));
      const extract=(matcher)=>allFields.find(field=>matcher.test(field.label||""))?.content;
      callout([["Capital",extract(/^capital$/i)],["Population",extract(/^population$/i)],
        ["GDP",extract(/^gdp(?:\s|$|\s*-)/i)]].filter(pair=>pair[1]),
        `${edition?.status||"partial"} · ${index.fields} sourced fields`);
      feed.begin(panel,{name:index.name||$("[data-wfb-country-heading]").textContent,code,year,
        status:edition?.status||"partial",source:`${index.source?.name||"edition source"} · ${index.source?.format||"document"}`,
        kind:"BOOK PROFILE"});
      feed.fields(panel,allFields,index.source?.url||"",visuals,root);
      if(code==="IN")await loadIndiaTrade(panel,year,current);
      if(current===request)await loadWebFeatures(panel,code,year,current);
      if(current===request)await loadLeadership(panel,code,year,current);
    }catch(error){if(current===request)status(`Source data unavailable: ${error.message}`);}
  }
  function setYear(year){
    state.year=Number(year);$("[data-wfb-globe-year]").textContent=year;
    $("[data-wfb-globe-slider]").value=year;
    state.available=new Set([...(state.catalogue?.countries||[])
      .filter(row=>row.years?.some(entry=>entry.year===state.year)).map(row=>row.code),
      ...Object.entries(state.verifiedHTML?.countries||{})
        .filter(([,rows])=>rows.some(row=>Number(row.year)===state.year)).map(([code])=>code)]);
    boundaryStatus(`Boundaries: loading geometry for ${year}…`);
    loadBoundaries(state.year);
    draw();
    loadProfile();
  }
  function connect(canvas){
    let down=null;
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
        const unit=near||regionAt(x,y,bounds.width,bounds.height);
        canvas.title=unit?`${unit.label||unit.name} · click to read ${state.year}`:"Drag to rotate Earth";
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
    canvas.addEventListener("pointerup",event=>{
      if(!down)return;
      if(!down.moved&&down.button===0){
        const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
        const position=geoAt(x,y,rect.width,rect.height);
        const water=waterAt(position);
        const near=state.candidates.map(p=>({...p,d:Math.hypot(x-p.x,y-p.y)})).sort((a,b)=>a.d-b.d)[0];
        if(water&&water.kind!=="ocean")choose(water.code);
        else if(near&&near.d<14)choose(near.code);
        else{const region=water||featureAt(state.lookup,position);
          if(region)choose(region.code);}
      }
      down=null;
      state.dragging=false;
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
      const turns=(1-state.axis)*custom-state.axis*state.rate/SIDEREAL_DAY;
      state.simulatedMs+=dt*state.direction*state.rate*((1-state.axis)*86400/state.rotationSeconds+state.axis)*1000;
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
    try{state.catalogue=await getJSON("api/country-archive/index.json");
      if(state.catalogue.country_parts?.length){
        const parts=await Promise.all(state.catalogue.country_parts.map(part=>getJSON(part.path)));
        state.catalogue.countries.push(...parts.flatMap(part=>part.countries||[]));
      }
    }
    catch(error){status("Country archive pending; provisional year/category excerpts will load when available.");}
    try{state.verifiedHTML=await getJSON("api/verified-html/index.json");}
    catch(error){state.verifiedHTML=null;}
    try{state.portal=await getJSON("api/portal-index.json");}catch(error){state.portal=null;}
    state.available=new Set([...(state.catalogue?.countries||[]).map(row=>row.code),
      ...Object.keys(state.verifiedHTML?.countries||{})]);
    try{state.points=(await getJSON("country-points.json")).points;}
    catch(error){status("Place coordinates unavailable; use the location selector.");}
    for(const [code,rows] of Object.entries(state.verifiedHTML?.countries||{})){
      if(state.points.some(point=>point.code===code))continue;
      const entry=rows.find(row=>Number.isFinite(row.lat)&&Number.isFinite(row.lon))||rows[0];
      state.points.push({code,name:entry.name,lat:entry.lat,lon:entry.lon});
    }
    try{
      const index=await getJSON("boundaries/water/index.json");
      if(index.schema!=="zzx-water-click-index-v1")throw Error("Unknown water index schema");
      const waterParts=await Promise.all((index.feature_parts||[]).map(name=>
        getJSON(`boundaries/water/${name}`)));
      const waterRows=[...(index.features||[]),...waterParts.flatMap(part=>part.features||[])];
      const source=await loadImage(new URL(`boundaries/water/${index.lookup}`,root).href);
      const c=document.createElement("canvas");c.width=source.naturalWidth;c.height=source.naturalHeight;
      const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(source,0,0);
      const features=new Map(waterRows.map(row=>[row.id,row]));
      state.waterLookup={width:c.width,height:c.height,bytes:ctx.getImageData(0,0,c.width,c.height).data,features};
      state.waterFeatures=new Map(waterRows.map(row=>[row.code,row]));
      for(const row of waterRows){
        if(!state.points.some(point=>point.code===row.code))state.points.push(row);
      }
    }catch(error){console.info("Water boundary pack is not installed; country geometry remains available");}
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
    for(const point of state.points.filter(item=>!item.kind||item.kind==="ocean")
              .slice().sort((a,b)=>a.name.localeCompare(b.name))){
      const option=document.createElement("option");option.value=point.code;
      option.textContent=`${point.name} [${point.code}]`;select.append(option);
    }
    const years=state.catalogue?.years?.filter(row=>row.fields>0)||[];
    if(years.length)state.year=years[years.length-1].year;
    else if(state.verifiedHTML?.editions?.length)
      state.year=Math.max(...state.verifiedHTML.editions.map(row=>Number(row.edition_year)));
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
    bindKnob('[data-wfb-knob="tilt"]',()=>state.axialTilt,value=>setOrbitControl("tilt",value),.2);
    bindKnob('[data-wfb-knob="sync"]',()=>state.solarSync,value=>setOrbitControl("sync",value),1);
    bindKnob('[data-wfb-knob="season"]',()=>state.seasonDay,value=>setOrbitControl("season",value),2);
    bindKnob('[data-wfb-knob="moon-speed"]',()=>state.moonOrbitSpeed,value=>setBodySpeed("moon",value),.06);
    bindKnob('[data-wfb-knob="sun-speed"]',()=>state.sunOrbitSpeed,value=>setBodySpeed("sun",value),.06);
    setZoom(1);setAxis(0);
    setOrbitControl("tilt",23.44);setOrbitControl("sync",100);setOrbitControl("season",172);
    setBodySpeed("moon",1);setBodySpeed("sun",1);
    for(const body of ("sun","moon")){
      const toggle=$(`[data-wfb-toggle="${body}"]`);
      toggle.addEventListener("click",()=>{
        const enabled=body==="sun"?!state.showSun:!state.showMoon;
        if(body==="sun")state.showSun=enabled;else state.showMoon=enabled;
        toggle.setAttribute("aria-checked",String(enabled));
        draw();
      });
    }
    document.querySelectorAll(".wfb-view-switch button[data-wfb-view]").forEach(button=>button.addEventListener("click",()=>{
      state.flat=button.dataset.wfbView==="2d";
      document.querySelectorAll(".wfb-view-switch button[data-wfb-view]").forEach(item=>
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
    choose(state.points.find(x=>x.code==="IN")?.code||state.points[0]?.code||"");
    requestAnimationFrame(frame);
  }
  W.globe=Object.freeze({init,choose,setYear});
})();
