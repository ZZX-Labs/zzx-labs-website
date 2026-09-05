// __partials/widgets/nodes-by-city/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="nodes-by-city";

  function q(root,sel){
    return root?root.querySelector(sel):null;
  }

  function int(v){
    const n=Number(v);
    return Number.isFinite(n)?Math.round(n).toLocaleString():"—";
  }

  function pct(v){
    const n=Number(v);
    return Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
  }

  function status(root,label,state){
    const el=q(root,"[data-nbc-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/nodes-by-city";

    for(const [globalName,relative] of [
      ["ZZXNodesByCitySources","js/sources.js"],
      ["ZZXNodesByCityFetch","js/fetch.js"],
      ["ZZXNodesByCityAdapter","js/adapter.js"],
      ["ZZXNodesByCityProvider","js/provider.js"]
    ]){
      if(W[globalName])continue;

      const raw=`${base}/${relative}`;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;

      await new Promise((resolve,reject)=>{
        const s=D.createElement("script");
        s.src=src;
        s.defer=true;
        s.addEventListener("load",resolve,{once:true});
        s.addEventListener("error",reject,{once:true});
        (D.head||D.documentElement).appendChild(s);
      });

      if(!W[globalName]){
        throw new Error(`${relative} did not register ${globalName}`);
      }
    }
  }

  function filtered(root,state){
    const needle=String(
      q(root,"[data-nbc-search]")?.value||""
    ).trim().toLowerCase();

    if(!needle)return state.result?.rows||[];

    return (state.result?.rows||[]).filter(item=>
      `${item.city} ${item.country} ${item.label}`
        .toLowerCase()
        .includes(needle)
    );
  }

  function renderTable(root,state){
    const rows=filtered(root,state);
    const pageSize=W.ZZXNodesByCitySources.pageSize;
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));

    state.page=Math.max(0,Math.min(state.page,pages-1));

    const body=q(root,"[data-nbc-body]");
    body.replaceChildren();

    const slice=rows.slice(
      state.page*pageSize,
      state.page*pageSize+pageSize
    );

    if(!slice.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-city__empty";
      empty.textContent="No city records match this filter.";
      body.appendChild(empty);
    }else{
      slice.forEach((item,index)=>{
        const row=D.createElement("div");
        row.className="nodes-by-city__row";
        row.setAttribute("role","row");

        const values=[
          String(state.page*pageSize+index+1),
          item.label,
          int(item.nodes),
          pct(item.share)
        ];

        values.forEach((value,i)=>{
          const cell=D.createElement("div");
          cell.setAttribute("role","cell");
          if(i>=2)cell.classList.add("nodes-by-city__num");
          cell.textContent=value;
          if(i===1)cell.title=item.label;
          row.appendChild(cell);
        });

        body.appendChild(row);
      });
    }

    q(root,"[data-nbc-page]").textContent=
      `Page ${state.page+1} / ${pages} · ${rows.length} cities`;

    q(root,"[data-nbc-prev]").disabled=state.page<=0;
    q(root,"[data-nbc-next]").disabled=state.page>=pages-1;
  }

  function render(root,state){
    const r=state.result;
    const top=r.rows[0]||null;

    const coverage=
      Number.isFinite(r.networkTotal)&&r.networkTotal>0
        ? r.geolocatedTotal/r.networkTotal
        : NaN;

    q(root,"[data-nbc-summary]").textContent=
      `${int(r.geolocatedTotal)} nodes`;

    q(root,"[data-nbc-sub]").textContent=
      `${r.rows.length.toLocaleString()} geolocated cities · ${
        Number.isFinite(coverage)
          ? `${pct(coverage)} of reachable-node total`
          : "network coverage unavailable"
      }`;

    q(root,"[data-nbc-city-count]").textContent=
      r.rows.length.toLocaleString();

    q(root,"[data-nbc-top-city]").textContent=
      top?.label||"—";

    q(root,"[data-nbc-top-share]").textContent=
      top?pct(top.share):"—";

    q(root,"[data-nbc-coverage]").textContent=
      pct(coverage);

    q(root,"[data-nbc-network-total]").textContent=
      int(r.networkTotal);

    q(root,"[data-nbc-updated]").textContent=
      Number.isFinite(r.updatedMs)
        ? new Date(r.updatedMs).toLocaleString()
        : "—";

    q(root,"[data-nbc-source]").textContent=
      `${r.source} · ${r.transport}`;

    q(root,"[data-nbc-meta]").textContent=
      "local ZZX Bitnodes data first · public fallback btcnodes.io · city counts cover only geolocated reachable nodes";

    renderTable(root,state);
    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.result=await W.ZZXNodesByCityProvider.load();
      state.page=0;
      render(root,state);

      W.ZZXNodesByCityLatest={
        rows:state.result.rows.map(item=>({...item})),
        network_total:Number(state.result.networkTotal),
        geolocated_total:Number(state.result.geolocatedTotal),
        updated_ms:Number(state.result.updatedMs),
        source:state.result.source,
        transport:state.result.transport
      };
    }catch(error){
      status(
        root,
        state.result?"stale":"offline",
        state.result?"warn":"error"
      );

      q(root,"[data-nbc-meta]").textContent=
        String(error?.message||error);
    }finally{
      state.busy=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      result:null,
      page:0,
      busy:false,
      timer:null
    };

    root.__zzxNodesByCityState=state;

    try{
      await ensureModules(state.core);

      q(root,"[data-nbc-prev]")?.addEventListener(
        "click",
        ()=>{
          state.page=Math.max(0,state.page-1);
          renderTable(root,state);
        }
      );

      q(root,"[data-nbc-next]")?.addEventListener(
        "click",
        ()=>{
          state.page+=1;
          renderTable(root,state);
        }
      );

      let searchTimer=null;

      q(root,"[data-nbc-search]")?.addEventListener(
        "input",
        ()=>{
          if(searchTimer)W.clearTimeout(searchTimer);

          searchTimer=W.setTimeout(()=>{
            state.page=0;
            renderTable(root,state);
          },120);
        }
      );

      q(root,"[data-nbc-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state)
      );

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;

        await refresh(root,state);

        state.timer=W.setTimeout(
          loop,
          W.ZZXNodesByCitySources.refreshMs
        );
      }

      state.timer=W.setTimeout(
        loop,
        W.ZZXNodesByCitySources.refreshMs
      );
    }catch(error){
      status(root,"offline","error");

      q(root,"[data-nbc-meta]").textContent=
        String(error?.message||error);
    }
  }

  if(W.ZZXAPI?.register){
    W.ZZXAPI.register(ID,boot);
  }else if(W.ZZXWidgetsCore?.onMount){
    W.ZZXWidgetsCore.onMount(ID,boot);
  }else if(W.ZZXWidgets?.register){
    W.ZZXWidgets.register(ID,boot);
  }
})();
