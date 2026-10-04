(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const state={docs:[],chunks:[],duplicates:0,settings:{size:1200,overlap:150,dims:384}};

  function id(){return crypto.randomUUID?crypto.randomUUID():`b-${Date.now()}-${Math.random().toString(16).slice(2)}`;}
  function download(text,name,type="application/json"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  async function addDoc(title,text,source="local") {
    const clean=String(text);
    const hash=await BerossusCorpusCore.sha256(clean);
    if(state.docs.some(d=>d.sha256===hash)){state.duplicates++;return false;}
    state.docs.push({id:id(),title:String(title||"untitled"),source,sha256:hash,text:clean,characters:clean.length,addedAt:new Date().toISOString()});
    await rebuild();
    return true;
  }

  async function rebuild() {
    state.settings={size:Math.max(200,Number($("chunk-size")?.value)||state.settings.size),overlap:Math.max(0,Number($("chunk-overlap")?.value)||state.settings.overlap),dims:Math.max(64,Number($("vector-dims")?.value)||state.settings.dims)};
    const seen=new Set(),chunks=[];let dupes=state.duplicates;

    for(const doc of state.docs) {
      const pieces=BerossusCorpusCore.chunkText(doc.text,state.settings.size,state.settings.overlap);
      for(let i=0;i<pieces.length;i++) {
        const text=pieces[i],hash=await BerossusCorpusCore.sha256(text);
        if(seen.has(hash)){dupes++;continue;}
        seen.add(hash);
        chunks.push({id:`${doc.id}:${i}`,docId:doc.id,title:doc.title,index:i,text,characters:text.length,sha256:hash,vector:Array.from(BerossusCorpusCore.hashedVector(text,state.settings.dims))});
      }
    }
    state.chunks=chunks;state.duplicates=dupes;render();
  }

  function search(query,k=8) {
    const qv=BerossusCorpusCore.hashedVector(query,state.settings.dims);
    return state.chunks.map(c=>{const vector=Float32Array.from(c.vector),cos=BerossusCorpusCore.cosine(qv,vector),lex=BerossusCorpusCore.lexical(query,c.text);return{...c,score:.72*cos+.28*lex,cosine:cos,lexical:lex};}).sort((a,b)=>b.score-a.score).slice(0,k);
  }

  function render() {
    $("metric-docs").textContent=state.docs.length;
    $("metric-chars").textContent=state.docs.reduce((s,d)=>s+d.characters,0).toLocaleString();
    $("metric-chunks").textContent=state.chunks.length;
    $("metric-dupes").textContent=state.duplicates;

    $("ingest-output").textContent=JSON.stringify(state.docs.map(d=>({title:d.title,characters:d.characters,sha256:d.sha256,source:d.source})),null,2);

    const body=$("chunk-body");body.replaceChildren();
    for(const c of state.chunks.slice(0,1000)) {
      const tr=document.createElement("tr");
      [c.id,c.title,c.characters,c.sha256.slice(0,16)+"…"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});
      body.appendChild(tr);
    }
  }

  async function files(files) {
    for(const f of files) {
      try {
        let text=await f.text();
        if(f.name.toLowerCase().endsWith(".json")) {
          try{text=JSON.stringify(JSON.parse(text),null,2);}catch{}
        }
        await addDoc(f.name,text,"file");
      } catch(e) { console.error(f.name,e); }
    }
  }

  function renderSearch(results) {
    const root=$("search-results");root.replaceChildren();
    if(!results.length){root.innerHTML='<div class="p-list-item"><p>No results.</p></div>';return;}
    for(const r of results) {
      const el=document.createElement("article");el.className="p-list-item";
      const h=document.createElement("strong");h.textContent=`${r.title} · score ${r.score.toFixed(4)}`;
      const p=document.createElement("p");p.textContent=r.text.slice(0,700);
      el.append(h,p);root.appendChild(el);
    }
  }

  function runEval() {
    const specs=JSON.parse($("eval-json").value);
    const k=Math.max(1,Math.min(50,Number($("search-k").value)||8)),rows=[];
    let hits=0,mrr=0;
    for(const item of specs) {
      const results=search(item.query,k);
      const rank=results.findIndex(r=>r.title===item.expectedTitle)+1;
      if(rank>0){hits++;mrr+=1/rank;}
      rows.push({query:item.query,expectedTitle:item.expectedTitle,rank:rank||null,topTitles:results.map(r=>r.title)});
    }
    $("eval-output").textContent=JSON.stringify({cases:specs.length,k,hitAtK:specs.length?hits/specs.length:0,MRR:specs.length?mrr/specs.length:0,rows},null,2);
  }

  function workspace() {
    return {schema:"zzx.berossus.workspace.v1",exportedAt:new Date().toISOString(),settings:state.settings,duplicates:state.duplicates,docs:state.docs,chunks:state.chunks};
  }

  const dz=$("ingest-drop");
  ["dragenter","dragover"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add("dragover");}));
  ["dragleave","drop"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove("dragover");}));
  dz.addEventListener("drop",e=>files([...e.dataTransfer.files]));
  $("ingest-files").addEventListener("change",async()=>{await files([...$("ingest-files").files]);$("ingest-files").value="";});
  $("paste-add").addEventListener("click",()=>addDoc($("paste-title").value,$("paste-text").value,"paste"));
  $("chunks-rebuild").addEventListener("click",()=>rebuild());
  $("search-run").addEventListener("click",()=>renderSearch(search($("search-query").value,Number($("search-k").value)||8)));
  $("eval-run").addEventListener("click",()=>{try{runEval();}catch(e){$("eval-output").textContent=`ERROR: ${e.message}`;}});
  $("dataset-jsonl").addEventListener("click",()=>{const min=Math.max(1,Number($("dataset-minchars").value)||100),name=$("dataset-name").value.trim()||"berossus-corpus",rows=state.chunks.filter(c=>c.characters>=min).map(c=>JSON.stringify({id:c.id,source:c.title,text:c.text,sha256:c.sha256}));download(rows.join("\n")+"\n",`${name}.jsonl`,"application/x-ndjson");$("dataset-output").textContent=`Exported ${rows.length} chunk records.`;});
  $("dataset-manifest").addEventListener("click",()=>download(JSON.stringify({schema:"zzx.berossus.dataset-manifest.v1",name:$("dataset-name").value.trim()||"berossus-corpus",documents:state.docs.length,chunks:state.chunks.length,settings:state.settings,createdAt:new Date().toISOString()},null,2),`${$("dataset-name").value.trim()||"berossus-corpus"}-manifest.json`));
  $("workspace-export").addEventListener("click",()=>download(JSON.stringify(workspace(),null,2),`berossus-workspace-${Date.now()}.json`));
  $("workspace-import").addEventListener("change",async()=>{const f=$("workspace-import").files?.[0];if(!f)return;const v=JSON.parse(await f.text());if(v.schema!=="zzx.berossus.workspace.v1")throw new Error("Unsupported workspace.");state.docs=v.docs||[];state.chunks=v.chunks||[];state.settings=v.settings||state.settings;state.duplicates=v.duplicates||0;$("chunk-size").value=state.settings.size;$("chunk-overlap").value=state.settings.overlap;$("vector-dims").value=state.settings.dims;render();$("workspace-output").textContent=`Imported ${state.docs.length} docs / ${state.chunks.length} chunks.`;$("workspace-import").value="";});
  $("workspace-clear").addEventListener("click",()=>{state.docs=[];state.chunks=[];state.duplicates=0;render();$("workspace-output").textContent="Workspace cleared.";});
  render();

  window.Berossus=Object.freeze({version:"0.3.0-beta-web",addDocument:addDoc,rebuild,search,workspace,getState:()=>({documents:state.docs.length,chunks:state.chunks.length,duplicates:state.duplicates,settings:{...state.settings}})});
  window.ZZXHooks?.emit("berossus:ready",{version:"0.3.0-beta-web"});
})();
