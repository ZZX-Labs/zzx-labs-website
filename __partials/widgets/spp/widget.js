// __partials/widgets/spp/widget.js
(function(){
  "use strict";
  const W=window,D=document,ID="spp";

  function q(root,sel){return root?root.querySelector(sel):null}
  function set(root,sel,value){const el=q(root,sel);if(el)el.textContent=String(value??"—")}
  function fmt(v,digits=0,minDigits=0){
    const n=Number(v);
    return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:minDigits,maximumFractionDigits:digits}):"—";
  }
  function pct01(v,digits=6){const n=Number(v);return Number.isFinite(n)?`${(n*100).toFixed(digits)}%`:"—"}
  function pct100(v,digits=3){const n=Number(v);return Number.isFinite(n)?`${n.toFixed(digits)}%`:"—"}
  function btc(v,digits=8){const n=Number(v);return Number.isFinite(n)?`${fmt(n,digits,digits)} BTC`:"—"}
  function sats(v,digits=2){const n=Number(v);return Number.isFinite(n)?`${fmt(n,digits)} sats`:"—"}
  function status(root,label,state){
    const el=q(root,"[data-spp-status]");
    if(el){el.textContent=label;el.setAttribute("data-status",state||"offline")}
  }

  async function ensureModules(core){
    const base=core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/spp";
    for(const [globalName,relative] of [
      ["ZZXSppConstants","js/constants.js"],
      ["ZZXSppDeps","js/deps.js"],
      ["ZZXSppModel","js/model.js"],
      ["ZZXSppProvider","js/provider.js"]
    ]){
      if(W[globalName])continue;
      const raw=`${base}/${relative}`;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
      await new Promise((done,fail)=>{
        const s=D.createElement("script");
        s.src=src;
        s.defer=true;
        s.addEventListener("load",done,{once:true});
        s.addEventListener("error",fail,{once:true});
        (D.head||D.documentElement).appendChild(s);
      });
      if(!W[globalName])throw new Error(`${relative} did not register ${globalName}`);
    }
  }

  function render(root,state){
    if(!state.snapshot)return;

    const m=W.ZZXSppModel.build({
      height:state.snapshot.height,
      issuedSats:state.snapshot.issued,
      populationModel:state.snapshot.populationModel,
      at:Date.now()
    });
    state.model=m;

    set(root,"[data-spp-current]",`${fmt(m.issuedSatsPerPerson,2)} sats/person`);
    set(root,"[data-spp-btc]",`${m.issuedBtcPerPerson.toFixed(8)} BTC`);
    set(root,"[data-spp-cap]",sats(m.nominalSatsPerPerson,2));
    set(root,"[data-spp-terminal]",sats(m.terminalSatsPerPerson,2));
    set(root,"[data-spp-remaining-person]",sats(m.remainingSatsPerPerson,2));

    set(root,"[data-spp-height]",fmt(m.height,0));
    set(root,"[data-spp-supply]",btc(m.issuedBtc,8));
    set(root,"[data-spp-remaining]",btc(m.remainingBtc,8));
    set(root,"[data-spp-progress]",pct01(m.progress,6));
    set(root,"[data-spp-terminal-supply]",`${fmt(W.ZZXSppConstants.terminalSupplyBtc,4,4)} BTC`);

    set(root,"[data-spp-pop]",fmt(m.population,0));
    set(root,"[data-spp-growth]",`${pct100(m.populationEstimate.annualGrowth*100,4)} / year`);
    set(root,"[data-spp-anchor]",`${m.populationEstimate.anchorYear} · ${fmt(state.snapshot.populationModel.anchorPopulation,0)}`);
    set(root,"[data-spp-pop-source]",`${state.snapshot.populationSource}${state.snapshot.populationLiveAnchor?" · live anchor":" · fallback anchor"}`);

    set(root,"[data-spp-people-issued-btc]",`${fmt(m.peoplePerIssuedBtc,2)} people / BTC`);
    set(root,"[data-spp-people-cap-btc]",`${fmt(m.peoplePerNominalBtc,2)} people / BTC`);
    set(root,"[data-spp-people-terminal-btc]",`${fmt(m.peoplePerTerminalBtc,2)} people / BTC`);
    set(root,"[data-spp-one-sat-share]",`${m.oneSatPopulationShare.toExponential(6)}% of one person`);

    set(root,"[data-spp-sub]",`height ${fmt(m.height,0)} · ${pct100(m.populationEstimate.annualGrowth*100,3)}/yr population model`);
    set(root,"[data-spp-meta]",`${state.snapshot.tipSource} · ${state.snapshot.populationSource} · consensus issuance cross-checked`);
    set(root,"[data-spp-updated]",`rendered ${new Date().toLocaleTimeString()}`);

    W.ZZXSppLatest={
      height:m.height,
      issued_sats:m.issuedSats.toString(),
      issued_btc:m.issuedBtc,
      remaining_sats:m.remainingSats.toString(),
      remaining_btc:m.remainingBtc,
      terminal_supply_sats:W.ZZXSppConstants.terminalSupplySats.toString(),
      terminal_supply_btc:W.ZZXSppConstants.terminalSupplyBtc,
      nominal_cap_sats:W.ZZXSppConstants.nominalCapSats.toString(),
      nominal_cap_btc:W.ZZXSppConstants.nominalCapBtc,
      population:m.population,
      population_source:state.snapshot.populationSource,
      population_live_anchor:state.snapshot.populationLiveAnchor,
      issued_sats_per_person:m.issuedSatsPerPerson,
      terminal_sats_per_person:m.terminalSatsPerPerson,
      nominal_sats_per_person:m.nominalSatsPerPerson,
      remaining_sats_per_person:m.remainingSatsPerPerson,
      issuance_progress:m.progress,
      rendered_at:Date.now()
    };
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected)return;
    state.busy=true;
    status(root,"refreshing","warn");

    const button=q(root,"[data-spp-refresh]");
    if(button)button.disabled=true;

    try{
      state.snapshot=await W.ZZXSppProvider.load(force);
      render(root,state);
      status(root,state.snapshot.populationLiveAnchor?"live":"modeled",state.snapshot.populationLiveAnchor?"ok":"warn");
    }catch(error){
      status(root,state.snapshot?"stale":"offline",state.snapshot?"warn":"error");
      set(root,"[data-spp-meta]",`error: ${String(error?.message||error)}`);
    }finally{
      state.busy=false;
      if(button)button.disabled=false;
    }
  }

  async function boot(root,core){
    if(!root)return;
    const state={core:core||W.ZZXWidgetsCore||null,snapshot:null,model:null,busy:false,refreshTimer:null,renderTimer:null};
    root.__zzxSppState=state;

    try{
      await ensureModules(state.core);

      const project=q(root,"[data-spp-project-link]");
      if(project&&W.ZZXAPI?.url)project.href=W.ZZXAPI.url(W.ZZXSppConstants.projectPath);

      q(root,"[data-spp-refresh]")?.addEventListener("click",()=>refresh(root,state,true));
      await refresh(root,state,false);

      function renderLoop(){
        if(!root.isConnected)return;
        render(root,state);
        state.renderTimer=W.setTimeout(renderLoop,W.ZZXSppConstants.populationTickMs);
      }
      state.renderTimer=W.setTimeout(renderLoop,W.ZZXSppConstants.populationTickMs);

      async function refreshLoop(){
        if(!root.isConnected)return;
        await refresh(root,state,false);
        state.refreshTimer=W.setTimeout(refreshLoop,W.ZZXSppConstants.refreshMs);
      }
      state.refreshTimer=W.setTimeout(refreshLoop,W.ZZXSppConstants.refreshMs);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-spp-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
