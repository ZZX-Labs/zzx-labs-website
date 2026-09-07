(function(){
  "use strict";
  const W=window,D=document,ID="bitavg";

  function q(root,selector){return root?root.querySelector(selector):null}
  function set(root,selector,value){const el=q(root,selector);if(el)el.textContent=String(value??"—")}

  function usd(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2})
      : "—";
  }

  function native(v,currency){
    const n=Number(v);
    if(!Number.isFinite(n))return "—";
    return `${n.toLocaleString(undefined,{maximumFractionDigits:8})} ${currency}`;
  }

  function btc(v){
    const n=Number(v);
    return Number.isFinite(n)
      ? `${n.toLocaleString(undefined,{maximumFractionDigits:2})} BTC`
      : "—";
  }

  function pct(v,digits=2,signed=false){
    const n=Number(v);
    if(!Number.isFinite(n))return "—";
    return `${signed&&n>=0?"+":""}${n.toFixed(digits)}%`;
  }

  function status(root,label,state){
    const el=q(root,"[data-bitavg-status]");
    if(el){el.textContent=label;el.setAttribute("data-status",state||"offline")}
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/bitavg";

    for(const [globalName,relative] of [
      ["ZZXBitAvgConstants","js/constants.js"],
      ["ZZXBitAvgFetch","js/fetch.js"],
      ["ZZXBitAvgFX","js/fx.js"],
      ["ZZXBitAvgModel","js/model.js"],
      ["ZZXBitAvgProvider","js/provider.js"],
      ["ZZXBitAvgPublisher","js/publisher.js"]
    ]){
      if(W[globalName])continue;
      const raw=`${base}/${relative}`;
      const src=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;

      await new Promise((done,fail)=>{
        const s=D.createElement("script");
        s.src=src;s.defer=true;
        s.addEventListener("load",done,{once:true});
        s.addEventListener("error",fail,{once:true});
        (D.head||D.documentElement).appendChild(s);
      });

      if(!W[globalName])throw new Error(`${relative} did not register ${globalName}`);
    }
  }

  function filtered(root,state){
    const model=state.result?.model;
    if(!model)return [];

    const needle=String(q(root,"[data-bitavg-search]")?.value||"").trim().toLowerCase();
    const currency=String(q(root,"[data-bitavg-currency]")?.value||"all");

    return model.rows.filter(row=>{
      const currencyOk=currency==="all"||row.quote===currency;
      const searchOk=!needle||`${row.label} ${row.exchange} ${row.pair} ${row.quote}`.toLowerCase().includes(needle);
      return currencyOk&&searchOk;
    });
  }

  function populateCurrencies(root,state){
    const select=q(root,"[data-bitavg-currency]");
    if(!select)return;

    const current=select.value||"all";
    select.replaceChildren();

    const all=D.createElement("option");
    all.value="all";
    all.textContent="all fiat";
    select.appendChild(all);

    for(const currency of state.result.model.currencies){
      const option=D.createElement("option");
      option.value=currency;
      option.textContent=currency;
      select.appendChild(option);
    }

    select.value=[...select.options].some(o=>o.value===current)?current:"all";
  }

  function renderRows(root,state){
    const body=q(root,"[data-bitavg-rows]");
    if(!body)return;

    const rows=filtered(root,state);
    const pageSize=W.ZZXBitAvgConstants.pageSize;
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));

    state.page=Math.max(0,Math.min(state.page,pages-1));
    body.replaceChildren();

    const slice=rows.slice(state.page*pageSize,state.page*pageSize+pageSize);

    if(!slice.length){
      const tr=D.createElement("tr");
      const td=D.createElement("td");
      td.colSpan=7;
      td.className="bitavg__empty";
      td.textContent="No BTC/fiat markets match this filter.";
      tr.appendChild(td);
      body.appendChild(tr);
    }else{
      for(const row of slice){
        const tr=D.createElement("tr");

        const values=[
          row.label,
          row.pair||`BTC/${row.quote}`,
          native(row.nativePrice,row.quote),
          usd(row.usdPrice),
          btc(row.volumeBtc),
          `${(row.weight*100).toFixed(3)}%`,
          pct(row.deviationPct,3,true)
        ];

        values.forEach((value,index)=>{
          const td=D.createElement("td");
          td.textContent=value;

          if(index===0){
            td.title=`${row.exchange} · ${row.source}`;
          }

          if(index===6){
            td.setAttribute("data-tone",row.deviationPct>0?"up":row.deviationPct<0?"down":"flat");
          }

          tr.appendChild(td);
        });

        body.appendChild(tr);
      }
    }

    set(root,"[data-bitavg-page]",`Page ${state.page+1} / ${pages} · ${rows.length} markets`);
    q(root,"[data-bitavg-prev]").disabled=state.page<=0;
    q(root,"[data-bitavg-next]").disabled=state.page>=pages-1;
  }

  function render(root,state){
    const m=state.result.model;

    set(root,"[data-bitavg-price]",usd(m.bpi));
    set(root,"[data-bitavg-exchanges]",String(m.exchanges.length));
    set(root,"[data-bitavg-currencies]",String(m.currencies.length));
    set(root,"[data-bitavg-markets]",`${m.markets} · ${m.weightedMarkets} weighted`);
    set(root,"[data-bitavg-volume]",btc(m.volume));

    set(root,"[data-bitavg-spread]",
      Number.isFinite(m.spread)
        ? `${usd(m.spread)} · ${m.spreadPct.toFixed(3)}%`
        : "—"
    );

    set(root,"[data-bitavg-top]",
      m.topExchange
        ? `${m.topExchange.label} ${(m.topExchange.weight*100).toFixed(2)}%`
        : "—"
    );

    set(root,"[data-bitavg-method]",m.method.replaceAll("_"," "));

    set(root,"[data-bitavg-fx]",
      `1 USD = rate[currency] currency · ${m.fxRateCount} FX rates`
    );

    set(root,"[data-bitavg-coverage]",
      m.configuredCount
        ? `${m.configuredCovered}/${m.configuredCount} configured exchanges represented`
        : `${m.exchanges.length} exchanges represented`
    );

    set(root,"[data-bitavg-updated]",
      m.updatedAt
        ? new Date(m.updatedAt).toLocaleString()
        : "local snapshot timestamp unavailable"
    );

    set(root,"[data-bitavg-sources]",
      state.result.stale
        ? "cached local BPI bundle"
        : "markets.json + latest.json + exchanges/currencies/FX"
    );

    set(root,"[data-bitavg-meta]",
      `${m.markets} BTC/fiat markets only · ${m.currencies.length} fiat currencies · BTC-volume weights ${(m.weightSum*100).toFixed(3)}% · ${state.result.transport}`
    );

    populateCurrencies(root,state);
    renderRows(root,state);

    W.ZZXBitAvgLatest={
      bpi_usd:m.bpi,
      method:m.method,
      exchanges:m.exchanges.length,
      currencies:[...m.currencies],
      markets:m.markets,
      weighted_markets:m.weightedMarkets,
      volume_24h_btc:m.volume,
      spread_usd:m.spread,
      spread_percent:m.spreadPct,
      weight_sum:m.weightSum,
      rows:m.rows.map(row=>({...row})),
      stale:!!state.result.stale,
      transport:state.result.transport,
      rendered_at:Date.now()
    };

    W.ZZXBitAvgPublisher.publish(
      m,
      state.result.transport,
      state.result.stale
    );

    status(root,state.result.stale?"cached":"live",state.result.stale?"warn":"ok");
  }

  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;
    state.busy=true;
    status(root,"refreshing","warn");

    const button=q(root,"[data-bitavg-refresh]");
    if(button)button.disabled=true;

    try{
      state.result=await W.ZZXBitAvgProvider.load();
      state.page=0;
      render(root,state);
    }catch(error){
      status(root,state.result?"stale":"offline",state.result?"warn":"error");
      set(root,"[data-bitavg-meta]",String(error?.message||error));
    }finally{
      state.busy=false;
      if(button)button.disabled=false;
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={busy:false,timer:null,result:null,page:0};
    root.__zzxBitAvgState=state;

    try{
      await ensureModules(core||W.ZZXWidgetsCore||null);

      const project=q(root,"[data-bitavg-project-link]");
      if(project&&W.ZZXAPI?.url)project.href=W.ZZXAPI.url(W.ZZXBitAvgConstants.projectPath);

      q(root,"[data-bitavg-refresh]")?.addEventListener("click",()=>refresh(root,state));

      q(root,"[data-bitavg-prev]")?.addEventListener("click",()=>{
        state.page=Math.max(0,state.page-1);
        renderRows(root,state);
      });

      q(root,"[data-bitavg-next]")?.addEventListener("click",()=>{
        state.page+=1;
        renderRows(root,state);
      });

      let searchTimer=null;
      q(root,"[data-bitavg-search]")?.addEventListener("input",()=>{
        if(searchTimer)W.clearTimeout(searchTimer);
        searchTimer=W.setTimeout(()=>{
          state.page=0;
          renderRows(root,state);
        },120);
      });

      q(root,"[data-bitavg-currency]")?.addEventListener("change",()=>{
        state.page=0;
        renderRows(root,state);
      });

      await refresh(root,state);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state);
        state.timer=W.setTimeout(loop,W.ZZXBitAvgConstants.refreshMs);
      }
      state.timer=W.setTimeout(loop,W.ZZXBitAvgConstants.refreshMs);
    }catch(error){
      status(root,"offline","error");
      set(root,"[data-bitavg-meta]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
