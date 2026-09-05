// __partials/widgets/nodes-by-nation/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="nodes-by-nation";

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
    const el=q(root,"[data-nbn-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/nodes-by-nation";

    for(const [globalName,relative] of [
      ["ZZXNodesByNationSources","js/sources.js"],
      ["ZZXNodesByNationFetch","js/fetch.js"],
      ["ZZXNodesByNationAdapter","js/adapter.js"],
      ["ZZXNodesByNationProvider","js/provider.js"]
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
      q(root,"[data-nbn-search]")?.value||""
    ).trim().toLowerCase();

    if(!needle)return state.result?.rows||[];

    return (state.result?.rows||[]).filter(item=>
      `${item.code} ${item.name}`
        .toLowerCase()
        .includes(needle)
    );
  }

  function nationCell(item){
    const wrap=D.createElement("div");
    wrap.className="nodes-by-nation__nation";

    const iso=D.createElement("span");
    iso.className="nodes-by-nation__iso";
    iso.textContent=item.code||"--";

    const name=D.createElement("span");
    name.className="nodes-by-nation__name";
    name.textContent=item.name||item.code||"Unknown";
    name.title=name.textContent;

    wrap.append(iso,name);
    return wrap;
  }

  function renderTable(root,state){
    const rows=filtered(root,state);
    const pageSize=W.ZZXNodesByNationSources.pageSize;
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));

    state.page=Math.max(
      0,
      Math.min(state.page,pages-1)
    );

    const body=q(root,"[data-nbn-body]");
    body.replaceChildren();

    const slice=rows.slice(
      state.page*pageSize,
      state.page*pageSize+pageSize
    );

    if(!slice.length){
      const empty=D.createElement("div");
      empty.className="nodes-by-nation__empty";
      empty.textContent="No nation records match this filter.";
      body.appendChild(empty);
    }else{
      slice.forEach((item,index)=>{
        const row=D.createElement("div");
        row.className="nodes-by-nation__row";
        row.setAttribute("role","row");

        const rank=D.createElement("div");
        rank.setAttribute("role","cell");
        rank.textContent=String(
          state.page*pageSize+index+1
        );

        const nation=D.createElement("div");
        nation.setAttribute("role","cell");
        nation.appendChild(nationCell(item));

        const nodes=D.createElement("div");
        nodes.className="nodes-by-nation__num";
        nodes.setAttribute("role","cell");
        nodes.textContent=int(item.nodes);

        const share=D.createElement("div");
        share.className="nodes-by-nation__num";
        share.setAttribute("role","cell");
        share.textContent=pct(item.share);

        row.append(rank,nation,nodes,share);
        body.appendChild(row);
      });
    }

    q(root,"[data-nbn-page]").textContent=
      `Page ${state.page+1} / ${pages} · ${rows.length} nations`;

    q(root,"[data-nbn-prev]").disabled=
      state.page<=0;

    q(root,"[data-nbn-next]").disabled=
      state.page>=pages-1;
  }

  function render(root,state){
    const r=state.result;
    const top=r.rows[0]||null;

    const coverage=
      Number.isFinite(r.networkTotal)&&r.networkTotal>0
        ? r.geolocatedTotal/r.networkTotal
        : NaN;

    q(root,"[data-nbn-summary]").textContent=
      `${int(r.geolocatedTotal)} nodes`;

    q(root,"[data-nbn-sub]").textContent=
      `${r.rows.length.toLocaleString()} geolocated nations · ${
        Number.isFinite(coverage)
          ? `${pct(coverage)} of reachable-node total`
          : "network coverage unavailable"
      }`;

    q(root,"[data-nbn-country-count]").textContent=
      r.rows.length.toLocaleString();

    q(root,"[data-nbn-top-country]").textContent=
      top
        ? `${top.code||"--"} · ${top.name}`
        : "—";

    q(root,"[data-nbn-top-share]").textContent=
      top?pct(top.share):"—";

    q(root,"[data-nbn-coverage]").textContent=
      pct(coverage);

    q(root,"[data-nbn-network-total]").textContent=
      int(r.networkTotal);

    q(root,"[data-nbn-updated]").textContent=
      Number.isFinite(r.updatedMs)
        ? new Date(r.updatedMs).toLocaleString()
        : "—";

    q(root,"[data-nbn-source]").textContent=
      `${r.source} · ${r.transport}`;

    q(root,"[data-nbn-meta]").textContent=
      "local ZZX Bitnodes data first · public fallback btcnodes.io · percentages use the reachable-node total when available";

    renderTable(root,state);
    status(root,"live","ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;

    state.busy=true;
    status(root,"refreshing","warn");

    try{
      state.result=await W.ZZXNodesByNationProvider.load();
      state.page=0;
      render(root,state);

      W.ZZXNodesByNation={
        rows:state.result.rows.map(item=>({...item})),
        byNation:Object.fromEntries(
          state.result.rows.map(item=>[
            item.code||item.name,
            {
              country:item.name,
              code:item.code,
              nodes:item.nodes,
              share:item.share
            }
          ])
        ),
        network_total:Number(state.result.networkTotal),
        geolocated_total:Number(state.result.geolocatedTotal),
        updated_ms:Number(state.result.updatedMs),
        source:state.result.source,
        transport:state.result.transport
      };

      W.ZZXNodesByNationLatest=W.ZZXNodesByNation;
    }catch(error){
      status(
        root,
        state.result?"stale":"offline",
        state.result?"warn":"error"
      );

      q(root,"[data-nbn-meta]").textContent=
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

    root.__zzxNodesByNationState=state;

    try{
      await ensureModules(state.core);

      q(root,"[data-nbn-prev]")?.addEventListener(
        "click",
        ()=>{
          state.page=Math.max(0,state.page-1);
          renderTable(root,state);
        }
      );

      q(root,"[data-nbn-next]")?.addEventListener(
        "click",
        ()=>{
          state.page+=1;
          renderTable(root,state);
        }
      );

      let searchTimer=null;

      q(root,"[data-nbn-search]")?.addEventListener(
        "input",
        ()=>{
          if(searchTimer)W.clearTimeout(searchTimer);

          searchTimer=W.setTimeout(()=>{
            state.page=0;
            renderTable(root,state);
          },120);
        }
      );

      q(root,"[data-nbn-refresh]")?.addEventListener(
        "click",
        ()=>refresh(root,state)
      );

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;

        await refresh(root,state);

        state.timer=W.setTimeout(
          loop,
          W.ZZXNodesByNationSources.refreshMs
        );
      }

      state.timer=W.setTimeout(
        loop,
        W.ZZXNodesByNationSources.refreshMs
      );
    }catch(error){
      status(root,"offline","error");

      q(root,"[data-nbn-meta]").textContent=
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
