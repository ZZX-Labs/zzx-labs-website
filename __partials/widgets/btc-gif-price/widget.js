(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="btc-gif-price";
  const AUTO_KEY="zzx.widget.btc-gif-price.auto.v3";
  const SIGNAL_REFRESH_MS=2500;

  const MODULES=Object.freeze([
    {global:"ZZXBTCGifPriceTelemetry",path:"js/telemetry.js",version:2},
    {global:"ZZXBTCGifPriceConditions",path:"js/conditions.js",version:2},
    {global:"ZZXBTCGifPriceRenderer",path:"js/renderer.js",version:3}
  ]);

  function q(root,selector){
    return root?.querySelector?.(selector)||null;
  }
  function set(root,selector,value){
    const el=q(root,selector);
    if(el)el.textContent=value==null?"—":String(value);
  }
  function finite(v){
    const n=Number(v);
    return Number.isFinite(n)?n:NaN;
  }
  function safeGet(key){
    try{return W.localStorage.getItem(key)}catch(_){return null}
  }
  function safeSet(key,value){
    try{W.localStorage.setItem(key,String(value))}catch(_){}
  }
  function status(root,label,state){
    const el=q(root,"[data-gif-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }
  function widgetBase(core){
    return core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : `/__partials/widgets/${ID}`;
  }
  function assetURL(base,relative){
    const raw=`${base}/${String(relative||"").replace(/^\/+/, "")}`;
    return W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
  }
  async function localJSON(url){
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(url,{
        cacheBust:false,
        timeoutMs:8000,
        retries:1
      });
    }
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
    return await r.json();
  }
  function moduleVersion(name){
    return Number(W[name]?.__version||0);
  }
  async function ensureModules(core){
    const base=widgetBase(core);
    for(const spec of MODULES){
      if(moduleVersion(spec.global)>=spec.version)continue;
      let src=assetURL(base,spec.path);
      try{
        const u=new URL(src,W.location.href);
        u.searchParams.set("gifdep",String(spec.version));
        src=u.href;
      }catch(_){}

      await new Promise((resolve,reject)=>{
        const existing=[...D.scripts].find(s=>s.src===src);
        if(existing){
          if(moduleVersion(spec.global)>=spec.version)return resolve();
          existing.addEventListener("load",resolve,{once:true});
          existing.addEventListener("error",reject,{once:true});
          W.setTimeout(resolve,1200);
          return;
        }
        const script=D.createElement("script");
        script.src=src;
        script.defer=true;
        script.dataset.gifDependency=spec.global;
        script.addEventListener("load",resolve,{once:true});
        script.addEventListener("error",reject,{once:true});
        (D.head||D.documentElement).appendChild(script);
      });

      if(moduleVersion(spec.global)<spec.version){
        throw new Error(`${spec.path} did not register compatible ${spec.global}`);
      }
    }
  }

  function conditionSummary(result){
    const c=result?.categories||{};
    return [
      `P:${c.price||"?"}`,
      `V:${c.volume||"?"}`,
      `MP:${c.mempool||"?"}`,
      `F:${c.fees||"?"}`,
      `HR:${c.hashrate||"?"}`,
      `LN:${c.lightning||"?"}`
    ].join(" · ");
  }

  function poolSize(state){
    const id=state.condition?.winner?.id||"neutral";
    return W.ZZXBTCGifPriceConditions.pool(state.library,id).length;
  }

  function choose(root,state,{force=false}={}){
    if(!state.condition||!state.library)return;
    const id=state.condition.winner?.id||"neutral";
    const item=W.ZZXBTCGifPriceConditions.pick(
      state.library,
      id,
      force?state.item?.id:null
    );
    if(!item)return;

    state.item=item;
    const img=q(root,"[data-gif-image]");
    if(img){
      img.onload=()=>{
        set(root,"[data-gif-name]",item.id||"GIF");
        const canvas=q(root,"[data-gif-canvas]");
        if(canvas){
          canvas.setAttribute(
            "aria-label",
            `${state.condition.winner?.label||id} Bitcoin GIF · ${item.id||"GIF"}`
          );
        }
      };
      img.src=assetURL(state.base,item.src);
    }

    set(
      root,
      "[data-gif-pool]",
      `${poolSize(state)} GIF${poolSize(state)===1?"":"s"}`
    );
  }

  function renderMeta(root,state){
    const winner=state.condition?.winner;
    set(root,"[data-gif-condition]",winner?.label||winner?.id||"Neutral");
    set(root,"[data-gif-signals]",conditionSummary(state.condition));
    set(root,"[data-gif-pool]",`${poolSize(state)} GIF${poolSize(state)===1?"":"s"}`);
    set(
      root,
      "[data-gif-source]",
      `${state.telemetry?.source||"ZZX BPI"} · ${(state.telemetry?.availability||[]).join("+")||"partial"}`
    );
    set(
      root,
      "[data-gif-updated]",
      `updated ${new Date(state.telemetry?.fetchedAt||Date.now()).toLocaleTimeString()}`
    );
  }

  async function refreshSignals(root,state,{force=false}={}){
    if(state.busy||!root.isConnected)return;
    state.busy=true;
    try{
      const previous=state.condition?.winner?.id||null;
      state.telemetry=await W.ZZXBTCGifPriceTelemetry.load(state.core,{force});
      state.condition=W.ZZXBTCGifPriceConditions.evaluate(state.telemetry,state.policy);
      const current=state.condition?.winner?.id||"neutral";

      renderMeta(root,state);

      if(!state.item||current!==previous){
        choose(root,state,{force:true});
      }

      const available=state.telemetry?.availability?.length||0;
      status(
        root,
        available>=3?"live":available>0?"partial":"offline",
        available>=3?"ok":available>0?"warn":"error"
      );
    }catch(error){
      status(root,state.telemetry?"stale":"offline",state.telemetry?"warn":"error");
      set(root,"[data-gif-source]",String(error?.message||error));
    }finally{
      state.busy=false;
    }
  }

  function scheduleAuto(root,state){
    if(state.autoTimer)W.clearTimeout(state.autoTimer);
    state.autoTimer=null;
    const seconds=finite(q(root,"[data-gif-auto]")?.value);
    if(!(seconds>0))return;
    state.autoTimer=W.setTimeout(()=>{
      if(!root.isConnected)return;
      choose(root,state,{force:true});
      scheduleAuto(root,state);
    },seconds*1000);
  }

  function animationLoop(root,state){
    if(!root.isConnected)return;
    const canvas=q(root,"[data-gif-canvas]");
    const img=q(root,"[data-gif-image]");
    if(!D.hidden){
      W.ZZXBTCGifPriceRenderer?.draw?.(
        canvas,
        img
        , state.telemetry, state.condition
      );
    }
    state.raf=W.requestAnimationFrame(()=>animationLoop(root,state));
  }

  function destroyOld(root){
    const old=root.__zzxBTCGifPriceState;
    if(!old)return;
    if(old.raf)W.cancelAnimationFrame(old.raf);
    if(old.autoTimer)W.clearTimeout(old.autoTimer);
    if(old.signalTimer)W.clearTimeout(old.signalTimer);
    old.abortController?.abort?.();
  }

  async function boot(root,core){
    if(!root)return;
    destroyOld(root);

    const abortController=typeof AbortController==="function"?new AbortController():null;
    const options=abortController?{signal:abortController.signal}:undefined;
    const state={
      core:core||W.ZZXWidgetsCore||null,
      base:"",
      library:null,
      policy:null,
      telemetry:null,
      condition:null,
      item:null,
      busy:false,
      raf:0,
      autoTimer:null,
      signalTimer:null,
      abortController
    };
    root.__zzxBTCGifPriceState=state;

    try{
      state.base=widgetBase(state.core);
      await ensureModules(state.core);

      [state.library,state.policy]=await Promise.all([
        localJSON(assetURL(state.base,"gifs.json")),
        localJSON(assetURL(state.base,"conditions.json"))
      ]);

      if(!Array.isArray(state.library?.items)||!state.library.items.length){
        throw new Error("widget-local GIF library is empty");
      }

      const auto=q(root,"[data-gif-auto]");
      const saved=safeGet(AUTO_KEY);
      if(auto&&saved&&[...auto.options].some(o=>o.value===saved))auto.value=saved;

      q(root,"[data-gif-random]")?.addEventListener(
        "click",
        ()=>choose(root,state,{force:true}),
        options
      );

      q(root,"[data-gif-refresh]")?.addEventListener(
        "click",
        ()=>refreshSignals(root,state,{force:true}),
        options
      );

      auto?.addEventListener(
        "change",
        ()=>{
          safeSet(AUTO_KEY,auto.value);
          scheduleAuto(root,state);
        },
        options
      );

      await refreshSignals(root,state,{force:true});
      scheduleAuto(root,state);
      animationLoop(root,state);

      async function signalLoop(){
        if(!root.isConnected||abortController?.signal?.aborted)return;
        await refreshSignals(root,state);
        state.signalTimer=W.setTimeout(signalLoop,SIGNAL_REFRESH_MS);
      }
      state.signalTimer=W.setTimeout(signalLoop,SIGNAL_REFRESH_MS);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-gif-source]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
