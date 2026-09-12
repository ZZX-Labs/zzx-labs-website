// __partials/widgets/difficulty-adjustment/widget.js
(function () {
  "use strict";

  const W = window, D = document, ID = "difficulty-adjustment";

  function q(r,s){ return r ? r.querySelector(s) : null; }
  function n(v){ const x=Number(v); return Number.isFinite(x)?x:NaN; }

  function pct(v){
    const x=n(v);
    return Number.isFinite(x)?`${x>=0?"+":""}${x.toFixed(2)}%`:"—";
  }

  function dur(ms){
    const x=n(ms);
    if(!Number.isFinite(x) || x<0) return "—";

    const total=Math.max(0,Math.round(x/1000));
    const d=Math.floor(total/86400);
    const h=Math.floor((total%86400)/3600);
    const m=Math.floor((total%3600)/60);

    return d?`${d}d ${h}h`:h?`${h}h ${m}m`:`${m}m`;
  }

  function formatRetarget(ms){
    const x=n(ms);
    if(!Number.isFinite(x)) return "—";

    const date=new Date(x);
    if(!Number.isFinite(date.getTime())) return "—";

    return date.toLocaleString(undefined,{
      year:"numeric",
      month:"numeric",
      day:"numeric",
      hour:"numeric",
      minute:"2-digit"
    });
  }

  function status(root,label,state){
    const el=q(root,"[data-da-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensure(core){
    if(Number(W.ZZXDifficultyProvider?.__version||0)>=2 && W.ZZXDifficultyProvider?.load){
      return;
    }

    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/difficulty-adjustment";

    const raw=`${base}/js/provider.js`;
    const resolved=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
    const src=`${resolved}${resolved.includes("?")?"&":"?"}zzxmod=2`;

    await new Promise((resolve,reject)=>{
      const s=D.createElement("script");
      s.src=src;
      s.defer=true;
      s.addEventListener("load",resolve,{once:true});
      s.addEventListener("error",reject,{once:true});
      (D.head||D.documentElement).appendChild(s);
    });

    if(Number(W.ZZXDifficultyProvider?.__version||0)<2){
      throw new Error("Difficulty provider v2 failed to load");
    }
  }

  function render(root,result){
    const data=result?.data||{};
    const base=result?.base||"configured mempool API";

    const change=n(data.difficultyChangePercent);
    const progress=n(data.progressPercent);
    const remaining=n(data.remainingBlocks);
    const completed=n(data.completedBlocks);
    const time=n(data.remainingTimeMs);
    const retarget=n(data.estimatedRetargetMs);
    const previous=n(data.previousRetargetPercent);

    const changeEl=q(root,"[data-da-change]");
    if(changeEl){
      changeEl.textContent=pct(change);
      changeEl.setAttribute(
        "data-tone",
        Number.isFinite(change)
          ? (change<0?"down":change>0?"up":"flat")
          : "unknown"
      );
    }

    const safeProgress=Number.isFinite(progress)
      ? Math.max(0,Math.min(100,progress))
      : NaN;

    const progressLabel=q(root,"[data-da-progress-label]");
    if(progressLabel){
      progressLabel.textContent=Number.isFinite(safeProgress)
        ? `epoch progress ${safeProgress.toFixed(2)}%`
        : "epoch progress —";
    }

    const blockLabel=q(root,"[data-da-blocks]");
    if(blockLabel){
      blockLabel.textContent=Number.isFinite(completed)
        ? `${Math.round(completed).toLocaleString()} / 2,016 blocks`
        : "—";
    }

    const track=q(root,"[data-da-progress]");
    if(track){
      track.setAttribute(
        "aria-valuenow",
        Number.isFinite(safeProgress)?String(safeProgress.toFixed(2)):"0"
      );
    }

    const bar=q(root,"[data-da-bar]");
    if(bar){
      bar.style.width=Number.isFinite(safeProgress)?`${safeProgress}%`:"0%";
    }

    const remainingEl=q(root,"[data-da-remaining]");
    if(remainingEl){
      remainingEl.textContent=Number.isFinite(remaining)
        ? `${Math.round(remaining).toLocaleString()} blocks`
        : "—";
    }

    const timeEl=q(root,"[data-da-time]");
    if(timeEl) timeEl.textContent=dur(time);

    const retargetEl=q(root,"[data-da-retarget]");
    if(retargetEl){
      retargetEl.textContent=formatRetarget(retarget);
      retargetEl.setAttribute(
        "data-tone",
        data.retargetSanity==="valid"
          ? "up"
          : data.retargetSanity==="derived"
            ? "warn"
            : "down"
      );
      retargetEl.title=data.retargetNote||"";
    }

    const previousEl=q(root,"[data-da-previous]");
    if(previousEl){
      previousEl.textContent=Number.isFinite(previous)?pct(previous):"—";
      previousEl.setAttribute(
        "data-tone",
        Number.isFinite(previous)
          ? (previous<0?"down":previous>0?"up":"warn")
          : "warn"
      );
    }

    const meta=q(root,"[data-da-meta]");
    if(meta){
      const source=String(base).replace(/^https?:\/\//,"");
      const retargetMode=data.retargetSanity==="derived"
        ? "retarget derived from remaining time"
        : data.retargetSanity==="valid"
          ? "retarget timestamp verified"
          : "retarget unavailable";

      meta.textContent=
        `${source} · ${retargetMode} · refreshed ${new Date().toLocaleTimeString()}`;
    }

    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      const result=await W.ZZXDifficultyProvider.load(state.core);
      render(root,result);
      state.lastGood=true;
    }catch(error){
      status(root,state.lastGood?"stale":"offline",state.lastGood?"warn":"error");

      const meta=q(root,"[data-da-meta]");
      if(meta) meta.textContent=String(error?.message||error);
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    const state={
      core:core||W.ZZXWidgetsCore||null,
      busy:false,
      timer:null,
      lastGood:false
    };

    root.__zzxDifficultyState=state;

    try{
      await ensure(state.core);

      q(root,"[data-da-refresh]")?.addEventListener("click",async()=>{
        await refresh(root,state);
      });

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        if(root.isConnected) state.timer=W.setTimeout(loop,60000);
      }

      state.timer=W.setTimeout(loop,60000);
    }catch(error){
      status(root,"offline","error");
      const meta=q(root,"[data-da-meta]");
      if(meta) meta.textContent=String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
})();
