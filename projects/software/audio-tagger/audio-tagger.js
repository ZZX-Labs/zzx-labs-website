(() => {
  "use strict";

  const $=id=>document.getElementById(id);

  const state={
    store:new AudioTaggerStore(),
    recognition:new AudioTaggerRecognition(),
    records:[],
    files:new Map(),
    selectedId:null,
    queue:{total:0,processed:0,errors:0,bytes:0}
  };

  function uid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `atg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function fmtBytes(n) {
    return AudioTaggerMetadata.formatBytes(n);
  }

  function fmtTime(n) {
    return AudioTaggerMetadata.formatTime(n);
  }

  function effectiveTags(record) {
    return {...record.embeddedTags,...record.catalogTags};
  }

  function selected() {
    return state.records.find(r=>r.id===state.selectedId)||null;
  }

  function cleanRecord(record) {
    return JSON.parse(JSON.stringify(record));
  }

  function log(msg) {
    const out=$("import-log");
    const stamp=new Date().toLocaleTimeString();
    out.textContent+=`\n[${stamp}] ${msg}`;
    out.scrollTop=out.scrollHeight;
  }

  function updateQueue() {
    $("import-queue").textContent=state.queue.total;
    $("import-processed").textContent=state.queue.processed;
    $("import-errors").textContent=state.queue.errors;
    $("import-bytes").textContent=fmtBytes(state.queue.bytes);
    const done=state.queue.processed+state.queue.errors;
    $("import-progress").style.width=`${state.queue.total?done/state.queue.total*100:0}%`;
  }

  async function processFiles(files) {
    const list=[...files];
    state.queue={
      total:list.length,
      processed:0,
      errors:0,
      bytes:list.reduce((s,f)=>s+f.size,0)
    };
    updateQueue();
    log(`Queued ${list.length} file(s).`);

    for(let i=0;i<list.length;i++) {
      const file=list[i];
      try {
        log(`Reading ${i+1}/${list.length}: ${file.name}`);
        const [meta,sha] = await Promise.all([
          AudioTaggerMetadata.extract(file),
          AudioTaggerFingerprint.fileSha256(file)
        ]);

        let acoustic=null;
        try {
          acoustic=await AudioTaggerFingerprint.acousticFingerprint(file);
        } catch(error) {
          console.warn("Acoustic fingerprint unavailable:",file.name,error);
        }

        const record={
          id:uid(),
          name:file.name,
          size:file.size,
          type:file.type||"audio/*",
          extension:meta.extension,
          duration:meta.duration,
          embeddedTags:meta.embedded,
          catalogTags:{},
          rawTags:meta.raw,
          parser:meta.parser,
          streamInfo:meta.streamInfo||null,
          fingerprints:{
            sha256:sha,
            acoustic
          },
          recognition:null,
          indexedAt:new Date().toISOString()
        };

        state.records.push(record);
        state.files.set(record.id,file);
        await state.store.put(record);
        state.queue.processed++;
        log(`Indexed ${file.name} · ${sha.slice(0,12)}…`);
      } catch(error) {
        state.queue.errors++;
        log(`ERROR ${file.name}: ${error.message}`);
      }

      updateQueue();
      renderAll();
    }
  }

  function renderCatalog() {
    const body=$("catalog-body");
    body.replaceChildren();

    if(!state.records.length) {
      body.innerHTML='<tr><td colspan="5" class="muted">No tracks.</td></tr>';
    } else {
      for(const r of state.records) {
        const tags=effectiveTags(r);
        const tr=document.createElement("tr");
        if(r.id===state.selectedId)tr.classList.add("active");

        [
          tags.title||r.name,
          tags.artist||"—",
          tags.album||"—",
          (r.extension||"").toUpperCase(),
          fmtTime(r.duration)
        ].forEach(v=>{
          const td=document.createElement("td");
          td.textContent=v;
          tr.appendChild(td);
        });

        tr.addEventListener("click",()=>{
          state.selectedId=r.id;
          renderAll();
        });

        body.appendChild(tr);
      }
    }

    const tagged=state.records.filter(r=>{
      const t=effectiveTags(r);
      return t.title||t.artist||t.album;
    }).length;

    $("catalog-count").textContent=state.records.length;
    $("catalog-tagged").textContent=tagged;
    $("catalog-missing-title").textContent=state.records.filter(r=>!effectiveTags(r).title).length;
    $("catalog-missing-artist").textContent=state.records.filter(r=>!effectiveTags(r).artist).length;
    $("catalog-edited").textContent=state.records.filter(r=>Object.keys(r.catalogTags||{}).length).length;
  }

  function renderEditor() {
    const r=selected();
    const fields={
      "edit-title":"title",
      "edit-artist":"artist",
      "edit-album":"album",
      "edit-albumartist":"albumArtist",
      "edit-genre":"genre",
      "edit-track":"track",
      "edit-year":"year",
      "edit-composer":"composer",
      "edit-comment":"comment"
    };

    if(!r) {
      for(const id of Object.keys(fields))$(id).value="";
      $("record-meta").replaceChildren();
      return;
    }

    const tags=effectiveTags(r);
    for(const [id,key] of Object.entries(fields)) {
      $(id).value=tags[key]||"";
    }

    const meta=$("record-meta");
    meta.replaceChildren();

    const items=[
      ["Filename",r.name],
      ["Parser",r.parser],
      ["Size",fmtBytes(r.size)],
      ["Duration",fmtTime(r.duration)],
      ["SHA-256",r.fingerprints?.sha256],
      ["Acoustic",r.fingerprints?.acoustic?.hash],
      ["Indexed",r.indexedAt],
      ["Recognition",r.recognition?.source||"—"]
    ];

    for(const [k,v] of items) {
      const dt=document.createElement("dt");
      const dd=document.createElement("dd");
      dt.textContent=k;
      dd.textContent=v||"—";
      meta.append(dt,dd);
    }
  }

  async function saveEditor() {
    const r=selected();
    if(!r)throw new Error("Select a track.");

    r.catalogTags={
      title:$("edit-title").value.trim(),
      artist:$("edit-artist").value.trim(),
      album:$("edit-album").value.trim(),
      albumArtist:$("edit-albumartist").value.trim(),
      genre:$("edit-genre").value.trim(),
      track:$("edit-track").value.trim(),
      year:$("edit-year").value.trim(),
      composer:$("edit-composer").value.trim(),
      comment:$("edit-comment").value.trim()
    };

    await state.store.put(r);
    renderAll();
  }

  async function resetEditor() {
    const r=selected();
    if(!r)return;
    r.catalogTags={};
    await state.store.put(r);
    renderAll();
  }

  function rules() {
    return {
      whitespace:$("rule-whitespace").checked,
      filenameTitle:$("rule-filename-title").checked,
      titlecase:$("rule-titlecase").checked,
      genre:$("rule-genre").checked
    };
  }

  function collapse(value) {
    return String(value||"").trim().replace(/\s+/g," ");
  }

  function titleCase(value) {
    const s=String(value||"");
    if(!s||/[A-Z]/.test(s))return s;
    const small=new Set(["a","an","and","as","at","but","by","for","in","of","on","or","the","to"]);
    return s.split(/\s+/).map((word,i)=>{
      const lower=word.toLowerCase();
      if(i&&small.has(lower))return lower;
      return lower.charAt(0).toUpperCase()+lower.slice(1);
    }).join(" ");
  }

  function normalizeGenre(value) {
    const parts=String(value||"")
      .split(/[;,/|]+/)
      .map(collapse)
      .filter(Boolean);

    const seen=new Set();
    const out=[];
    for(const p of parts) {
      const key=p.toLowerCase();
      if(!seen.has(key)){seen.add(key);out.push(p);}
    }
    return out.join("; ");
  }

  function proposedTags(record) {
    const cfg=rules();
    const current=effectiveTags(record);
    const next={...current};

    if(cfg.whitespace) {
      for(const key of Object.keys(next))next[key]=collapse(next[key]);
    }

    if(cfg.filenameTitle&&!next.title) {
      next.title=record.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").trim();
    }

    if(cfg.titlecase) {
      next.title=titleCase(next.title);
      next.album=titleCase(next.album);
    }

    if(cfg.genre)next.genre=normalizeGenre(next.genre);

    return next;
  }

  function changedKeys(record,next) {
    const current=effectiveTags(record);
    const keys=new Set([...Object.keys(current),...Object.keys(next)]);
    return [...keys].filter(k=>(current[k]||"")!==(next[k]||""));
  }

  function renderCleanupPreview() {
    const root=$("cleanup-review");
    root.replaceChildren();

    const changed=state.records.map(r=>{
      const next=proposedTags(r);
      return {r,next,keys:changedKeys(r,next)};
    }).filter(x=>x.keys.length);

    if(!changed.length) {
      root.innerHTML='<div class="atg-review"><p>No changes under the selected rules.</p></div>';
      return;
    }

    for(const item of changed.slice(0,500)) {
      const el=document.createElement("div");
      el.className="atg-review";
      const strong=document.createElement("strong");
      strong.textContent=item.r.name;
      const p=document.createElement("p");
      p.textContent=`Changes: ${item.keys.join(", ")}`;
      el.append(strong,p);
      root.appendChild(el);
    }
  }

  async function applyCleanup() {
    for(const r of state.records) {
      const next=proposedTags(r);
      const keys=changedKeys(r,next);
      if(keys.length)r.catalogTags={...r.catalogTags,...next};
    }
    await state.store.putMany(state.records);
    renderCleanupPreview();
    renderAll();
  }

  function duplicateGroups() {
    const map=new Map();
    for(const r of state.records) {
      const h=r.fingerprints?.sha256;
      if(!h)continue;
      if(!map.has(h))map.set(h,[]);
      map.get(h).push(r);
    }
    return [...map.values()].filter(g=>g.length>1);
  }

  function renderFingerprints() {
    const r=selected();
    const duplicates=duplicateGroups();
    const durationConflicts=duplicates.filter(group=>{
      const durations=group.map(x=>Math.round((x.duration||0)*1000));
      return new Set(durations).size>1;
    }).length;

    $("fp-sha-count").textContent=state.records.filter(r=>r.fingerprints?.sha256).length;
    $("fp-acoustic-count").textContent=state.records.filter(r=>r.fingerprints?.acoustic?.hash).length;
    $("fp-duplicates").textContent=duplicates.length;
    $("fp-duration-conflicts").textContent=durationConflicts;
    $("fp-selected").textContent=r?r.name:"—";

    $("fingerprint-output").textContent=r
      ? JSON.stringify({
          file:r.name,
          sha256:r.fingerprints?.sha256||null,
          acoustic:r.fingerprints?.acoustic||null
        },null,2)
      : "Select a catalog track to inspect its fingerprints.";
  }

  async function runRecognition() {
    if(!state.recognition.provider)throw new Error("No recognition provider registered.");

    const mode=$("recognition-mode").value;
    let targets=[];

    if(mode==="selected") {
      const r=selected();
      if(!r)throw new Error("Select a track.");
      targets=[r];
    } else if(mode==="missing") {
      targets=state.records.filter(r=>{
        const t=effectiveTags(r);
        return !t.title||!t.artist;
      });
    } else {
      targets=[...state.records];
    }

    const out=[];
    for(const r of targets) {
      try {
        const result=await state.recognition.recognize(r,state.files.get(r.id)||null);
        r.recognition={
          provider:state.recognition.name,
          source:result.source||state.recognition.name,
          confidence:result.confidence??null,
          at:new Date().toISOString()
        };

        const tags={...result};
        delete tags.confidence;
        delete tags.source;
        r.catalogTags={...r.catalogTags,...tags};
        await state.store.put(r);
        out.push({file:r.name,status:"matched",result});
      } catch(error) {
        out.push({file:r.name,status:"error",error:error.message});
      }
    }

    $("recognition-output").textContent=JSON.stringify(out,null,2);
    renderAll();
  }

  function exportObject() {
    return {
      schema:"zzx.audio-tagger.catalog.v1",
      exportedAt:new Date().toISOString(),
      records:state.records.map(cleanRecord)
    };
  }

  function downloadText(text,name,type) {
    const blob=new Blob([text],{type});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=name;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function yamlScalar(value) {
    if(value===null||value===undefined)return "null";
    if(typeof value==="number"||typeof value==="boolean")return String(value);
    return JSON.stringify(String(value));
  }

  function yaml(value,indent=0) {
    const pad=" ".repeat(indent);
    if(Array.isArray(value)) {
      if(!value.length)return "[]";
      return value.map(item=>{
        if(item&&typeof item==="object") {
          const rendered=yaml(item,indent+2).split("\n");
          return `${pad}- ${rendered[0].trimStart()}`+
            (rendered.length>1?`\n${rendered.slice(1).join("\n")}`:"");
        }
        return `${pad}- ${yamlScalar(item)}`;
      }).join("\n");
    }

    if(value&&typeof value==="object") {
      const lines=[];
      for(const [k,v] of Object.entries(value)) {
        if(v&&typeof v==="object") {
          const nested=yaml(v,indent+2);
          lines.push(`${pad}${k}:`);
          lines.push(nested);
        } else {
          lines.push(`${pad}${k}: ${yamlScalar(v)}`);
        }
      }
      return lines.join("\n");
    }

    return `${pad}${yamlScalar(value)}`;
  }

  function csvEscape(v) {
    return `"${String(v??"").replace(/"/g,'""')}"`;
  }

  function exportCsv() {
    const headers=[
      "name","title","artist","album","albumArtist","genre","track","year",
      "duration","extension","sha256","acousticFingerprint"
    ];
    const lines=[headers.join(",")];

    for(const r of state.records) {
      const t=effectiveTags(r);
      const values={
        name:r.name,
        ...t,
        duration:r.duration,
        extension:r.extension,
        sha256:r.fingerprints?.sha256,
        acousticFingerprint:r.fingerprints?.acoustic?.hash
      };
      lines.push(headers.map(h=>csvEscape(values[h])).join(","));
    }

    downloadText(lines.join("\n"),`audio-tagger-${Date.now()}.csv`,"text/csv");
  }

  async function importCatalog(file) {
    const value=JSON.parse(await file.text());
    if(value.schema!=="zzx.audio-tagger.catalog.v1"||!Array.isArray(value.records)) {
      throw new Error("Unsupported AudioTagger catalog JSON.");
    }

    state.records=value.records;
    state.files.clear();
    state.selectedId=state.records[0]?.id||null;
    await state.store.clear();
    await state.store.putMany(state.records);
    renderAll();

    $("export-output").textContent=
      `Imported ${state.records.length} catalog record(s). `+
      `Raw audio files are not embedded in catalog JSON.`;
  }

  function renderAll() {
    renderCatalog();
    renderEditor();
    renderFingerprints();
  }

  function setupDropzone() {
    const dz=$("import-dropzone");
    ["dragenter","dragover"].forEach(n=>dz.addEventListener(n,e=>{
      e.preventDefault();
      dz.classList.add("dragover");
    }));
    ["dragleave","drop"].forEach(n=>dz.addEventListener(n,e=>{
      e.preventDefault();
      dz.classList.remove("dragover");
    }));
    dz.addEventListener("drop",e=>{
      const files=[...e.dataTransfer.files].filter(f=>
        f.type.startsWith("audio/")||/\.(mp3|flac|wav|ogg|m4a|aac|opus)$/i.test(f.name)
      );
      processFiles(files);
    });
  }

  function bind(id,event,fn) {
    const el=$(id);
    if(!el)return;
    el.addEventListener(event,async e=>{
      try{await fn(e);}
      catch(error){
        console.error(error);
        const target=id.startsWith("recognition")
          ?$("recognition-output")
          :id.startsWith("export")||id.startsWith("import")||id==="catalog-clear"
            ?$("export-output")
            :$("import-log");
        if(target)target.textContent=`ERROR: ${error.message}`;
      }
    });
  }

  function bindEvents() {
    bind("import-files","change",async()=>{
      const files=[...$("import-files").files];
      $("import-files").value="";
      await processFiles(files);
    });

    bind("edit-save","click",saveEditor);
    bind("edit-reset","click",resetEditor);

    bind("edit-sidecar","click",()=>{
      const r=selected();
      if(!r)throw new Error("Select a track.");
      downloadText(
        JSON.stringify({
          schema:"zzx.audio-tagger.sidecar.v1",
          file:r.name,
          sha256:r.fingerprints?.sha256,
          embedded:r.embeddedTags,
          catalog:r.catalogTags,
          effective:effectiveTags(r)
        },null,2),
        `${r.name}.audio-tagger.json`,
        "application/json"
      );
    });

    bind("cleanup-preview","click",renderCleanupPreview);
    bind("cleanup-apply","click",applyCleanup);
    bind("recognition-run","click",runRecognition);

    bind("export-json","click",()=>{
      downloadText(
        JSON.stringify(exportObject(),null,2),
        `audio-tagger-${Date.now()}.json`,
        "application/json"
      );
    });

    bind("export-yaml","click",()=>{
      downloadText(
        yaml(exportObject())+"\n",
        `audio-tagger-${Date.now()}.yaml`,
        "text/yaml"
      );
    });

    bind("export-csv","click",exportCsv);

    bind("import-catalog","change",async()=>{
      const file=$("import-catalog").files?.[0];
      if(file)await importCatalog(file);
      $("import-catalog").value="";
    });

    bind("catalog-clear","click",async()=>{
      await state.store.clear();
      state.records=[];
      state.files.clear();
      state.selectedId=null;
      renderAll();
      $("export-output").textContent="Catalog cleared.";
    });

    setupDropzone();
  }

  function expose() {
    window.AudioTagger=Object.freeze({
      version:"0.1.0-alpha-web",

      async addFiles(files) {
        await processFiles(files);
        return state.records.map(cleanRecord);
      },

      getRecords() {
        return state.records.map(cleanRecord);
      },

      getRecord(id) {
        const r=state.records.find(x=>x.id===id);
        return r?cleanRecord(r):null;
      },

      normalizePreview(id) {
        const r=state.records.find(x=>x.id===id);
        if(!r)throw new Error("Record not found.");
        return proposedTags(r);
      },

      registerRecognitionProvider(provider,name="custom") {
        state.recognition.register(provider,name);
        $("status-recognition").textContent=provider
          ?`RECOGNITION: ${String(name).toUpperCase()}`
          :"RECOGNITION: PROVIDER";
        $("status-recognition").className=`runtime-badge ${provider?"ok":"partial"}`;
        $("recognition-output").textContent=provider
          ?`Recognition provider registered: ${name}`
          :"No recognition provider registered.";
      },

      exportCatalog() {
        return exportObject();
      },

      async importCatalog(value) {
        if(value.schema!=="zzx.audio-tagger.catalog.v1"||!Array.isArray(value.records)) {
          throw new Error("Unsupported AudioTagger catalog.");
        }
        state.records=value.records;
        state.files.clear();
        state.selectedId=state.records[0]?.id||null;
        await state.store.clear();
        await state.store.putMany(state.records);
        renderAll();
        return state.records.length;
      },

      getState() {
        return {
          records:state.records.length,
          sessionFiles:state.files.size,
          selectedId:state.selectedId,
          recognitionProvider:state.recognition.name
        };
      }
    });
  }

  (async()=>{
    state.records=await state.store.all();
    state.selectedId=state.records[0]?.id||null;
    bindEvents();
    updateQueue();
    renderAll();
    expose();
    window.ZZXHooks?.emit("audio-tagger:ready",{
      version:"0.1.0-alpha-web",
      restored:state.records.length
    });
  })().catch(error=>{
    console.error(error);
    log(`Startup error: ${error.message}`);
  });
})();
