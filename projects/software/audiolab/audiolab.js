(() => {
  "use strict";

  const $=id=>document.getElementById(id);
  const state={
    engine:new AudioLabEngine(),
    recorder:new AudioLabRecorder(),
    tracks:[],
    recordingUrl:null,
    renderFile:null,
    renderBuffer:null,
    raf:null
  };

  function uid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `track-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function fxSettings() {
    return {
      filterType:$("fx-filter-type").value,
      filterFrequency:Number($("fx-filter-frequency").value),
      filterQ:Number($("fx-filter-q").value),
      drive:Number($("fx-drive").value),
      delay:Number($("fx-delay").value),
      feedback:Number($("fx-feedback").value),
      wet:Number($("fx-wet").value),
      master:Number($("fx-master").value)
    };
  }

  function applyFx() {
    state.engine.updateFx(fxSettings());
  }

  function setText(id,value) {
    $(id).textContent=String(value);
  }

  function drawSynthPreview() {
    const wave=$("synth-wave").value;
    const frequency=Number($("synth-frequency").value);
    const gain=Number($("synth-gain").value);
    const pan=Number($("synth-pan").value);

    setText("synth-frequency-out",`${frequency} Hz`);
    setText("synth-gain-out",gain.toFixed(2));
    setText("synth-pan-out",pan.toFixed(2));
    setText("metric-wave",wave);
    setText("metric-frequency",`${frequency} Hz`);
    setText("metric-gain",gain.toFixed(2));
    setText("metric-pan",pan.toFixed(2));

    AudioLabVisuals.drawGenerated($("synth-scope"),wave,frequency,gain);
  }

  async function playSynth() {
    applyFx();
    const ctx=state.engine.ensure();
    if(ctx.state==="suspended") await ctx.resume();

    state.engine.playSynth({
      wave:$("synth-wave").value,
      frequency:Number($("synth-frequency").value),
      gain:Number($("synth-gain").value),
      pan:Number($("synth-pan").value)
    });
  }

  function renderSynthWav() {
    const duration=Math.max(.1,Math.min(60,Number($("synth-duration").value)||3));
    const generated=AudioLabDSP.generateSignal(
      $("synth-wave").value,
      Number($("synth-frequency").value),
      duration,
      48000,
      Number($("synth-gain").value)
    );
    const blob=AudioLabDSP.wavBlob(generated.channels,generated.sampleRate);
    downloadBlob(blob,`audiolab-${$("synth-wave").value}-${$("synth-frequency").value}hz.wav`);
  }

  function downloadBlob(blob,name) {
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=name;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function addFiles(files) {
    for(const file of files) {
      try {
        const buffer=await state.engine.decode(file);
        state.tracks.push({
          id:uid(),
          name:file.name,
          file,
          buffer,
          duration:buffer.duration,
          channels:buffer.numberOfChannels,
          sampleRate:buffer.sampleRate,
          gain:.8,
          pan:0,
          mute:false,
          solo:false,
          loop:false
        });
      } catch(error) {
        console.error(file.name,error);
      }
    }
    renderTracks();
  }

  function renderTracks() {
    const root=$("mixer-track-list");
    root.replaceChildren();

    if(!state.tracks.length) {
      root.innerHTML='<div class="al-track"><span class="idx">—</span><div class="info"><strong>No tracks</strong><span>Import audio files above.</span></div></div>';
    }

    state.tracks.forEach((track,index)=>{
      const row=document.createElement("article");
      row.className="al-track";

      const idx=document.createElement("span");
      idx.className="idx";
      idx.textContent=String(index+1).padStart(2,"0");

      const info=document.createElement("div");
      info.className="info";
      const title=document.createElement("strong");
      title.textContent=track.name;
      const meta=document.createElement("span");
      meta.textContent=`${track.duration.toFixed(2)} s · ${track.channels} ch · ${track.sampleRate} Hz`;
      info.append(title,meta);

      const mute=document.createElement("button");
      mute.type="button";
      mute.className=`small ${track.mute?"on":""}`;
      mute.textContent="M";
      mute.title="Mute";
      mute.addEventListener("click",()=>{
        track.mute=!track.mute;
        renderTracks();
      });

      const solo=document.createElement("button");
      solo.type="button";
      solo.className=`small ${track.solo?"on":""}`;
      solo.textContent="S";
      solo.title="Solo";
      solo.addEventListener("click",()=>{
        track.solo=!track.solo;
        renderTracks();
      });

      row.append(idx,info,mute,solo);

      const mixer=document.createElement("div");
      mixer.className="al-track-mixer";
      mixer.style.gridColumn="2 / -1";

      const gainLabel=document.createElement("label");
      gainLabel.textContent=`Gain ${track.gain.toFixed(2)}`;
      const gain=document.createElement("input");
      gain.type="range";
      gain.className="al-range";
      gain.min="0"; gain.max="1.5"; gain.step=".01"; gain.value=track.gain;
      gain.addEventListener("input",()=>{
        track.gain=Number(gain.value);
        gainLabel.firstChild.textContent=`Gain ${track.gain.toFixed(2)}`;
      });
      gainLabel.appendChild(gain);

      const panLabel=document.createElement("label");
      panLabel.textContent=`Pan ${track.pan.toFixed(2)}`;
      const pan=document.createElement("input");
      pan.type="range";
      pan.className="al-range";
      pan.min="-1"; pan.max="1"; pan.step=".01"; pan.value=track.pan;
      pan.addEventListener("input",()=>{
        track.pan=Number(pan.value);
        panLabel.firstChild.textContent=`Pan ${track.pan.toFixed(2)}`;
      });
      panLabel.appendChild(pan);

      const loopLabel=document.createElement("label");
      loopLabel.style.display="flex";
      loopLabel.style.gridTemplateColumns="auto 1fr";
      loopLabel.style.alignItems="center";
      const loop=document.createElement("input");
      loop.type="checkbox";
      loop.checked=track.loop;
      loop.style.width="auto";
      loop.style.minHeight="auto";
      loop.addEventListener("change",()=>track.loop=loop.checked);
      loopLabel.append(loop,document.createTextNode(" Loop"));

      const remove=document.createElement("button");
      remove.type="button";
      remove.className="small";
      remove.textContent="REMOVE";
      remove.addEventListener("click",()=>{
        state.tracks=state.tracks.filter(t=>t.id!==track.id);
        renderTracks();
      });

      mixer.append(gainLabel,panLabel,loopLabel,remove);
      row.appendChild(mixer);
      root.appendChild(row);
    });

    setText("mixer-count",state.tracks.length);
    setText("mixer-decoded",state.tracks.filter(t=>t.buffer).length);
    setText("mixer-muted",state.tracks.filter(t=>t.mute).length);
    setText("mixer-solo",state.tracks.filter(t=>t.solo).length);
  }

  async function playMix() {
    state.engine.stopAll();
    applyFx();

    const ctx=state.engine.ensure();
    if(ctx.state==="suspended") await ctx.resume();

    const soloed=state.tracks.filter(t=>t.solo);
    const playable=soloed.length?soloed:state.tracks.filter(t=>!t.mute);

    for(const track of playable) {
      if(track.mute&&!track.solo) continue;
      state.engine.playBuffer(track.buffer,{
        gain:track.gain,
        pan:track.pan,
        loop:track.loop
      });
    }
  }

  function updateFxLabels() {
    setText("fx-filter-frequency-out",`${$("fx-filter-frequency").value} Hz`);
    setText("fx-filter-q-out",Number($("fx-filter-q").value).toFixed(1));
    setText("fx-drive-out",$("fx-drive").value);
    setText("fx-delay-out",`${Number($("fx-delay").value).toFixed(2)} s`);
    setText("fx-feedback-out",Number($("fx-feedback").value).toFixed(2));
    setText("fx-wet-out",Number($("fx-wet").value).toFixed(2));
    setText("fx-master-out",Number($("fx-master").value).toFixed(2));
    applyFx();
  }

  function startAnalysisLoop() {
    const ctx=state.engine.ensure();
    const analyser=state.engine.analyser;
    const time=new Uint8Array(analyser.fftSize);
    const freq=new Uint8Array(analyser.frequencyBinCount);

    const tick=()=>{
      AudioLabVisuals.drawAnalyserWave($("analysis-wave"),analyser,time);
      AudioLabVisuals.drawAnalyserSpectrum($("analysis-spectrum"),analyser,freq);

      let peak=0,sum=0;
      analyser.getByteTimeDomainData(time);
      for(const b of time) {
        const v=(b-128)/128;
        peak=Math.max(peak,Math.abs(v));
        sum+=v*v;
      }

      setText("analysis-fft",analyser.fftSize);
      setText("analysis-samplerate",`${ctx.sampleRate} Hz`);
      setText("analysis-peak",peak.toFixed(4));
      setText("analysis-rms",Math.sqrt(sum/time.length).toFixed(4));

      state.raf=requestAnimationFrame(tick);
    };
    tick();
  }

  function stopAnalysisLoop() {
    if(state.raf) cancelAnimationFrame(state.raf);
    state.raf=null;
  }

  function setupRecorder() {
    state.recorder.onState=info=>{
      if(info.state==="recording") {
        setText("record-status",`RECORDING\n${info.duration.toFixed(1)} s`);
        $("record-start").disabled=true;
        $("record-stop").disabled=false;
        $("record-download").disabled=true;
        setText("status-mic","MIC: RECORDING");
        $("status-mic").className="runtime-badge ok";
      } else if(info.state==="ready") {
        setText("record-status",`READY\n${info.duration.toFixed(1)} s`);
        $("record-start").disabled=false;
        $("record-stop").disabled=true;
        $("record-download").disabled=false;

        if(state.recordingUrl) URL.revokeObjectURL(state.recordingUrl);
        state.recordingUrl=URL.createObjectURL(info.blob);
        $("record-preview").src=state.recordingUrl;

        setText("record-log",
          `Recording ready.\n`+
          `MIME: ${info.blob.type}\n`+
          `Bytes: ${info.blob.size.toLocaleString()}\n`+
          `Duration: ${info.duration.toFixed(3)} s`
        );
      }
    };
  }

  async function prepareRenderFile(file) {
    state.renderFile=file;
    state.renderBuffer=await state.engine.decode(file);
    $("render-start").value="0";
    $("render-end").value=state.renderBuffer.duration.toFixed(3);

    const metrics=AudioLabDSP.analyzeChannelData(
      Array.from({length:state.renderBuffer.numberOfChannels},(_,i)=>state.renderBuffer.getChannelData(i))
    );

    setText("render-output",
      `Loaded: ${file.name}\n`+
      `Duration: ${state.renderBuffer.duration.toFixed(3)} s\n`+
      `Sample rate: ${state.renderBuffer.sampleRate} Hz\n`+
      `Channels: ${state.renderBuffer.numberOfChannels}\n`+
      `Peak: ${metrics.peak.toFixed(6)}\n`+
      `RMS: ${metrics.rms.toFixed(6)}`
    );
  }

  function runOfflineRender() {
    if(!state.renderBuffer||!state.renderFile) throw new Error("Select a source audio file first.");

    const result=AudioLabDSP.processBuffer(state.renderBuffer,{
      start:$("render-start").value,
      end:$("render-end").value,
      normalize:$("render-normalize").checked,
      peakDb:$("render-peak").value,
      fadeIn:$("render-fadein").value,
      fadeOut:$("render-fadeout").value
    });

    const blob=AudioLabDSP.wavBlob(result.channels,result.sampleRate);
    downloadBlob(
      blob,
      `${state.renderFile.name.replace(/\.[^.]+$/,"")}-audiolab.wav`
    );

    setText("render-output",
      `${$("render-output").textContent}\n\n`+
      `Rendered WAV:\n`+
      `Start: ${result.start.toFixed(3)} s\n`+
      `End: ${result.end.toFixed(3)} s\n`+
      `Gain: ${result.gain.toFixed(6)}\n`+
      `Output bytes: ${blob.size.toLocaleString()}`
    );
  }

  function setupDropzone() {
    const dz=$("mixer-dropzone");
    ["dragenter","dragover"].forEach(name=>dz.addEventListener(name,e=>{
      e.preventDefault();
      dz.classList.add("dragover");
    }));
    ["dragleave","drop"].forEach(name=>dz.addEventListener(name,e=>{
      e.preventDefault();
      dz.classList.remove("dragover");
    }));
    dz.addEventListener("drop",e=>{
      addFiles([...e.dataTransfer.files].filter(f=>f.type.startsWith("audio/")||/\.(wav|mp3|ogg|flac|m4a|aac|opus)$/i.test(f.name)));
    });
  }

  function bind(id,event,fn) {
    const el=$(id);
    if(!el)return;
    el.addEventListener(event,async e=>{
      try{await fn(e);}
      catch(error){
        console.error(error);
        const target=id.startsWith("record")?$("record-log"):
          id.startsWith("render")?$("render-output"):null;
        if(target) target.textContent=`ERROR: ${error.message}`;
        else alert(error.message);
      }
    });
  }

  function bindEvents() {
    ["synth-wave","synth-frequency","synth-gain","synth-pan"].forEach(id=>{
      $(id).addEventListener(id==="synth-wave"?"change":"input",drawSynthPreview);
    });

    bind("synth-play","click",playSynth);
    bind("synth-stop","click",()=>state.engine.stopSynth());
    bind("synth-render","click",renderSynthWav);

    bind("mixer-files","change",async()=>{
      const files=[...$("mixer-files").files];
      $("mixer-files").value="";
      await addFiles(files);
    });

    bind("mixer-play","click",playMix);
    bind("mixer-stop","click",()=>state.engine.stopAll());
    bind("mixer-clear","click",()=>{
      state.engine.stopAll();
      state.tracks=[];
      renderTracks();
    });

    [
      "fx-filter-type","fx-filter-frequency","fx-filter-q",
      "fx-drive","fx-delay","fx-feedback","fx-wet","fx-master"
    ].forEach(id=>{
      $(id).addEventListener(id==="fx-filter-type"?"change":"input",updateFxLabels);
    });

    bind("record-start","click",()=>state.recorder.start());
    bind("record-stop","click",()=>state.recorder.stop());
    bind("record-download","click",()=>state.recorder.download());

    bind("render-file","change",async()=>{
      const file=$("render-file").files?.[0];
      if(file) await prepareRenderFile(file);
      $("render-file").value="";
    });

    bind("render-run","click",runOfflineRender);

    setupDropzone();

    document.querySelector('.mode-tab[data-mode="analysis"]')?.addEventListener("click",()=>{
      if(!state.raf) startAnalysisLoop();
    });
  }

  function exposeApi() {
    window.AudioLab=Object.freeze({
      version:"0.1.0-alpha-web",

      playTone(options={}) {
        applyFx();
        return state.engine.playSynth({
          wave:options.wave||"sine",
          frequency:options.frequency||440,
          gain:options.gain??.35,
          pan:options.pan??0
        });
      },

      stop() {
        state.engine.stopAll();
      },

      async addFiles(files) {
        await addFiles(files);
        return state.tracks.map(t=>({
          id:t.id,
          name:t.name,
          duration:t.duration,
          channels:t.channels,
          sampleRate:t.sampleRate
        }));
      },

      getTracks() {
        return state.tracks.map(t=>({
          id:t.id,
          name:t.name,
          duration:t.duration,
          channels:t.channels,
          sampleRate:t.sampleRate,
          gain:t.gain,
          pan:t.pan,
          mute:t.mute,
          solo:t.solo,
          loop:t.loop
        }));
      },

      getFx() {
        return fxSettings();
      },

      setFx(settings={}) {
        if(settings.filterType)$("fx-filter-type").value=settings.filterType;
        if(settings.filterFrequency!=null)$("fx-filter-frequency").value=settings.filterFrequency;
        if(settings.filterQ!=null)$("fx-filter-q").value=settings.filterQ;
        if(settings.drive!=null)$("fx-drive").value=settings.drive;
        if(settings.delay!=null)$("fx-delay").value=settings.delay;
        if(settings.feedback!=null)$("fx-feedback").value=settings.feedback;
        if(settings.wet!=null)$("fx-wet").value=settings.wet;
        if(settings.master!=null)$("fx-master").value=settings.master;
        updateFxLabels();
      },

      generateWav(options={}) {
        const generated=AudioLabDSP.generateSignal(
          options.wave||"sine",
          options.frequency||440,
          options.duration||1,
          options.sampleRate||48000,
          options.gain??.35
        );
        return AudioLabDSP.wavBlob(generated.channels,generated.sampleRate);
      },

      getState() {
        return {
          tracks:state.tracks.length,
          fx:fxSettings(),
          contextState:state.engine.ctx?.state||"not-created",
          sampleRate:state.engine.ctx?.sampleRate||null,
          recording:Boolean(state.recorder.recorder&&state.recorder.recorder.state==="recording")
        };
      }
    });
  }

  drawSynthPreview();
  renderTracks();
  updateFxLabels();
  setupRecorder();
  bindEvents();
  exposeApi();

  window.ZZXHooks?.emit("audiolab:ready",{version:"0.1.0-alpha-web"});
})();
