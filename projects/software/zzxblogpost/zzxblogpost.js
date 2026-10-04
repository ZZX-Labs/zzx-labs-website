(()=>{"use strict";const $=id=>document.getElementById(id);let attachments=[],release=null;
const enc=new TextEncoder(),hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function md(s){
 let h=esc(s);
 h=h.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>");
 h=h.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
 h=h.split(/\n{2,}/).map(x=>/^<h[1-3]>/.test(x)?x:`<p>${x.replace(/\n/g,"<br>")}</p>`).join("\n");
 return h
}
function render(){
 $("preview").innerHTML=md($("body").value);
 const words=$("body").value.trim()?$("body").value.trim().split(/\s+/).length:0;
 $("words").textContent=words;$("chars").textContent=$("body").value.length;$("attach-count").textContent=attachments.length;
}
$("body").oninput=render;
$("attachments").onchange=async()=>{attachments=[];for(const f of [...$("attachments").files]){const d=new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer()));attachments.push({name:f.name,size:f.size,type:f.type||"application/octet-stream",sha256:hex(d)})}$("attachments").value="";render();renderAttachments()};
function renderAttachments(){const e=$("attach-list");e.replaceChildren();attachments.forEach(a=>{const d=document.createElement("div");d.className="release-row";d.innerHTML=`<strong>${a.name}</strong> · ${a.size} bytes<div class="fx-watermark">${a.type} · SHA-256 ${a.sha256}</div>`;e.append(d)})}
async function build(){
 const post={schema:"zzx.blogpost.v1",title:$("title").value.trim(),slug:$("slug").value.trim(),author:$("author").value.trim(),date:$("date").value,tags:$("tags").value.split(",").map(x=>x.trim()).filter(Boolean),status:$("status").value,summary:$("summary").value.trim(),bodyMarkdown:$("body").value,attachments};
 const canonical=JSON.stringify(post,Object.keys(post).sort()),digest=hex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(canonical))));
 release={schema:"zzx.blogpost.release.v1",post,build:{contentSha256:digest,reproducible:true,networkRequired:false,generated:new Date().toISOString()},publishing:{automatic:false,controlledRelease:true}};
 $("release").textContent=JSON.stringify(release,null,2);$("digest").textContent=digest
}
$("build").onclick=build;
function dl(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("json").onclick=async()=>{if(!release)await build();dl(JSON.stringify(release,null,2),($("slug").value||"post")+".release.json","application/json")};
$("md").onclick=()=>{const fm=`---\ntitle: "${$("title").value.replace(/"/g,'\\"')}"\nslug: "${$("slug").value}"\nauthor: "${$("author").value}"\ndate: "${$("date").value}"\nstatus: "${$("status").value}"\ntags: [${$("tags").value.split(",").map(x=>`"${x.trim()}"`).join(", ")}]\n---\n\n`;dl(fm+$("body").value,($("slug").value||"post")+".md","text/markdown")};
$("html").onclick=()=>dl(`<!doctype html><meta charset="utf-8"><title>${esc($("title").value)}</title><article>${md($("body").value)}</article>`,($("slug").value||"post")+".html","text/html");
$("title").value="ZZX-Labs Research Note";$("slug").value="zzx-labs-research-note";$("date").value=new Date().toISOString().slice(0,10);$("body").value="# ZZX-Labs Research Note\n\nOffline-first technical publishing draft.\n\n## Findings\n\nReproducible builds and controlled release.";render();window.ZZXBlogPost=Object.freeze({version:"1.0.0-web",automaticPublish:false});
})();
