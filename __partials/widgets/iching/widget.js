// __partials/widgets/iching/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="iching";

  function q(root,selector){return root?root.querySelector(selector):null}
  function set(root,selector,value){const el=q(root,selector);if(el)el.textContent=String(value??"—")}

  function money(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2})
      : "—";
  }

  function btc(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? `${n.toLocaleString(undefined,{maximumFractionDigits:8})} BTC`
      : "—";
  }

  function sats(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? `${Math.round(n).toLocaleString()} sats`
      : "—";
  }

  function signedMoney(v){
    const n=Number(v);
    if(!Number.isFinite(n))return "—";
    const abs=Math.abs(n).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2});
    return `${n>=0?"+":"-"}${abs}`;
  }

  function signedPct(v){
    const n=Number(v);
    return Number.isFinite(n)?`${n>=0?"+":""}${n.toFixed(2)}%`:"—";
  }

  function tone(el,value){
    if(!el)return;
    const n=Number(value);
    el.setAttribute("data-tone",!Number.isFinite(n)?"flat":n>0?"up":n<0?"down":"flat");
  }

  function status(root,label,state){
    const el=q(root,"[data-ich-status]");
    if(el){el.textContent=label;el.setAttribute("data-status",state||"offline")}
  }

  function validDateInput(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
    const ms=Date.parse(`${date}T00:00:00Z`);
    if(!Number.isFinite(ms))return false;
    const min=Date.parse(`${W.ZZXIChingConstants.earliestDate}T00:00:00Z`);
    const tomorrow=Date.now()+86400000;
    return ms>=min&&ms<tomorrow;
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/iching";

    for(const [globalName,relative] of [
      ["ZZXIChingConstants","js/constants.js"],
      ["ZZXIChingDeps","js/deps.js"],
      ["ZZXIChingStorage","js/storage.js"],
      ["ZZXIChingModel","js/model.js"],
      ["ZZXIChingProvider","js/provider.js"],
      ["ZZXIChingExport","js/export.js"]
    ]){
      if(W[globalName])continue;
      const raw=`${base}/${relative}`;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;

      await new Promise((resolve,reject)=>{
        const script=D.createElement("script");
        script.src=src;
        script.defer=true;
        script.addEventListener("load",resolve,{once:true});
        script.addEventListener("error",reject,{once:true});
        (D.head||D.documentElement).appendChild(script);
      });

      if(!W[globalName])throw new Error(`${relative} did not register ${globalName}`);
    }
  }

  function renderLots(root,state){
    const body=q(root,"[data-ich-lots]");
    if(!body)return;
    body.replaceChildren();

    const ordered=[...state.lots].sort((a,b)=>{
      const d=String(b.date).localeCompare(String(a.date));
      return d||String(b.addedAt).localeCompare(String(a.addedAt));
    });

    for(const lot of ordered){
      const tr=D.createElement("tr");
      const m=W.ZZXIChingModel.lotMetrics(lot,state.currentPrice);

      const values=[
        lot.date,
        money(lot.usd),
        money(lot.historicalPrice),
        btc(lot.btc),
        money(m.value),
        signedPct(m.returnPct)
      ];

      values.forEach((value,index)=>{
        const td=D.createElement("td");
        td.textContent=value;
        if(index===0)td.title=`historical source: ${lot.source}`;
        if(index===5)td.setAttribute("data-tone",Number.isFinite(m.returnPct)?(m.returnPct>=0?"up":"down"):"flat");
        tr.appendChild(td);
      });

      const actions=D.createElement("td");
      const button=D.createElement("button");
      button.type="button";
      button.className="iching__delete";
      button.textContent="×";
      button.title="Delete lot";
      button.setAttribute("aria-label",`Delete lot from ${lot.date}`);
      button.dataset.ichDelete=lot.id;
      actions.appendChild(button);
      tr.appendChild(actions);
      body.appendChild(tr);
    }
  }

  function render(root,state){
    const model=W.ZZXIChingModel.portfolio(state.lots,state.currentPrice);

    set(root,"[data-ich-value]",money(model.value));
    set(root,"[data-ich-current]",Number.isFinite(state.currentPrice)
      ? `BTC ${money(state.currentPrice)} · ${state.currentPriceSource||"current source"}`
      : "BTC/USD unavailable");

    set(root,"[data-ich-btc]",btc(model.btc));
    set(root,"[data-ich-cost]",money(model.cost));
    set(root,"[data-ich-average]",money(model.average));

    const ret=q(root,"[data-ich-return]");
    if(ret){ret.textContent=signedPct(model.returnPct);tone(ret,model.returnPct)}

    const gain=q(root,"[data-ich-gain]");
    if(gain){gain.textContent=signedMoney(model.gain);tone(gain,model.gain)}

    set(root,"[data-ich-sats]",sats(model.sats));
    set(root,"[data-ich-count]",String(model.lotCount));
    set(root,"[data-ich-spot]",money(state.currentPrice));

    set(root,"[data-ich-meta]",
      state.lots.length
        ? `${state.lots.length} lot${state.lots.length===1?"":"s"} · stored only in this browser`
        : "No lots yet · stored only in this browser."
    );

    set(root,"[data-ich-updated]",
      Number.isFinite(state.currentPrice)
        ? `spot updated ${new Date(state.currentPriceAt).toLocaleTimeString()}`
        : "spot not loaded"
    );

    renderLots(root,state);

    W.ZZXIChingLatest={
      lots:state.lots.map(lot=>({...lot})),
      current_price_usd:Number(state.currentPrice),
      current_price_source:state.currentPriceSource,
      current_price_at:state.currentPriceAt,
      portfolio:{
        btc:model.btc,
        sats:model.sats,
        cost_usd:model.cost,
        value_usd:model.value,
        average_acquisition_usd:model.average,
        gain_usd:model.gain,
        return_percent:model.returnPct
      }
    };
  }

  async function refreshPrice(root,state){
    if(state.priceBusy||!root.isConnected)return;
    state.priceBusy=true;
    status(root,"refreshing","warn");

    const button=q(root,"[data-ich-refresh]");
    if(button)button.disabled=true;

    try{
      const result=await W.ZZXIChingProvider.currentPrice();
      state.currentPrice=result.price;
      state.currentPriceSource=result.source;
      state.currentPriceAt=Date.now();
      render(root,state);
      status(root,"live","ok");
    }catch(error){
      status(root,Number.isFinite(state.currentPrice)?"stale":"offline",Number.isFinite(state.currentPrice)?"warn":"error");
      set(root,"[data-ich-meta]",`current price error: ${String(error?.message||error)}`);
    }finally{
      state.priceBusy=false;
      if(button)button.disabled=false;
    }
  }

  async function addLot(root,state){
    if(state.addBusy)return;

    const date=String(q(root,"[data-ich-date]")?.value||"");
    const usdAmount=Number(q(root,"[data-ich-usd]")?.value);

    if(!validDateInput(date)){
      set(root,"[data-ich-meta]",`Choose a valid date from ${W.ZZXIChingConstants.earliestDate} through today.`);
      return;
    }

    if(!(Number.isFinite(usdAmount)&&usdAmount>0)){
      set(root,"[data-ich-meta]","Enter a USD amount greater than zero.");
      return;
    }

    state.addBusy=true;
    status(root,"resolving","warn");
    const addButton=q(root,"[data-ich-add]");
    if(addButton)addButton.disabled=true;
    set(root,"[data-ich-meta]",`Resolving historical BTC/USD for ${date}…`);

    try{
      const historical=await W.ZZXIChingProvider.historicalPrice(date,false);
      const acquired=usdAmount/historical.price;
      if(!(Number.isFinite(acquired)&&acquired>0))throw new Error("computed BTC amount is invalid");

      const lot={
        id:W.ZZXIChingStorage.id(),
        date,
        usd:usdAmount,
        historicalPrice:historical.price,
        btc:acquired,
        source:historical.source,
        addedAt:new Date().toISOString()
      };

      const next=[...state.lots,lot];
      if(next.length>W.ZZXIChingConstants.maxLots)throw new Error(`lot limit ${W.ZZXIChingConstants.maxLots} reached`);

      const saved=W.ZZXIChingStorage.save(next);
      if(!saved.ok)throw new Error(`browser storage failed: ${saved.error||"unknown error"}`);

      state.lots=saved.lots;
      render(root,state);
      status(root,"live","ok");
      set(root,"[data-ich-lot-source]",`${date}: ${money(historical.price)} · ${historical.source}`);
    }catch(error){
      status(root,"error","error");
      set(root,"[data-ich-meta]",`historical price error: ${String(error?.message||error)}`);
    }finally{
      state.addBusy=false;
      if(addButton)addButton.disabled=false;
    }
  }

  function deleteLot(root,state,id){
    const saved=W.ZZXIChingStorage.save(state.lots.filter(lot=>lot.id!==id));
    if(!saved.ok){
      set(root,"[data-ich-meta]",`delete failed: ${saved.error||"browser storage unavailable"}`);
      return;
    }
    state.lots=saved.lots;
    render(root,state);
  }

  function clearAll(root,state){
    if(!state.lots.length)return;
    if(!W.confirm(`Delete all ${state.lots.length} locally stored I-Ching lot${state.lots.length===1?"":"s"}?`))return;

    if(!W.ZZXIChingStorage.clear()){
      set(root,"[data-ich-meta]","Could not clear browser storage.");
      return;
    }
    state.lots=[];
    render(root,state);
  }

  function downloadFile(filename,mime,data){
    const blob=data instanceof Uint8Array
      ? new Blob([data],{type:mime})
      : new Blob([String(data)],{type:mime});

    const url=URL.createObjectURL(blob);
    const a=D.createElement("a");
    a.href=url;
    a.download=filename;
    a.click();
    W.setTimeout(()=>URL.revokeObjectURL(url),0);
  }

  async function exportLots(root,state){
    if(state.exportBusy)return;
    state.exportBusy=true;

    const button=q(root,"[data-ich-export]");
    if(button)button.disabled=true;

    try{
      if(!Number.isFinite(state.currentPrice)){
        await refreshPrice(root,state);
      }

      if(!Number.isFinite(state.currentPrice)){
        throw new Error("live BTC/USD is unavailable; cannot create appreciation report");
      }

      const snapshot=W.ZZXIChingExport.buildSnapshot(state);
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      const base=`iching-bitcoin-appreciation-${stamp}`;
      const format=String(q(root,"[data-ich-export-format]")?.value||"json").toLowerCase();

      if(format==="json"){
        downloadFile(`${base}.json`,"application/json",W.ZZXIChingExport.jsonText(snapshot));
      }else if(format==="txt"){
        downloadFile(`${base}.txt`,"text/plain;charset=utf-8",W.ZZXIChingExport.textReport(snapshot));
      }else if(format==="pdf"){
        downloadFile(`${base}.pdf`,"application/pdf",W.ZZXIChingExport.makePdf(snapshot));
      }else{
        throw new Error(`unsupported export format: ${format}`);
      }

      set(
        root,
        "[data-ich-meta]",
        `Exported ${format.toUpperCase()} appreciation report for ${snapshot.lot_count} lot${snapshot.lot_count===1?"":"s"}.`
      );
    }catch(error){
      status(root,"error","error");
      set(root,"[data-ich-meta]",`export error: ${String(error?.message||error)}`);
    }finally{
      state.exportBusy=false;
      if(button)button.disabled=false;
    }
  }

  async function importLots(root,state,file){
    if(!file)return;

    try{
      const parsed=JSON.parse(await file.text());
      const sourceLots=Array.isArray(parsed)?parsed:parsed?.lots;
      const imported=W.ZZXIChingStorage.normalizeLots(sourceLots);

      if(!imported.length&&Array.isArray(sourceLots)&&sourceLots.length){
        throw new Error("no valid lots found in import");
      }

      const merged=new Map(state.lots.map(lot=>[lot.id,lot]));
      for(const lot of imported)merged.set(lot.id,lot);

      const combined=[...merged.values()].slice(0,W.ZZXIChingConstants.maxLots);
      const saved=W.ZZXIChingStorage.save(combined);
      if(!saved.ok)throw new Error(saved.error||"browser storage unavailable");

      state.lots=saved.lots;
      render(root,state);
      status(root,"live","ok");
      set(root,"[data-ich-meta]",`Imported ${imported.length} valid lot${imported.length===1?"":"s"} · ${state.lots.length} total.`);
    }catch(error){
      status(root,"error","error");
      set(root,"[data-ich-meta]",`import error: ${String(error?.message||error)}`);
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      lots:[],
      currentPrice:NaN,
      currentPriceSource:"",
      currentPriceAt:0,
      priceBusy:false,
      addBusy:false,
      exportBusy:false,
      timer:null
    };
    root.__zzxIChingState=state;

    try{
      await ensureModules(core||W.ZZXWidgetsCore||null);
      await W.ZZXIChingDeps.ensureShared();
      state.lots=W.ZZXIChingStorage.load();

      const date=q(root,"[data-ich-date]");
      const today=new Date();
      const max=today.toISOString().slice(0,10);

      if(date){
        date.max=max;
        date.min=W.ZZXIChingConstants.earliestDate;
        if(!date.value){
          const defaultDate=new Date(Date.now()-365*24*60*60*1000);
          date.value=defaultDate.toISOString().slice(0,10);
        }
      }

      const project=q(root,"[data-ich-project-link]");
      if(project&&W.ZZXAPI?.url)project.href=W.ZZXAPI.url(W.ZZXIChingConstants.projectPath);

      q(root,"[data-ich-add]")?.addEventListener("click",()=>addLot(root,state));
      q(root,"[data-ich-usd]")?.addEventListener("keydown",event=>{
        if(event.key==="Enter"){event.preventDefault();addLot(root,state)}
      });
      q(root,"[data-ich-refresh]")?.addEventListener("click",()=>refreshPrice(root,state));
      q(root,"[data-ich-clear]")?.addEventListener("click",()=>clearAll(root,state));
      q(root,"[data-ich-export]")?.addEventListener("click",()=>exportLots(root,state));
      q(root,"[data-ich-import]")?.addEventListener("click",()=>q(root,"[data-ich-import-file]")?.click());

      q(root,"[data-ich-import-file]")?.addEventListener("change",async event=>{
        const file=event.currentTarget.files?.[0]||null;
        await importLots(root,state,file);
        event.currentTarget.value="";
      });

      q(root,"[data-ich-lots]")?.addEventListener("click",event=>{
        const button=event.target.closest("[data-ich-delete]");
        if(button)deleteLot(root,state,button.dataset.ichDelete);
      });

      render(root,state);
      await refreshPrice(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refreshPrice(root,state);
        state.timer=W.setTimeout(loop,W.ZZXIChingConstants.refreshMs);
      }
      state.timer=W.setTimeout(loop,W.ZZXIChingConstants.refreshMs);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-ich-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
