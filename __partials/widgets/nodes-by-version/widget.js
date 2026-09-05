// __partials/widgets/nodes-by-version/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="nodes-by-version";

  function q(root,sel){
    return root?root.querySelector(sel):null;
  }

  function int(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? Math.round(n).toLocaleString()
      : "—";
  }

  function pct(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? `${(n*100).toFixed(2)}%`
      : "—";
  }

  function status(root,label,state){
    const el=q(root,"[data-nbv-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/nodes-by-version";

    for(const [globalName,relative] of [
      ["ZZXNodesByVersionSources","js/sources.js"],
      ["ZZXNodesByVersionFetch","js/fetch.js"],
      ["ZZXNodesByVersionAdapter","js/adapter.js"],
      ["ZZXNodesByVersionProvider","js/provider.js"]
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
        throw new Error(
          `${relative} did not register ${globalName}`
        );
      }
    }
  }

  function filtered(root,state){
    const needle=String(
      q(root,"[data-nbv-search]")?.value||""
    ).trim().toLowerCase();

    if(!needle)return state.result?.rows||[];

    return (state.result?.rows||[]).filter(item=>
      `${item.label} ${W.ZZXNodesByVersionAdapter.family(item.label)}`
        .toLowerCase()
        .includes(needle)
    );
  }

  function renderTable(root,state){
    const rows=filtered(root,state);
    const pageSize=W.ZZXNodesByVersionSources.pageSize;
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));

    state.page=Math.max(
      0,
      Math.min(state.page,pages-1)
    );

    const body=q(root,"[data-nbv-body]");
    body.replaceChildren();

    const slice=rows.slice(
      state.page*pageSize,
      state.page*pageSize+pageSize
    );

    if(!slice.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-version__empty";
      empty.textContent="No user-agent records match this filter.";
      body.appendChild(empty);
    }else{
      slice.forEach((item,index)=>{
        const row=D.createElement("div");
        row.className="nodes-by-version__row";
        row.setAttribute("role","row");

        const values=[
          String(state.page*pageSize+index+1),
          item.label,
          int(item.count),
          pct(item.share)
        ];

        values.forEach((value,i)=>{
          const cell=D.createElement("div");
          cell.setAttribute("role","cell");
          if(i>=2)cell.classList.add("nodes-by-version__num");
          cell.textContent=value;

          if(i===1){
            cell.title=
              `${item.label} · ${W.ZZXNodesByVersionAdapter.family(item.label)}`;
          }

          row.appendChild(cell);
        });

        body.appendChild(row);
      });
    }

    q(root,"[data-nbv-page]").textContent=
      `Page ${state.page+1} / ${pages} · ${rows.length} versions`;

    q(root,"[data-nbv-prev]").disabled=
      state.page<=0;

    q(root,"[data-nbv-next]").disabled=
      state.page>=pages-1;
  }

  function render(root,state){
    const r=state.result;
    const top=r.rows[0]||null;

    const coverage=
      Number.isFinite(r.networkTotal)&&r.networkTotal>0
        ? r.identifiedTotal/r.networkTotal
        : NaN;

    q(root,"[data-nbv-summary]").textContent=
      `${int(r.identifiedTotal)} nodes`;

    q(root,"[data-nbv-sub]").textContent=
      `${r.rows.length.toLocaleString()} user-agent/version strings · ${
        Number.isFinite(coverage)
          ? `${pct(coverage)} identified`
          : "coverage unavailable"
      }`;

    q(root,"[data-nbv-version-count]").textContent=
      r.rows.length.toLocaleString();

    q(root,"[data-nbv-top-agent]").textContent=
      top?.label||"—";

    q(root,"[data-nbv-top-share]").textContent=
      top?pct(top.share):"—";

    q(root,"[data-nbv-coverage]").textContent=
      pct(coverage);

    q(root,"[data-nbv-network-total]").textContent=
      int(r.networkTotal);

    q(root,"[data-nbv-height]").textContent=
      int(r.latestHeight);

    q(root,"[data-nbv-updated]").textContent=
      Number.isFinite(r.updatedMs)
        ? new Date(r.updatedMs).toLocaleString()
        : "—";

    q(root,"[data-nbv-source]").textContent=
      `${r.source} · ${r.transport}`;

    q(root,"[data-nbv-meta]").textContent=
      "local ZZX Bitnodes data first · public fallback btcnodes.io · exact user-agent strings remain distinct";

    renderTable(root,state);
    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.result=await W.ZZXNodesByVersionProvider.load();
      state.page=0;
      render(root,state);

      W.ZZXNodesByVersion={
        rows:state.result.rows.map(item=>({
          ...item,
          family:W.ZZXNodesByVersionAdapter.family(item.label)
        })),
        network_total:Number(state.result.networkTotal),
        identified_total:Number(state.result.identifiedTotal),
        latest_height:Number(state.result.latestHeight),
        updated_ms:Number(state.result.updatedMs),
        source:state.result.source,
        transport:state.result.transport
      };

      W.ZZXNodesByVersionLatest=W.ZZXNodesByVersion;
    }catch(error){
      status(
        root,
        state.result?"stale":"offline",
        state.result?"warn":"error"
      );

      q(root,"[data-nbv-meta]").textContent=
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

    root.__zzxNodesByVersionState=state;

    try{
      await ensureModules(state.core);

      q(root,"[data-nbv-prev]")?.addEventListener(
        "click",
        ()=>{
          state.page=Math.max(0,state.page-1);
          renderTable(root,state);
        }
      );

      q(root,"[data-nbv-next]")?.addEventListener(
        "click",
        ()=>{
          state.page+=1;
          renderTable(root,state);
        }
      );

      let searchTimer=null;

      q(root,"[data-nbv-search]")?.addEventListener(
        "input",
        ()=>{
          if(searchTimer)W.clearTimeout(searchTimer);

          searchTimer=W.setTimeout(()=>{
            state.page=0;
            renderTable(root,state);
          },120);
        }
      );

      q(root,"[data-nbv-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state)
      );

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;

        await refresh(root,state);

        state.timer=W.setTimeout(
          loop,
          W.ZZXNodesByVersionSources.refreshMs
        );
      }

      state.timer=W.setTimeout(
        loop,
        W.ZZXNodesByVersionSources.refreshMs
      );
    }catch(error){
      status(root,"offline","error");

      q(root,"[data-nbv-meta]").textContent=
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
