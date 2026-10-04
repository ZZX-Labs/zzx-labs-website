(()=>{"use strict";
const $=id=>document.getElementById(id),O=OwnMapAPKCore;
let track=[],media=[],watch=null,offlineFeatures=[];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function pushPos(pos){
 const c=pos.coords,x={at:new Date(pos.timestamp).toISOString(),lat:c.latitude,lon:c.longitude,accuracy:c.accuracy,altitude:c.altitude,heading:c.heading,speed:c.speed};track.push(x);render()
}
$("gps-on").onclick=()=>{if(!navigator.geolocation){$("gps-output").textContent="Geolocation API unavailable.";return}if(watch!=null)return;watch=navigator.geolocation.watchPosition(pushPos,e=>$("gps-output").textContent=`GPS ERROR: ${e.message}`,{enableHighAccuracy:true,maximumAge:0,timeout:15000});$("gps-state").textContent="WATCHING"};
$("gps-off").onclick=()=>{if(watch!=null){navigator.geolocation.clearWatch(watch);watch=null}$("gps-state").textContent="STOPPED"};
$("gps-once").onclick=()=>{if(!navigator.geolocation)return;navigator.geolocation.getCurrentPosition(pushPos,e=>$("gps-output").textContent=`GPS ERROR: ${e.message}`,{enableHighAccuracy:true,timeout:15000})};
function render(){
 $("points").textContent=track.length;const e=$("track");e.replaceChildren();track.slice().reverse().forEach(x=>{const d=document.createElement("div");d.className="media-card";d.innerHTML=`<strong>${x.lat.toFixed(6)}, ${x.lon.toFixed(6)}</strong><div class="fx-watermark">${x.at} · ±${Math.round(x.accuracy||0)} m</div>`;e.append(d)});draw()
}
function draw(){
 const c=$("map"),x=c.getContext("2d"),w=c.width,h=c.height;x.clearRect(0,0,w,h);x.fillStyle="#060a0a";x.fillRect(0,0,w,h);x.strokeStyle="#1c2b27";for(let i=0;i<=10;i++){x.beginPath();x.moveTo(i*w/10,0);x.lineTo(i*w/10,h);x.stroke();x.beginPath();x.moveTo(0,i*h/10);x.lineTo(w,i*h/10);x.stroke()}
 if(!track.length)return;const lons=track.map(p=>p.lon),lats=track.map(p=>p.lat),minx=Math.min(...lons),maxx=Math.max(...lons),miny=Math.min(...lats),maxy=Math.max(...lats),dx=Math.max(.00001,maxx-minx),dy=Math.max(.00001,maxy-miny);
 x.strokeStyle="#c0d674";x.lineWidth=2;x.beginPath();track.forEach((p,i)=>{const px=30+(p.lon-minx)/dx*(w-60),py=h-30-(p.lat-miny)/dy*(h-60);i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke()
}
$("media").onchange=async()=>{for(const f of [...$("media").files]){media.push({id:Math.random().toString(36).slice(2),name:f.name,type:f.type||"unknown",bytes:f.size,sha256:await O.sha256(f),capturedAt:new Date().toISOString(),trackPoint:track.at(-1)||null})}renderMedia();$("media").value=""};
function renderMedia(){const e=$("media-list");e.replaceChildren();media.forEach(m=>{const d=document.createElement("div");d.className="media-card";d.innerHTML=`<strong>${esc(m.name)}</strong><div class="fx-watermark">${m.type} · ${m.bytes} bytes · ${m.sha256.slice(0,16)}…</div>`;e.append(d)});$("media-count").textContent=media.length}
$("offline-geojson").onchange=async()=>{const f=$("offline-geojson").files[0];if(!f)return;try{const j=JSON.parse(await f.text());offlineFeatures=j.type==="FeatureCollection"?j.features:[];$("cache-output").textContent=JSON.stringify({offlineFeatures:offlineFeatures.length,source:f.name,note:"Browser cache is in-memory for this demo. Native APK stores offline map packages persistently."},null,2)}catch(e){$("cache-output").textContent="IMPORT ERROR: "+e.message}$("offline-geojson").value=""};
$("export-field").onclick=()=>O.download(JSON.stringify({schema:"zzx.ownmap.field-package.v1",exported:new Date().toISOString(),track,media,offlineFeatureCount:offlineFeatures.length,encrypted:false,note:"Reference browser export. Native APK should encrypt/sign sync package."},null,2),"ownmap-field-package.json");
$("export-track").onclick=()=>O.download(JSON.stringify({type:"Feature",geometry:{type:"LineString",coordinates:track.map(p=>[p.lon,p.lat,p.altitude].filter(v=>v!=null))},properties:{generated:new Date().toISOString(),points:track.length}},null,2),"ownmap-track.geojson","application/geo+json");
render();renderMedia();window.OwnMapAPK=Object.freeze({version:"0.1.0-alpha-web",apkIncluded:false});
})();
