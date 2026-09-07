(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerReferences?.__version>=6)return;

  const C=()=>W.ZZXBitcoinTickerConstants;
  const cache={catalog:null,prices:null,at:0};
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const positive=v=>{const n=finite(v);return n>0?n:NaN};
  const q=(root,selector)=>root?.querySelector?.(selector)||null;
  const set=(root,selector,value)=>{
    const el=q(root,selector);
    if(el)el.textContent=value==null?"—":String(value);
  };
  const disabled=(root,selector,value)=>{
    const el=q(root,selector);
    if(el)el.disabled=!!value;
  };

  function normalizePrices(data){
    const out=new Map();
    const source=data?.prices??data?.references??data;

    if(!source||typeof source!=="object"||Array.isArray(source))return out;

    for(const [id,row] of Object.entries(source)){
      if(typeof row==="number"){
        if(row>0)out.set(id,{usd:row,source:"local reference feed",updatedAt:data?.updated_at||null});
        continue;
      }
      if(!row||typeof row!=="object")continue;

      const usd=positive(row.usd??row.price_usd??row.value_usd??row.price);
      if(!Number.isFinite(usd))continue;

      out.set(id,{
        usd,
        source:String(row.source||row.provider||data?.source||"local reference feed"),
        updatedAt:row.updated_at||data?.updated_at||null
      });
    }

    return out;
  }

  function mergeLegacy(map,data){
    if(!data||typeof data!=="object")return;
    const p=data.prices??data.commodities??data;

    const aliases={
      gold:["gold_usd_oz","gold","XAU"],
      silver:["silver_usd_oz","silver","XAG"],
      platinum:["platinum_usd_oz","platinum","XPT"],
      palladium:["palladium_usd_oz","palladium","XPD"],
      copper:["copper_usd_lb","copper"],
      oil:["oil_usd_barrel","crude_usd_barrel","wti_usd_barrel","oil"],
      cannabis:["cannabis_usd_oz","cannabis"]
    };

    for(const [id,keys] of Object.entries(aliases)){
      if(map.has(id))continue;
      for(const key of keys){
        const usd=positive(p?.[key]);
        if(Number.isFinite(usd)){
          map.set(id,{usd,source:String(data.provider||data.source||"legacy commodities"),updatedAt:data.updated_at||null});
          break;
        }
      }
    }
  }

  async function load(force=false){
    const now=Date.now();
    if(!force&&cache.catalog&&cache.prices&&now-cache.at<C().referenceTtlMs){
      return {catalog:cache.catalog,prices:cache.prices};
    }

    const [catalogData,priceData,legacy]=await Promise.all([
      W.ZZXBitcoinTickerFetch.json(C().endpoints.referenceCatalog),
      W.ZZXBitcoinTickerFetch.json(C().endpoints.references,{optional:true}),
      W.ZZXBitcoinTickerFetch.json(C().endpoints.legacyCommodities,{optional:true})
    ]);

    const catalog=Array.isArray(catalogData?.items)?catalogData.items:[];
    const prices=normalizePrices(priceData);
    mergeLegacy(prices,legacy);

    cache.catalog=catalog;
    cache.prices=prices;
    cache.at=now;

    return {catalog,prices,updatedAt:priceData?.updated_at||legacy?.updated_at||null};
  }

  function fmt(v,d=2){
    const n=finite(v);
    if(!Number.isFinite(n))return "—";
    return n.toLocaleString(undefined,{maximumFractionDigits:d});
  }

  function fmtUsd(v){
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2})
      : "—";
  }

  function renderCard(item,ref,btcUsd){
    const card=D.createElement("article");
    card.className="bitcoin-ticker__comparative";
    card.dataset.comparative=item.id;

    const name=D.createElement("span");
    name.className="bitcoin-ticker__comparative-name";
    name.textContent=item.name;

    const qty=D.createElement("strong");
    const detail=D.createElement("small");

    if(ref&&positive(ref.usd)>0){
      const perBtc=btcUsd/ref.usd;
      const unitBtc=ref.usd/btcUsd;
      const best=W.ZZXBitcoinTickerUnits.bestBtcUnit(unitBtc);

      qty.textContent=`${fmt(perBtc,perBtc>=1000?0:perBtc>=10?2:4)} ${item.unit}`;
      detail.textContent=`1 ${item.unit} = ${fmtUsd(ref.usd)} = ${fmt(best?.value,4)} ${best?.label||"BTC"}`;
      card.title=`${item.name} reference · ${ref.source}${ref.updatedAt?` · ${ref.updatedAt}`:""}`;
    }else{
      qty.textContent="—";
      detail.textContent=`${item.unit} · reference unavailable`;
    }

    card.append(name,qty,detail);
    return card;
  }

  function categories(catalog){
    return [...new Set(catalog.map(i=>String(i.category||"Other")))].sort();
  }

  function render(root,state,btcUsd){
    const data=state.references;
    if(!data)return;

    const grid=q(root,"[data-comparative-grid]");
    if(!grid)return;

    const search=String(q(root,"[data-reference-search]")?.value||"").trim().toLowerCase();
    const category=String(q(root,"[data-reference-category]")?.value||"all");

    const filtered=data.catalog.filter(item=>{
      const categoryOk=category==="all"||item.category===category;
      const searchOk=!search||`${item.name} ${item.unit} ${item.category}`.toLowerCase().includes(search);
      return categoryOk&&searchOk;
    });

    const size=C().referencePageSize;
    const pages=Math.max(1,Math.ceil(filtered.length/size));
    state.referencePage=Math.max(0,Math.min(state.referencePage,pages-1));
    const slice=filtered.slice(state.referencePage*size,state.referencePage*size+size);

    grid.replaceChildren();
    for(const item of slice){
      grid.appendChild(renderCard(item,data.prices.get(item.id),btcUsd));
    }

    const priced=data.catalog.filter(item=>data.prices.has(item.id)).length;

    set(root,"[data-comparatives-state]",`${priced}/${data.catalog.length} priced`);
    set(root,"[data-reference-page]",`Page ${state.referencePage+1} / ${pages} · ${filtered.length} items`);

    disabled(root,"[data-reference-prev]",state.referencePage<=0);
    disabled(root,"[data-reference-next]",state.referencePage>=pages-1);

    set(
      root,
      "[data-commodity-source]",
      priced
        ? `${priced} locally sourced reference prices · unavailable items are not guessed`
        : "reference prices unavailable"
    );

    set(
      root,
      "[data-commodity-updated]",
      data.updatedAt
        ? `updated ${new Date(data.updatedAt).toLocaleString()}`
        : "reference timestamp unavailable"
    );
  }

  function populateCategories(root,catalog){
    const select=q(root,"[data-reference-category]");
    if(!select)return;
    const current=select.value||"all";

    select.replaceChildren();
    const all=D.createElement("option");
    all.value="all";all.textContent="all categories";
    select.appendChild(all);

    for(const category of categories(catalog)){
      const o=D.createElement("option");
      o.value=category;o.textContent=category;
      select.appendChild(o);
    }

    select.value=[...select.options].some(o=>o.value===current)?current:"all";
  }

  W.ZZXBitcoinTickerReferences=Object.freeze({
    __version:6,load,render,populateCategories
  });
})();
