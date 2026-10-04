(()=>{"use strict";const $=id=>document.getElementById(id);let chapters=[];
const uid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function md(s){let h=esc(s);h=h.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/`([^`]+)`/g,"<code>$1</code>");return h.split(/\n{2,}/).map(x=>/^<h/.test(x)?x:`<p>${x.replace(/\n/g,"<br>")}</p>`).join("\n")}
function add(){const c={id:uid(),title:$("chapter-title").value.trim()||`Chapter ${chapters.length+1}`,body:$("chapter-body").value,kind:$("chapter-kind").value};chapters.push(c);render()}
$("add").onclick=add;
function render(){const e=$("chapters");e.replaceChildren();chapters.forEach((c,i)=>{const d=document.createElement("div");d.className="chapter";d.innerHTML=`<strong>${i+1}. ${c.title}</strong> · ${c.kind}<div>${c.body.trim().split(/\s+/).filter(Boolean).length} words</div><button class="btn ghost" data-up="${c.id}">↑</button> <button class="btn ghost" data-down="${c.id}">↓</button> <button class="btn ghost" data-edit="${c.id}">EDIT</button> <button class="btn ghost" data-del="${c.id}">DELETE</button>`;e.append(d)});e.querySelectorAll("[data-up]").forEach(b=>b.onclick=()=>move(b.dataset.up,-1));e.querySelectorAll("[data-down]").forEach(b=>b.onclick=()=>move(b.dataset.down,1));e.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{chapters=chapters.filter(x=>x.id!==b.dataset.del);render()});e.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{const c=chapters.find(x=>x.id===b.dataset.edit);$("chapter-title").value=c.title;$("chapter-body").value=c.body;$("chapter-kind").value=c.kind});$("count").textContent=chapters.length;$("words").textContent=chapters.reduce((s,c)=>s+c.body.trim().split(/\s+/).filter(Boolean).length,0);preview()}
function move(id,d){const i=chapters.findIndex(x=>x.id===id),j=i+d;if(i<0||j<0||j>=chapters.length)return;[chapters[i],chapters[j]]=[chapters[j],chapters[i]];render()}
function front(){return{title:$("book-title").value.trim()||"Untitled",subtitle:$("subtitle").value.trim(),author:$("author").value.trim(),version:$("version").value.trim(),license:$("book-license").value.trim(),language:$("language").value}}
function markdown(){const f=front();return`# ${f.title}\n\n${f.subtitle?`## ${f.subtitle}\n\n`:""}**Author:** ${f.author}\n\n**Version:** ${f.version}\n\n**License:** ${f.license}\n\n---\n\n`+chapters.map((c,i)=>`# ${i+1}. ${c.title}\n\n${c.body}`).join("\n\n---\n\n")}
function preview(){$("preview").innerHTML=md(markdown())}
["book-title","subtitle","author","version","book-license"].forEach(id=>$(id).oninput=preview);
function latexEscape(s){return String(s).replace(/\\/g,"\\textbackslash{}").replace(/([#$%&_{}])/g,"\\$1").replace(/\^/g,"\\^{}").replace(/~/g,"\\~{}")}
function latex(){const f=front();return`\\documentclass[11pt]{{book}}
\\usepackage[utf8]{{inputenc}}
\\usepackage{{hyperref}}
\\title{{${latexEscape(f.title)}}}
\\author{{${latexEscape(f.author)}}}
\\begin{{document}}
\\maketitle
\\tableofcontents
${chapters.map((c)=>`\\chapter{{${latexEscape(c.title)}}}\n${latexEscape(c.body)}`).join("\n\n")}
\\end{{document}}
`}
function dl(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("md-export").onclick=()=>dl(markdown(),"book.md","text/markdown");
$("tex-export").onclick=()=>dl(latex(),"book.tex","text/x-tex");
$("html-export").onclick=()=>{const f=front();dl(`<!doctype html><meta charset="utf-8"><title>${esc(f.title)}</title><article>${md(markdown())}</article>`,"book.html","text/html")};
$("json-export").onclick=()=>dl(JSON.stringify({schema:"zzx.lossbb.book.v1",metadata:front(),chapters,exported:new Date().toISOString()},null,2),"book.json","application/json");
$("chapter-title").value="Introduction";$("chapter-body").value="## Purpose\n\nThis chapter introduces the book structure and reproducible publishing workflow.";add();window.ZZXLOSSBB=Object.freeze({version:"0.1.0-alpha-web"});
})();
