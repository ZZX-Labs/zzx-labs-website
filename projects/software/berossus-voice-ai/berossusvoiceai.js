(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const state={ctx:null,files:[],recognition:null};

  function id(){return crypto.randomUUID?crypto.randomUUID():`v-${Date.now()}-${Math.random().toString(16).slice(2)}`;}
  function download(text,name,type="application/json"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  function voices(){return speechSynthesis.getVoices();}

  function renderVoices(){
    const select=$("tts-voice"),current=select.value;select.replaceChildren();
    for(const [i,v] of voices().entries()){const o=document.createElement("option");o.value=String(i);o.textContent=`${v.name} · ${v.lang}${v.default?" · default":""}`;select.appendChild(o);}
    if(current&&select.options[Number(current)])select.value=current;
  }

  function speak(){
    speechSynthesis.cancel();
    const utter=new SpeechSynthesisUtterance($("tts-text").value);
    const list=voices(),v=list[Number($("tts-voice").value)];
    if(v)utter.voice=v;
    utter.rate=Number($("tts-rate").value)||1;utter.pitch=Number($("tts-pitch").value)||1;
    utter.onstart=()=>{$("tts-output").textContent=JSON.stringify({state:"speaking",voice:v?.name||null,lang:v?.lang||null,rate:utter.rate,pitch:utter.pitch},null,2);};
    utter.onend=()=>{$("tts-output").textContent+=`\n\nCompleted.`;};
    speechSynthesis.speak(utter);
  }

  function startSTT(){
    if(!SpeechRecognition)throw new Error("SpeechRecognition is unavailable in this browser.");
    if(state.recognition)state.recognition.abort();
    const r=new SpeechRecognition();
    r.lang=$("stt-lang").value.trim()||"en-US";
    r.continuous=$("stt-continuous").value==="true";
    r.interimResults=$("stt-interim").value==="true";
    let finalText="";
    r.onresult=e=>{let interim="";for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=t+" ";else interim+=t;}$("stt-output").textContent=`FINAL:\n${finalText.trim()}\n\nINTERIM:\n${interim}`;};
    r.onerror=e=>$("stt-output").textContent+=`\n\nERROR: ${e.error}`;
    r.onend=()=>{state.recognition=null;$("stt-output").textContent+=`\n\n[recognition ended]`;};
    state.recognition=r;r.start();
  }

  async function addFiles(files){
    state.ctx=state.ctx||new (window.AudioContext||window.webkitAudioContext)();
    for(const file of files){
      try{
        const buffer=await BerossusVoiceAudio.decode(file,state.ctx),m=BerossusVoiceAudio.metrics(buffer);
        state.files.push({id:id(),name:file.name,size:file.size,type:file.type,metrics:m,buffer,segments:[],alignment:[]});
      }catch(e){console.error(file.name,e);}
    }
    renderFiles();
  }

  function serializableFile(f){return{id:f.id,name:f.name,size:f.size,type:f.type,metrics:f.metrics,segments:f.segments,alignment:f.alignment};}

  function renderFiles(){
    $("audio-count").textContent=state.files.length;
    $("audio-duration").textContent=`${state.files.reduce((s,f)=>s+f.metrics.duration,0).toFixed(2)} s`;
    $("audio-segments").textContent=state.files.reduce((s,f)=>s+f.segments.length,0);
    $("audio-rates").textContent=[...new Set(state.files.map(f=>f.metrics.sampleRate))].join(", ")||"—";

    const root=$("audio-list");root.replaceChildren();
    for(const f of state.files){
      const el=document.createElement("article");el.className="p-list-item";
      const h=document.createElement("strong");h.textContent=f.name;
      const p=document.createElement("p");p.textContent=`${f.metrics.duration.toFixed(2)} s · ${f.metrics.sampleRate} Hz · ${f.metrics.channels} ch · peak ${f.metrics.peak.toFixed(4)} · RMS ${f.metrics.rms.toFixed(4)} · ${f.segments.length} segments`;
      el.append(h,p);root.appendChild(el);
    }

    const select=$("align-file"),current=select.value;select.replaceChildren();
    for(const f of state.files){const o=document.createElement("option");o.value=f.id;o.textContent=f.name;select.appendChild(o);}
    if(current&&state.files.some(f=>f.id===current))select.value=current;
    renderDiarization();
  }

  function segmentAll(){
    for(const f of state.files){
      f.segments=BerossusVoiceAudio.vad(f.buffer,{frameMs:Number($("vad-frame").value),threshold:Number($("vad-threshold").value),mergeGapMs:Number($("vad-gap").value)});
    }
    renderFiles();
  }

  function align(){
    const f=state.files.find(x=>x.id===$("align-file").value);
    if(!f)throw new Error("Select an audio file.");
    const lines=$("align-text").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),speaker=$("align-speaker").value.trim()||"speaker_1";
    const slots=f.segments.length?f.segments:Array.from({length:Math.max(1,lines.length)},(_,i)=>({start:f.metrics.duration*i/Math.max(1,lines.length),end:f.metrics.duration*(i+1)/Math.max(1,lines.length),duration:f.metrics.duration/Math.max(1,lines.length),speaker,text:""}));
    const alignment=[];
    for(let i=0;i<lines.length;i++){
      const slot=slots[Math.min(i,slots.length-1)];
      alignment.push({id:`utt-${i+1}`,start:slot.start,end:slot.end,speaker,text:lines[i]});
    }
    f.alignment=alignment;
    $("align-output").textContent=JSON.stringify(alignment,null,2);
    renderDiarization();
  }

  function renderDiarization(){
    const root=$("diarize-list");root.replaceChildren();
    const rows=state.files.flatMap(f=>(f.alignment.length?f.alignment:f.segments).map(s=>({file:f,...s})));
    if(!rows.length){root.innerHTML='<div class="p-list-item"><p>No aligned or segmented utterances yet.</p></div>';return;}
    for(const row of rows){
      const el=document.createElement("article");el.className="p-list-item";
      const h=document.createElement("strong");h.textContent=`${row.file.name} · ${row.start.toFixed(2)}–${row.end.toFixed(2)} s`;
      const p=document.createElement("p");p.textContent=row.text||"(no transcript)";
      const input=document.createElement("input");input.type="text";input.value=row.speaker||"speaker_1";input.addEventListener("change",()=>{row.speaker=input.value.trim()||"speaker_1";});
      el.append(h,p,input);root.appendChild(el);
    }
  }

  function workspace(){return{schema:"zzx.berossusvoiceai.workspace.v1",exportedAt:new Date().toISOString(),files:state.files.map(serializableFile)};}

  const dz=$("audio-drop");
  ["dragenter","dragover"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add("dragover");}));
  ["dragleave","drop"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove("dragover");}));
  dz.addEventListener("drop",e=>addFiles([...e.dataTransfer.files]));
  $("audio-files").addEventListener("change",async()=>{await addFiles([...$("audio-files").files]);$("audio-files").value="";});
  $("vad-run").addEventListener("click",segmentAll);
  $("align-run").addEventListener("click",()=>{try{align();}catch(e){$("align-output").textContent=`ERROR: ${e.message}`;}});
  $("tts-speak").addEventListener("click",speak);
  $("tts-stop").addEventListener("click",()=>speechSynthesis.cancel());
  $("stt-start").addEventListener("click",()=>{try{startSTT();}catch(e){$("stt-output").textContent=`ERROR: ${e.message}`;}});
  $("stt-stop").addEventListener("click",()=>state.recognition?.stop());
  $("export-json").addEventListener("click",()=>download(JSON.stringify(workspace(),null,2),`berossusvoiceai-${Date.now()}.json`));
  $("export-jsonl").addEventListener("click",()=>{const rows=state.files.flatMap(f=>f.alignment.map(a=>JSON.stringify({file:f.name,start:a.start,end:a.end,speaker:a.speaker,text:a.text})));download(rows.join("\n")+"\n",`berossusvoiceai-utterances-${Date.now()}.jsonl`,"application/x-ndjson");$("export-output").textContent=`Exported ${rows.length} utterances.`;});
  $("import-json").addEventListener("change",async()=>{const f=$("import-json").files?.[0];if(!f)return;const v=JSON.parse(await f.text());if(v.schema!=="zzx.berossusvoiceai.workspace.v1")throw new Error("Unsupported workspace.");state.files=(v.files||[]).map(x=>({...x,buffer:null}));renderFiles();$("export-output").textContent=`Imported metadata for ${state.files.length} files. Reselect source audio to restore buffers.`;$("import-json").value="";});

  renderVoices();speechSynthesis.onvoiceschanged=renderVoices;
  $("voice-stt-status").textContent=`STT: ${SpeechRecognition?"AVAILABLE":"UNAVAILABLE"}`;
  $("voice-stt-status").className=`runtime-badge ${SpeechRecognition?"ok":"partial"}`;
  renderFiles();

  window.BerossusVoiceAI=Object.freeze({version:"0.1.0-alpha-web",speak(text,options={}){$("tts-text").value=text;if(options.rate)$("tts-rate").value=options.rate;if(options.pitch)$("tts-pitch").value=options.pitch;speak();},stop:()=>speechSynthesis.cancel(),addFiles,getWorkspace:workspace,getState:()=>({files:state.files.length,segments:state.files.reduce((s,f)=>s+f.segments.length,0),utterances:state.files.reduce((s,f)=>s+f.alignment.length,0),speechRecognition:Boolean(SpeechRecognition)})});
  window.ZZXHooks?.emit("berossusvoiceai:ready",{version:"0.1.0-alpha-web"});
})();
