// __partials/widgets/deadopop/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="deadopop",PAGE_SIZE=5;

  function q(root,sel){return root?root.querySelector(sel):null}

  function usd(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0})
      : "—";
  }

  function pct(v){
    const n=Number(v);
    return Number.isFinite(n)?`${n.toFixed(1)}%`:"—";
  }

  function status(root,label,state){
    const el=q(root,"[data-deado-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/deadopop";

    for(const [globalName,relative] of [
      ["ZZXDeadOPopModel","js/model.js"],
      ["ZZXDeadOPopProvider","js/provider.js"]
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

  function populateStatuses(root,state){
    const select=q(root,"[data-deado-filter]");
    const current=select.value||"all";
    const statuses=Object.keys(state.model?.statusCounts||{}).sort();

    select.replaceChildren();

    const all=D.createElement("option");
    all.value="all";all.textContent="all statuses";
    select.appendChild(all);

    for(const value of statuses){
      const opt=D.createElement("option");
      opt.value=value;
      opt.textContent=value.replaceAll("_"," ");
      select.appendChild(opt);
    }

    if([...select.options].some(o=>o.value===current))select.value=current;
  }

  function rowsFor(root,state){
    return W.ZZXDeadOPopModel.filter(
      state.model,
      q(root,"[data-deado-filter]")?.value||"all",
      q(root,"[data-deado-search]")?.value||""
    );
  }

  function renderTable(root,state){
    const rows=rowsFor(root,state);
    const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
    state.page=Math.max(0,Math.min(state.page,pages-1));

    const body=q(root,"[data-deado-body]");
    body.replaceChildren();

    const slice=rows.slice(state.page*PAGE_SIZE,state.page*PAGE_SIZE+PAGE_SIZE);

    if(!slice.length){
      const empty=D.createElement("div");
      empty.className="deadopop__empty";
      empty.textContent="No archival records match this filter.";
      body.appendChild(empty);
    }else{
      slice.forEach((item,index)=>{
        const row=D.createElement("div");
        row.className="deadopop__row";
        row.setAttribute("role","row");

        const asset=`${item.name}${item.symbol?` (${item.symbol.toUpperCase()})`:""}`;
        const values=[
          String(item.rank||state.page*PAGE_SIZE+index+1),
          asset,
          item.status.replaceAll("_"," "),
          item.method.replaceAll("_"," "),
          Number.isFinite(item.confidence)?`${(item.confidence*100).toFixed(0)}%`:"—",
          usd(item.lost)
        ];

        values.forEach((value,i)=>{
          const cell=D.createElement("div");
          cell.setAttribute("role","cell");
          if(i>=4)cell.classList.add("deadopop__num");
          cell.textContent=value;
          if(i===1)cell.title=item.failureReason||asset;
          if(i===2)cell.title=item.failureDate||"";
          row.appendChild(cell);
        });

        body.appendChild(row);
      });
    }

    q(root,"[data-deado-page]").textContent=`page ${state.page+1} / ${pages} · ${rows.length} records`;
    q(root,"[data-deado-prev]").disabled=state.page<=0;
    q(root,"[data-deado-next]").disabled=state.page>=pages-1;
  }

  function render(root,state){
    const m=state.model;
    q(root,"[data-deado-lost]").textContent=usd(m.combinedLost);
    q(root,"[data-deado-count]").textContent=Number(m.total||0).toLocaleString();
    q(root,"[data-deado-coverage]").textContent=`${Number(m.valued||0).toLocaleString()} · ${pct(m.coverage)}`;
    q(root,"[data-deado-peak]").textContent=usd(m.combinedPeak);
    q(root,"[data-deado-unvalued]").textContent=Number(m.unvalued||0).toLocaleString();
    q(root,"[data-deado-sub]").textContent=`${m.source} · Bitcoin excluded · archival estimates, not active-market data`;
    q(root,"[data-deado-meta]").textContent=`${m.sourceURL||m.source} · updated ${m.updated?new Date(m.updated).toLocaleString():"unknown"}`;

    populateStatuses(root,state);
    renderTable(root,state);
    status(root,m.source==="cached"?"cached":"live",m.source==="cached"?"warn":"ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;
    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.model=await W.ZZXDeadOPopProvider.load();
      state.page=0;
      render(root,state);
    }catch(error){
      status(root,state.model?"stale":"offline",state.model?"warn":"error");
      q(root,"[data-deado-meta]").textContent=String(error?.message||error);
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    const state={model:null,page:0,busy:false,timer:null};
    root.__zzxDeadOPopState=state;

    try{
      await ensureModules(core||W.ZZXWidgetsCore||null);

      q(root,"[data-deado-filter]")?.addEventListener("change",()=>{state.page=0;renderTable(root,state)});

      let searchTimer=null;
      q(root,"[data-deado-search]")?.addEventListener("input",()=>{
        if(searchTimer)W.clearTimeout(searchTimer);
        searchTimer=W.setTimeout(()=>{state.page=0;renderTable(root,state)},120);
      });

      q(root,"[data-deado-prev]")?.addEventListener("click",()=>{state.page=Math.max(0,state.page-1);renderTable(root,state)});
      q(root,"[data-deado-next]")?.addEventListener("click",()=>{state.page+=1;renderTable(root,state)});
      q(root,"[data-deado-refresh]")?.addEventListener("click",()=>refresh(root,state));

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,600000);
      }

      state.timer=W.setTimeout(loop,600000);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-deado-meta]").textContent=String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
