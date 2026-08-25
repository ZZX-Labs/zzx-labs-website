(()=>{"use strict";
const $=id=>document.getElementById(id),BP=BlackPearlCore;
const state={media:[],post:null,site:null,services:[]};

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function bytes(n){return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KiB`:`${(n/1048576).toFixed(2)} MiB`}
function renderMedia(){
 const e=$("media-list");e.replaceChildren();
 state.media.forEach((x,i)=>{
  const row=document.createElement("div");row.className="bp-media-row";
  row.innerHTML=`<div><strong>${esc(x.randomName)}</strong><div class="fx-watermark">${esc(x.type)} · ${bytes(x.bytes)} · ${esc(x.metadataRisk)}</div><div class="fx-watermark">SHA-256 ${x.sha256}</div></div><button class="btn ghost" data-i="${i}">REMOVE</button>`;
  e.append(row);
 });
 e.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{state.media.splice(+b.dataset.i,1);renderMedia();renderKPIs()});
 renderKPIs();
}
function renderKPIs(){
 $("media-count").textContent=state.media.length;
 $("randomized-count").textContent=state.media.filter(x=>x.randomName!==x.name).length;
 $("risk-count").textContent=state.media.filter(x=>/present|possible|unknown|unverified/i.test(x.metadataRisk)).length;
 $("bytes-total").textContent=bytes(state.media.reduce((s,x)=>s+x.bytes,0));
}

$("media-files").onchange=async()=>{
 const fs=[...$("media-files").files];
 $("scan-output").textContent=`Scanning ${fs.length} local file(s)…`;
 for(const f of fs){
   try{state.media.push({...await BP.inspect(f),_file:f})}
   catch(e){state.media.push({name:f.name,randomName:BP.randomName(f.name),type:f.type||"unknown",bytes:f.size,sha256:"ERROR",metadataRisk:e.message,notes:[e.message],_file:f})}
 }
 renderMedia();
 $("scan-output").textContent=JSON.stringify(state.media.map(({_file,...x})=>x),null,2);
 $("media-files").value="";
};

$("sanitize-images").onclick=async()=>{
 const results=[];
 for(const item of state.media){
   if(!item._file||!item.sanitizable)continue;
   try{
     let blob;
     if(item._file.type==="image/jpeg"||/\.(jpg|jpeg)$/i.test(item.name))blob=await BP.stripJPEG(item._file);
     else if(item._file.type==="image/png"||/\.png$/i.test(item.name))blob=await BP.stripPNG(item._file);
     else continue;
     BP.download(blob,item.randomName);
     results.push({file:item.name,sanitized:item.randomName,bytes:blob.size});
   }catch(e){results.push({file:item.name,error:e.message})}
 }
 $("scan-output").textContent=JSON.stringify({downloads:results,note:"JPEG/PNG browser sanitizer strips common metadata structures. Video/audio/PDF/attachments use the native sanitizer included in server/."},null,2);
};

$("build-post").onclick=()=>{
 const adult=$("adult-post").checked,release=$("release-status").value;
 const p={schema:"zzx.blackpearl.post.v1",id:BP.uid(),created:new Date().toISOString(),title:$("post-title").value.trim(),slug:$("post-slug").value.trim(),body:$("post-body").value,tags:$("post-tags").value.split(",").map(x=>x.trim()).filter(Boolean),adultContent:adult,releaseStatus:release,scheduledFor:$("post-schedule").value||null,media:state.media.map(({_file,...x})=>({publishedName:x.randomName,type:x.type,bytes:x.bytes,sha256:x.sha256}))};
 state.post=p;$("post-output").textContent=JSON.stringify(p,null,2);renderPreview();
};
function renderPreview(){
 const p=state.post||{title:"BlackPearl post preview",body:"Compose a post to preview it.",tags:[],adultContent:false,releaseStatus:"not set",media:[]};
 $("preview-title").textContent=p.title||"Untitled";
 $("preview-body").textContent=p.body||"";
 $("preview-meta").textContent=`${p.adultContent?"18+ · ":""}${p.releaseStatus} · ${p.tags.join(" · ")}`;
}

$("save-site").onclick=()=>{
 state.site={schema:"zzx.blackpearl.site.v1",siteName:$("site-name").value.trim(),domain:$("domain").value.trim(),creatorName:$("creator-name").value.trim(),primaryColor:$("primary-color").value,secondaryColor:$("secondary-color").value,ageGate:$("age-gate").checked,robotsNoIndex:$("noindex").checked,comments:$("comments").checked,bitcoinOnlyServices:true};
 $("site-output").textContent=JSON.stringify(state.site,null,2);
};

$("build-package").onclick=()=>{
 const doc={schema:"zzx.blackpearl.creator-package.v1",exported:new Date().toISOString(),site:state.site,post:state.post,media:state.media.map(({_file,...x})=>x),privacy:{publicOriginalFilenames:false,randomizedPublicNames:true,metadataSanitizationRequired:true,malwareScanRequired:true}};
 BP.textDownload(JSON.stringify(doc,null,2),"blackpearl-creator-package.json");
 $("export-output").textContent=JSON.stringify(doc,null,2);
};

$("export-post-html").onclick=()=>{
 if(!state.post){$("build-post").click()}
 const p=state.post;
 const html=`<!doctype html><meta charset="utf-8"><title>${esc(p.title)}</title><article data-adult="${p.adultContent}"><h1>${esc(p.title)}</h1><p>${esc(p.body).replaceAll("\n","<br>")}</p><footer>${p.tags.map(t=>`#${esc(t)}`).join(" ")}</footer></article>`;
 BP.textDownload(html,(p.slug||"post")+".html","text/html");
};

const services=[
 {name:"Custom Websites",scope:"Creator-owned websites, blogs, portfolios, membership/media publishing, privacy-conscious upload pipelines.",payment:"BTC only"},
 {name:"Custom Software",scope:"Desktop/server utilities, publishing workflows, media tooling, creator administration, automation.",payment:"BTC only"},
 {name:"Custom Applications",scope:"Android-only applications and creator companions.",payment:"BTC only"}
];
state.services=services;
const s=$("service-list");services.forEach(x=>{const a=document.createElement("article");a.className="bp-service";a.innerHTML=`<strong>${esc(x.name)}</strong><p>${esc(x.scope)}</p><div class="fx-watermark">${x.payment} · one-time project fee + continuation fees when scope/growth requires them</div>`;s.append(a)});

renderMedia();renderPreview();window.BlackPearl=Object.freeze({version:"0.1.0-alpha-web",getState:()=>JSON.parse(JSON.stringify({...state,media:state.media.map(({_file,...x})=>x)}))});window.ZZXHooks?.emit("blackpearl:ready",{version:"0.1.0-alpha-web"});
})();
