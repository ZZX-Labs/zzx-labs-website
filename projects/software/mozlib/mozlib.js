(()=>{"use strict";
const $=id=>document.getElementById(id);
let tracks=[],current=-1,audioCtx=null,source=null,analyser=null,raf=null,playlist=[];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function parseName(name){const base=name.replace(/\.[^.]+$/,""),m=base.match(/^\s*(.*?)\s*-\s*(.*?)\s*$/);return m?{artist:m[1],title:m[2]}:{artist:"Unknown",title:base}}
$("files").onchange=async()=>{
 const fs=[...$("files").files];
 for(const f of fs){const meta=parseName(f.name),u=URL.createObjectURL(f);tracks.push({id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),file:f,url:u,name:f.name,type:f.type,bytes:f.size,artist:meta.artist,title:meta.title,album:"",tags:[],duration:null})}
 render();$("files").value=""
};
function render(){
 const e=$("track-list");e.replaceChildren();
 tracks.forEach((t,i)=>{const d=document.createElement("div");d.className="moz-track"+(i===current?" active":"");d.innerHTML=`<button class="btn ghost" data-play="${i}">PLAY</button><div><strong>${esc(t.title)}</strong><div class="fx-watermark">${esc(t.artist)} · ${esc(t.album||"no album")} · ${t.duration?t.duration.toFixed(1)+" s":"duration pending"} · ${(t.tags||[]).map(x=>"#"+esc(x)).join(" ")}</div></div><button class="btn ghost" data-edit="${i}">EDIT</button>`;e.append(d)});
 e.querySelectorAll("[data-play]").forEach(b=>b.onclick=()=>play(+b.dataset.play));
 e.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>edit(+b.dataset.edit));
 $("count").textContent=tracks.length;$("bytes").textContent=(tracks.reduce((s,t)=>s+t.bytes,0)/1048576).toFixed(2)+" MiB";$("playlist-count").textContent=playlist.length;$("tag-count").textContent=new Set(tracks.flatMap(t=>t.tags)).size
}
async function play(i){
 current=i;const t=tracks[i],a=$("player");a.src=t.url;await a.play().catch(()=>{});$("now-title").textContent=t.title;$("now-meta").textContent=`${t.artist} · ${t.album||"no album"}`;render();
 a.onloadedmetadata=()=>{t.duration=a.duration;render()};
 setupAudio();drawWave()
}
function setupAudio(){
 if(audioCtx||!window.AudioContext)return;
 audioCtx=new AudioContext();analyser=audioCtx.createAnalyser();analyser.fftSize=2048;source=audioCtx.createMediaElementSource($("player"));source.connect(analyser);analyser.connect(audioCtx.destination)
}
function drawWave(){
 if(!analyser)return;cancelAnimationFrame(raf);const c=$("wave"),x=c.getContext("2d"),buf=new Uint8Array(analyser.fftSize);
 const tick=()=>{analyser.getByteTimeDomainData(buf);x.clearRect(0,0,c.width,c.height);x.strokeStyle="#c0d674";x.lineWidth=2;x.beginPath();for(let i=0;i<buf.length;i++){const px=i/(buf.length-1)*c.width,py=(buf[i]/255)*c.height;i?x.lineTo(px,py):x.moveTo(px,py)}x.stroke();raf=requestAnimationFrame(tick)};tick()
}
function edit(i){current=i;const t=tracks[i];$("edit-index").value=i;$("edit-title").value=t.title;$("edit-artist").value=t.artist;$("edit-album").value=t.album;$("edit-tags").value=t.tags.join(", ");document.querySelector('[data-mode="metadata"]').click()}
$("save-meta").onclick=()=>{const i=+$("edit-index").value;if(!tracks[i])return;Object.assign(tracks[i],{title:$("edit-title").value.trim(),artist:$("edit-artist").value.trim(),album:$("edit-album").value.trim(),tags:[...new Set($("edit-tags").value.split(",").map(x=>x.trim().toLowerCase()).filter(Boolean))]});render()};
$("add-playlist").onclick=()=>{if(current<0)return;if(!playlist.includes(current))playlist.push(current);render();renderPlaylist()};
function renderPlaylist(){const e=$("playlist");e.replaceChildren();playlist.forEach((idx,pos)=>{const t=tracks[idx],d=document.createElement("div");d.className="moz-track";d.innerHTML=`<span>${pos+1}</span><div><strong>${esc(t.title)}</strong><div class="fx-watermark">${esc(t.artist)}</div></div><button class="btn ghost" data-rm="${pos}">REMOVE</button>`;e.append(d)});e.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{playlist.splice(+b.dataset.rm,1);render();renderPlaylist()})}
$("export-m3u").onclick=()=>{const lines=["#EXTM3U",...playlist.flatMap(idx=>{const t=tracks[idx];return[`#EXTINF:${Math.round(t.duration||-1)},${t.artist} - ${t.title}`,t.name]})].join("\n"),b=new Blob([lines],{type:"audio/x-mpegurl"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="mozlib-playlist.m3u";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("export-json").onclick=()=>{const doc={schema:"zzx.mozlib.library.v1",generated:new Date().toISOString(),tracks:tracks.map(({file,url,...t})=>t),playlist:playlist.map(i=>tracks[i]?.id).filter(Boolean)},t=JSON.stringify(doc,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="mozlib-library.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800);$("export-output").textContent=t};
render();renderPlaylist();window.MozLib=Object.freeze({version:"0.1.0-alpha-web"});
})();
