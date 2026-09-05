// __partials/widgets/hashrate-by-nation/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="hashrate-by-nation";

  function q(root,sel){return root?root.querySelector(sel):null}

  function pct(v){
    const n=Number(v);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function status(root,label,state){
    const el=q(root,"[data-hbn-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/hashrate-by-nation";

    for(const [globalName,relative] of [
      ["ZZXHashrateNationModel","js/model.js"],
      ["ZZXHashrateNationProvider","js/provider.js"],
      ["ZZXHashrateNationChart","js/chart.js"]
    ]){
      if(W[globalName])continue;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(`${base}/${relative}`):`${base}/${relative}`;
      await new Promise((resolve,reject)=>{
        const s=D.createElement("script");
        s.src=src;s.defer=true;
        s.onload=resolve;s.onerror=reject;
        (D.head||D.documentElement).appendChild(s);
      });
    }
  }

  function draw(root,state){
    if(!state.result)return;
    W.ZZXHashrateNationChart.draw(
      q(root,"[data-hbn-canvas]"),
      state.result.model.rows
    );
  }

  function renderTable(root,state){
    const body=q(root,"[data-hbn-body]");
    body.replaceChildren();

    const rows=state.result.model.rows;

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className="hashrate-by-nation__empty";
      empty.textContent="No geographic allocation rows.";
      body.appendChild(empty);
      return;
    }

    rows.forEach((row,index)=>{
      const line=D.createElement("div");
      line.className="hashrate-by-nation__row";
      line.setAttribute("role","row");

      const basis=row.source||row.basis||state.result.model.mode;
      const values=[
        String(index+1),
        `${row.name||row.iso} (${row.iso})`,
        pct(row.share),
        `${row.estimatedEH.toFixed(2)} EH/s`,
        basis
      ];

      values.forEach((value,i)=>{
        const cell=D.createElement("div");
        cell.setAttribute("role","cell");
        if(i===2||i===3)cell.classList.add("hashrate-by-nation__num");
        cell.textContent=value;
        line.appendChild(cell);
      });

      body.appendChild(line);
    });
  }

  function render(root,state){
    const r=state.result;
    const m=r.model;

    q(root,"[data-hbn-mode]").textContent=m.mode;
    q(root,"[data-hbn-global]").textContent=`${m.globalEH.toFixed(2)} EH/s`;
    q(root,"[data-hbn-count]").textContent=String(m.rows.length);
    q(root,"[data-hbn-share]").textContent=pct(m.shownShare);
    q(root,"[data-hbn-other]").textContent=pct(m.unallocatedShare);

    q(root,"[data-hbn-sub]").textContent=
      m.mode==="node-geography proxy"
        ? "proxy only: node-country distribution is not measured mining-country distribution"
        : "local mining-share estimates scaled to current global hashrate";

    q(root,"[data-hbn-meta]").textContent=
      `${r.source} · ${r.updated?`updated ${new Date(r.updated).toLocaleString()} · `:""}${
        m.mode==="node-geography proxy"
          ? "explicit proxy; no Tor redistribution or uncertainty band fabricated"
          : "local estimated mining shares"
      }`;

    renderTable(root,state);
    draw(root,state);
    status(root,m.mode==="node-geography proxy"?"proxy":"live",m.mode==="node-geography proxy"?"warn":"ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;
    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.result=await W.ZZXHashrateNationProvider.load(state.core);
      render(root,state);
    }catch(error){
      status(root,state.result?"stale":"offline",state.result?"warn":"error");
      q(root,"[data-hbn-meta]").textContent=String(error?.message||error);
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      result:null,
      busy:false,
      timer:null,
      resize:null
    };

    root.__zzxHashrateNationState=state;

    try{
      await ensureModules(state.core);

      q(root,"[data-hbn-refresh]")?.addEventListener("click",()=>refresh(root,state));

      if("ResizeObserver" in W){
        state.resize=new ResizeObserver(()=>W.requestAnimationFrame(()=>draw(root,state)));
        state.resize.observe(q(root,"[data-hbn-canvas]"));
      }

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,60000);
      }

      state.timer=W.setTimeout(loop,60000);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-hbn-meta]").textContent=String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
