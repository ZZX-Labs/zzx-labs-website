(() => {
  "use strict";
  const $=id=>document.getElementById(id),state={items:[],notes:JSON.parse(localStorage.getItem("zzx-tully-notes")||"null")};
  function bytes(n){if(n>=1e9)return`${(n/1e9).toFixed(2)} GB`;if(n>=1e6)return`${(n/1e6).toFixed(2)} MB`;if(n>=1e3)return`${(n/1e3).toFixed(2)} KB`;return`${n} B`;}
  function dl(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  async function ingest(list){
    for(const f of [...list]){const path=f.webkitRelativePath||f.name,cls=TullyCore.classify(path),sha=await TullyCore.sha256(f);state.items.push({path,name:f.name,size:f.size,lastModified:f.lastModified,classification:cls.kind,priority:cls.priority,sha256:sha});}
    render();
  }
  function render(){
    $("tu-count").textContent=state.items.length;$("tu-bytes").textContent=bytes(state.items.reduce((s,x)=>s+x.size,0));$("tu-wallets").textContent=state.items.filter(x=>x.priority==="high").length;$("tu-hashed").textContent=state.items.filter(x=>x.sha256).length;
    const body=$("tu-body");body.replaceChildren();for(const x of state.items){const tr=document.createElement("tr");[x.path,bytes(x.size),x.classification,x.sha256.slice(0,18)+"…"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});body.appendChild(tr);}if(!state.items.length)body.innerHTML='<tr><td colspan="4">No files selected.</td></tr>';
    const cl=$("tu-class-list");cl.replaceChildren();for(const x of state.items.filter(x=>x.classification!=="other")){const e=document.createElement("article");e.className="z-list-item";e.innerHTML="<strong></strong><p></p>";e.querySelector("strong").textContent=x.classification;e.querySelector("p").textContent=x.path;cl.appendChild(e);}if(!cl.children.length)cl.innerHTML='<div class="z-list-item"><p>No wallet-like artifacts classified.</p></div>';
    const groups={};for(const x of state.items)(groups[x.sha256]??=[]).push(x);const dup=$("tu-dup-list");dup.replaceChildren();for(const [h,a] of Object.entries(groups).filter(([,a])=>a.length>1)){const e=document.createElement("article");e.className="z-list-item";e.innerHTML="<strong></strong><p></p>";e.querySelector("strong").textContent=`${a.length} identical files · ${h.slice(0,20)}…`;e.querySelector("p").textContent=a.map(x=>x.path).join(" | ");dup.appendChild(e);}if(!dup.children.length)dup.innerHTML='<div class="z-list-item"><p>No byte-identical duplicates.</p></div>';
    $("tu-manifest-output").textContent=JSON.stringify(manifest(),null,2);
  }
  function manifest(){return{schema:"zzx.bitcoin-tully.backup-manifest.v1",createdAt:new Date().toISOString(),caseLabel:$("tu-case")?.value||state.notes?.caseLabel||"",notes:$("tu-notes")?.value||state.notes?.notes||"",files:state.items};}
  $("tu-files").addEventListener("change",()=>ingest($("tu-files").files));$("tu-dir").addEventListener("change",()=>ingest($("tu-dir").files));$("tu-clear").addEventListener("click",()=>{state.items=[];render();});
  $("tu-export-json").addEventListener("click",()=>dl(JSON.stringify(manifest(),null,2),`bitcoin-tully-${Date.now()}.json`,"application/json"));$("tu-export-csv").addEventListener("click",()=>{const q=v=>`"${String(v).replace(/"/g,'""')}"`,rows=["path,size,classification,priority,sha256",...state.items.map(x=>[x.path,x.size,x.classification,x.priority,x.sha256].map(q).join(","))];dl(rows.join("\n")+"\n",`bitcoin-tully-${Date.now()}.csv`,"text/csv");});
  $("tu-save-notes").addEventListener("click",()=>{state.notes={caseLabel:$("tu-case").value,notes:$("tu-notes").value};localStorage.setItem("zzx-tully-notes",JSON.stringify(state.notes));render();});
  if(state.notes){$("tu-case").value=state.notes.caseLabel||"";$("tu-notes").value=state.notes.notes||"";}render();
  window.BitcoinTully=Object.freeze({version:"0.1.0-alpha-web",classify:TullyCore.classify,getManifest:manifest,getState:()=>({files:state.items.length})});
  window.ZZXHooks?.emit("bitcoin-tully:ready",{version:"0.1.0-alpha-web"});
})();
