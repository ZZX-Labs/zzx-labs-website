(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerExchanges?.__version>=2)return;

  function safeGet(key){try{return W.localStorage.getItem(key)}catch(_){return null}}

  function populateSources(root,config){
    const select=root?.querySelector?.("[data-source-select]");
    if(!select)return;
    const wanted=safeGet(W.ZZXBitcoinTickerConstants.storage.source)||"bpi";

    select.replaceChildren();
    for(const [value,label] of [["bpi","BPI"],["global-bpi","Global BPI"]]){
      const o=D.createElement("option");o.value=value;o.textContent=label;select.appendChild(o);
    }

    const liveRows=config?.latest?.exchanges||{};
    for(const [id,row] of W.ZZXBitcoinTickerSelection.exchangeMap(config||{})){
      const live=liveRows[id];
      const price=Number(live?.price_usd);
      if(!(Number.isFinite(price)&&price>0))continue;
      const o=D.createElement("option");
      o.value=`exchange:${id}`;
      o.textContent=`Exchange · ${row.label}`;
      select.appendChild(o);
    }

    select.value=[...select.options].some(o=>o.value===wanted)?wanted:"bpi";
  }

  function render(root,state){
    const body=root?.querySelector?.("[data-exchange-market-rows]");
    if(!body)return;

    const latest=state?.config?.latest;
    const rows=latest?.exchanges&&typeof latest.exchanges==="object"
      ? Object.entries(latest.exchanges)
      : [];

    const checked=rows.map(([id,row])=>{
      const eligible=W.ZZXBitcoinTickerSelection?.exchangeEligible
        ? W.ZZXBitcoinTickerSelection.exchangeEligible(state?.config,id,row)
        : row?.index_eligible!==false;
      const rawWeight=row?.weight_ratio??row?.weight_decimal??row?.weight;
      const safeWeight=eligible&&Number.isFinite(Number(rawWeight))
        ? Number(rawWeight)
        : 0;
      return {id,row,eligible,safeWeight};
    });

    checked.sort((a,b)=>{
      if(a.eligible!==b.eligible)return a.eligible?-1:1;
      return b.safeWeight-a.safeWeight;
    });

    body.replaceChildren();
    let activeCount=0,quarantinedCount=0;

    for(const {id,row,eligible,safeWeight} of checked){
      const tr=D.createElement("tr");
      if(eligible){
        activeCount+=1;
      }else{
        quarantinedCount+=1;
        tr.dataset.marketState="quarantined";
        tr.title=String(
          row.exclusion_reason||
          state?.config?.exchangesData?.sources?.[id]?.notes||
          "Excluded from BPI by market sanity policy"
        );
      }

      const label=eligible?(row.label||id):`${row.label||id} · QUARANTINED`;
      const quote=Array.isArray(row.fiat_quotes)?row.fiat_quotes.join(", "):(row.quote||"—");
      const price=eligible&&Number.isFinite(Number(row.price_usd))
        ? Number(row.price_usd).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2})
        : "—";
      const volume=eligible&&Number.isFinite(Number(row.volume_24h_btc))
        ? `${Number(row.volume_24h_btc).toLocaleString(undefined,{maximumFractionDigits:2})} BTC`
        : "—";
      const weight=eligible?`${(safeWeight*100).toFixed(3)}%`:"0.000%";
      const updated=row.updated_at?new Date(row.updated_at).toLocaleTimeString():"—";

      for(const value of [label,quote,price,volume,weight,updated]){
        const td=D.createElement("td");td.textContent=String(value);tr.appendChild(td);
      }
      body.appendChild(tr);
    }

    const meta=root.querySelector("[data-exchange-market-meta]");
    if(meta){
      meta.textContent=`${activeCount} active exchange sources`+
        (quarantinedCount?` · ${quarantinedCount} quarantined`:"")+" · BPI sanity gated";
    }
  }

  function update(root,state){render(root,state)}
  function mount(root,state){render(root,state)}

  W.ZZXBitcoinTickerExchanges=Object.freeze({
    __version:2,populateSources,render,update,mount
  });
})();
