(()=>{"use strict";
const $=id=>document.getElementById(id),P=ParallelExplorerCore;
let records=[],hits=[];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function inspect(f){
 const path=f.webkitRelativePath||f.name,ext=(f.name.match(/\.([^.]+)$/)?.[1]||"").toLowerCase(),r={id:Math.random().toString(36).slice(2),name:f.name,path,type:f.type||ext||"unknown",bytes:f.size,lastModified:new Date(f.lastModified).toISOString(),sha256:null,preview:"",schemaKeys:[],parseError:null};
 if($("hash").checked)r.sha256=await P.sha256(f);
 if(f.size<=Math.max(1024,+$("preview-limit").value||262144)){
  if(/^(text\/|application\/json|application\/xml)/.test(f.type)||["json","txt","md","csv","log","xml","yaml","yml"].includes(ext)){
   try{const txt=await f.text();r.preview=txt.slice(0,4000);if(ext==="json"||f.type==="application/json"){const j=JSON.parse(txt);if(j&&typeof j==="object"&&!Array.isArray(j))r.schemaKeys=Object.keys(j).slice(0,64)}}catch(e){r.parseError=e.message}
  }
 }
 return r
}
$("files").onchange=async()=>{
 const fs=[...$("files").files],workers=Math.max(1,Math.min(16,+$("workers").value||4));records=[];$("status").textContent=`Scanning ${fs.length} file(s) with ${workers} async worker(s)…`;
 let idx=0;async function worker(){while(true){const i=idx++;if(i>=fs.length)return;try{records[i]=await inspect(fs[i])}catch(e){records[i]={name:fs[i].name,path:fs[i].webkitRelativePath||fs[i].name,error:e.message}}}}
 await Promise.all(Array.from({length:Math.min(workers,fs.length)},worker));records=records.filter(Boolean);renderStats();runSearch();$("status").textContent=`Indexed ${records.length} file(s).`;$("files").value=""
};
function renderStats(){
 $("count").textContent=records.length;$("bytes").textContent=records.reduce((s,r)=>s+(r.bytes||0),0).toLocaleString();$("hashed").textContent=records.filter(r=>r.sha256).length;$("schemas").textContent=records.filter(r=>r.schemaKeys?.length).length
}
function runSearch(){
 const q=$("query").value,threshold=Math.max(0,Math.min(1,+$("threshold").value||0));
 hits=records.map(r=>({...r,score:P.score(r,q)})).filter(r=>r.score>=threshold).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path));
 const e=$("hits");e.replaceChildren();hits.slice(0,500).forEach(r=>{const d=document.createElement("div");d.className="pe-hit";d.innerHTML=`<strong>${esc(r.path)}</strong> <span class="pe-score">${(r.score*100).toFixed(0)}%</span><div class="fx-watermark">${esc(r.type)} · ${r.bytes||0} bytes · ${r.sha256?r.sha256.slice(0,16)+"…":"not hashed"}</div><pre class="fx-code">${esc((r.preview||"").slice(0,600))}</pre>`;e.append(d)});$("hits-count").textContent=hits.length
}
$("query").oninput=runSearch;$("threshold").oninput=runSearch;
$("duplicates").onclick=()=>{const groups={};for(const r of records){if(!r.sha256)continue;(groups[r.sha256]??=[]).push(r.path)}$("dup-output").textContent=JSON.stringify(Object.entries(groups).filter(([,v])=>v.length>1).map(([sha256,paths])=>({sha256,paths})),null,2)};
$("export").onclick=()=>P.download(JSON.stringify({schema:"zzx.parallel-explorer.index.v1",generated:new Date().toISOString(),records,hits:hits.map(r=>({path:r.path,score:r.score}))},null,2),"parallel-explorer-index.json");
renderStats();runSearch();window.ParallelExplorer=Object.freeze({version:"0.3.0-alpha-web",remoteScan:false});
})();
