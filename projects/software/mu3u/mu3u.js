(()=>{"use strict";
const $=id=>document.getElementById(id);
let entries=[],header=["#EXTM3U"];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function parseAttrs(s){
 const out={};const re=/([A-Za-z0-9_-]+)="([^"]*)"|([A-Za-z0-9_-]+)=([^\s,]+)/g;let m;
 while((m=re.exec(s))) out[m[1]||m[3]]=m[2]??m[4];
 return out
}
function parse(text){
 entries=[];const lines=text.split(/\r?\n/);let pending={duration:-1,title:"",attrs:{}};
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();if(!line)continue;
  if(line.startsWith("#EXTM3U")){header=[line];continue}
  if(line.startsWith("#EXTINF:")){
   const body=line.slice(8),comma=body.indexOf(","),left=comma>=0?body.slice(0,comma):body,title=comma>=0?body.slice(comma+1).trim():"";
   const firstSpace=left.indexOf(" "),duration=parseFloat(firstSpace>=0?left.slice(0,firstSpace):left);
   pending={duration:Number.isFinite(duration)?duration:-1,title,attrs:parseAttrs(firstSpace>=0?left.slice(firstSpace+1):"")};continue
  }
  if(line.startsWith("#"))continue;
  entries.push({id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),url:line,duration:pending.duration,title:pending.title||line,attrs:{...pending.attrs},test:null});
  pending={duration:-1,title:"",attrs:{}}
 }
 render()
}
function validUrl(u){try{const x=new URL(u,location.href);return["http:","https:","file:","blob:"].includes(x.protocol)}catch{return false}}
function render(){
 const tb=$("body");tb.replaceChildren();
 entries.forEach((e,i)=>{
  const v=validUrl(e.url),tr=document.createElement("tr");
  tr.innerHTML=`<td>${i+1}</td><td>${esc(e.title)}</td><td>${esc(e.url)}</td><td>${e.duration}</td><td>${Object.entries(e.attrs).map(([k,v])=>`${esc(k)}=${esc(v)}`).join(" · ")||"—"}</td><td class="${v?"mu-valid":"mu-bad"}">${v?"valid URL":"invalid"}</td><td><button class="btn ghost" data-edit="${i}">EDIT</button></td>`;
  tb.append(tr)
 });
 tb.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>edit(+b.dataset.edit));
 $("count").textContent=entries.length;$("valid").textContent=entries.filter(e=>validUrl(e.url)).length;$("groups").textContent=new Set(entries.map(e=>e.attrs["group-title"]).filter(Boolean)).size;$("dupes").textContent=entries.length-new Set(entries.map(e=>e.url)).size
}
function edit(i){const e=entries[i];$("edit-index").value=i;$("title").value=e.title;$("url").value=e.url;$("duration").value=e.duration;$("group").value=e.attrs["group-title"]||"";$("tvgid").value=e.attrs["tvg-id"]||"";document.querySelector('[data-mode="editor"]').click()}
$("save").onclick=()=>{
 const i=+$("edit-index").value,e={id:entries[i]?.id||Math.random().toString(36).slice(2),title:$("title").value.trim(),url:$("url").value.trim(),duration:+$("duration").value||-1,attrs:{}};
 if($("group").value.trim())e.attrs["group-title"]=$("group").value.trim();if($("tvgid").value.trim())e.attrs["tvg-id"]=$("tvgid").value.trim();
 if(Number.isInteger(i)&&i>=0&&entries[i])entries[i]=e;else entries.push(e);$("edit-index").value="-1";render()
};
$("new-entry").onclick=()=>{$("edit-index").value="-1";$("title").value="";$("url").value="";$("duration").value="-1";$("group").value="";$("tvgid").value=""};
$("playlist-file").onchange=async()=>{const f=$("playlist-file").files[0];if(f)parse(await f.text());$("playlist-file").value=""};
$("parse-text").onclick=()=>parse($("playlist-text").value);
$("dedupe").onclick=()=>{const seen=new Set();entries=entries.filter(e=>!seen.has(e.url)&&seen.add(e.url));render()};
$("validate").onclick=()=>{
 const issues=[];entries.forEach((e,i)=>{if(!validUrl(e.url))issues.push({row:i+1,type:"invalid-url",url:e.url});if(!e.title)issues.push({row:i+1,type:"missing-title"});if(e.duration<-1)issues.push({row:i+1,type:"invalid-duration"})});
 $("validation-output").textContent=JSON.stringify({entries:entries.length,issues,valid:!issues.length},null,2)
};
$("test-stream").onclick=async()=>{
 const i=+$("test-index").value;if(!entries[i]){$("test-output").textContent="Select a valid entry index.";return}
 const e=entries[i],ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),5000),start=performance.now();
 try{
   const r=await fetch(e.url,{method:"GET",headers:{Range:"bytes=0-0"},signal:ctrl.signal,cache:"no-store"});
   e.test={ok:r.ok,status:r.status,contentType:r.headers.get("content-type"),ms:Math.round(performance.now()-start),cors:true};
 }catch(err){e.test={ok:false,error:err.name==="AbortError"?"timeout":err.message,note:"Browser CORS/network policy may block a reachable stream."}}
 clearTimeout(t);$("test-output").textContent=JSON.stringify(e.test,null,2)
};
function serialize(){
 const lines=["#EXTM3U"];for(const e of entries){const attrs=Object.entries(e.attrs).map(([k,v])=>`${k}="${String(v).replaceAll('"',"")}"`).join(" ");lines.push(`#EXTINF:${Number.isFinite(e.duration)?e.duration:-1}${attrs?" "+attrs:""},${e.title||""}`);lines.push(e.url)}return lines.join("\n")+"\n"
}
$("export-m3u").onclick=()=>{const b=new Blob([serialize()],{type:"audio/x-mpegurl"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="playlist.m3u";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("export-json").onclick=()=>{const b=new Blob([JSON.stringify({schema:"zzx.mu3u.playlist.v1",entries},null,2)],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="mu3u-playlist.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
parse(`#EXTM3U\n#EXTINF:-1 group-title="Demo" tvg-id="station1",Example Stream\nhttps://example.invalid/live.m3u8`);
window.mu3u=Object.freeze({version:"0.1.0-web",serialize});
})();
