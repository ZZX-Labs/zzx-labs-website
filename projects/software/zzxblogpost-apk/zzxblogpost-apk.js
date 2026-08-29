(()=>{"use strict";const $=id=>document.getElementById(id),STORE="zzx.blogpost.mobile.v1";let drafts=[];
function save(){localStorage.setItem(STORE,JSON.stringify(drafts))}
function load(){try{drafts=JSON.parse(localStorage.getItem(STORE)||"[]");if(!Array.isArray(drafts))drafts=[]}catch{drafts=[]}render()}
$("save").onclick=()=>{const d={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),title:$("title").value.trim(),body:$("body").value,tags:$("tags").value.split(",").map(x=>x.trim()).filter(Boolean),updated:new Date().toISOString()};if(!d.title)return;drafts.unshift(d);save();render()};
function render(){const e=$("drafts");e.replaceChildren();drafts.forEach(d=>{const b=document.createElement("button");b.className="btn ghost";b.style.display="block";b.style.width="100%";b.style.margin=".35rem 0";b.textContent=`${d.title} · ${d.updated}`;b.onclick=()=>{$("title").value=d.title;$("body").value=d.body;$("tags").value=d.tags.join(", ");preview()};e.append(b)});$("count").textContent=drafts.length}
function preview(){$("preview").textContent=$("body").value;$("words").textContent=$("body").value.trim()?$("body").value.trim().split(/\s+/).length:0}
$("body").oninput=preview;
$("export").onclick=()=>{const d={schema:"zzx.blogpost.mobile.v1",title:$("title").value.trim(),bodyMarkdown:$("body").value,tags:$("tags").value.split(",").map(x=>x.trim()).filter(Boolean),exported:new Date().toISOString()};const b=new Blob([JSON.stringify(d,null,2)],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="zzxblogpost-mobile-draft.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
load();preview();window.ZZXBlogPostAPK=Object.freeze({version:"1.0.0-web-companion",apkBundled:false});
})();
