(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerReferences?.__version>=7)return;

  const C=()=>W.ZZXBitcoinTickerConstants;
  const cache={catalog:null,pages:null,prices:null,at:0};
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const positive=v=>{const n=finite(v);return n>0?n:NaN};
  const q=(root,selector)=>root?.querySelector?.(selector)||null;
  const set=(root,selector,value)=>{
    const el=q(root,selector);
    if(el)el.textContent=value==null?"—":String(value);
  };

  function normalizePrices(data){
    const out=new Map();
    const source=data?.prices??data?.references??data;

    if(!source||typeof source!=="object"||Array.isArray(source)){
      return out;
    }

    for(const [id,row] of Object.entries(source)){
      if(typeof row==="number"){
        if(row>0){
          out.set(id,{
            usd:row,
            source:"local reference feed",
            updatedAt:data?.updated_at||null
          });
        }
        continue;
      }

      if(!row||typeof row!=="object")continue;

      const usd=positive(
        row.usd??row.price_usd??row.value_usd??row.price
      );

      if(!Number.isFinite(usd))continue;

      out.set(id,{
        usd,
        source:String(
          row.source||
          row.provider||
          data?.source||
          "local reference feed"
        ),
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
          map.set(id,{
            usd,
            source:String(
              data.provider||
              data.source||
              "legacy commodities"
            ),
            updatedAt:data.updated_at||null
          });
          break;
        }
      }
    }
  }

  async function load(force=false){
    const now=Date.now();

    if(
      !force &&
      cache.catalog &&
      cache.pages &&
      cache.prices &&
      now-cache.at<C().referenceTtlMs
    ){
      return {
        catalog:cache.catalog,
        pages:cache.pages,
        prices:cache.prices,
        updatedAt:cache.updatedAt||null
      };
    }

    const [catalogData,priceData,legacy]=await Promise.all([
      W.ZZXBitcoinTickerFetch.json(
        C().endpoints.referenceCatalog
      ),
      W.ZZXBitcoinTickerFetch.json(
        C().endpoints.references,
        {optional:true}
      ),
      W.ZZXBitcoinTickerFetch.json(
        C().endpoints.legacyCommodities,
        {optional:true}
      )
    ]);

    const catalog=Array.isArray(catalogData?.items)
      ? catalogData.items
      : [];

    const pages=Array.isArray(catalogData?.pages)
      ? catalogData.pages.slice().sort(
          (a,b)=>Number(a.order||0)-Number(b.order||0)
        )
      : [];

    const prices=normalizePrices(priceData);
    mergeLegacy(prices,legacy);

    cache.catalog=catalog;
    cache.pages=pages;
    cache.prices=prices;
    cache.updatedAt=
      priceData?.updated_at||
      legacy?.updated_at||
      null;
    cache.at=now;

    return {
      catalog,
      pages,
      prices,
      updatedAt:cache.updatedAt
    };
  }

  function fmt(v,d=2){
    const n=finite(v);
    if(!Number.isFinite(n))return "—";
    return n.toLocaleString(undefined,{maximumFractionDigits:d});
  }

  function fmtUsd(v){
    const n=finite(v);
    return Number.isFinite(n)
      ? n.toLocaleString(undefined,{
          style:"currency",
          currency:"USD",
          maximumFractionDigits:2
        })
      : "—";
  }

  function renderCard(item,ref,btcUsd){
    const card=D.createElement("article");
    card.className="bitcoin-ticker__comparative";
    card.dataset.comparative=item.id;

    if(item.restricted_reference===true){
      card.dataset.referencePolicy="informational-only";
    }

    const name=D.createElement("span");
    name.className="bitcoin-ticker__comparative-name";
    name.textContent=item.name;

    const qty=D.createElement("strong");
    const detail=D.createElement("small");

    if(ref&&positive(ref.usd)>0){
      const perBtc=btcUsd/ref.usd;
      const unitBtc=ref.usd/btcUsd;
      const best=W.ZZXBitcoinTickerUnits.bestBtcUnit(unitBtc);

      qty.textContent=
        `${fmt(
          perBtc,
          perBtc>=1000?0:perBtc>=10?2:4
        )} ${item.unit}`;

      detail.textContent=
        `1 ${item.unit} = ${fmtUsd(ref.usd)} = `+
        `${fmt(best?.value,4)} ${best?.label||"BTC"}`;

      card.title=
        `${item.name} reference · ${ref.source}`+
        (ref.updatedAt?` · ${ref.updatedAt}`:"");
    }else{
      qty.textContent="—";

      detail.textContent=
        `${item.unit} · reference unavailable`;
    }

    card.append(name,qty,detail);
    return card;
  }

  function pageById(data,id){
    return data?.pages?.find(page=>page.id===id)||
      data?.pages?.[0]||
      null;
  }

  function activePageId(root,state,data){
    const select=q(root,"[data-reference-page-select]");
    const stored=(()=>{
      try{
        return localStorage.getItem(
          C().storage.referencePage
        );
      }catch(_){
        return null;
      }
    })();

    const candidate=
      state.referenceType||
      select?.value||
      stored||
      data?.pages?.[0]?.id||
      "";

    return pageById(data,candidate)?.id||
      data?.pages?.[0]?.id||
      "";
  }

  function renderPageNav(root,state,data,btcUsd){
    const nav=q(root,"[data-reference-page-nav]");
    if(!nav)return;

    const active=activePageId(root,state,data);
    nav.replaceChildren();

    for(const page of data.pages||[]){
      const button=D.createElement("button");
      button.type="button";
      button.className="bitcoin-ticker__reference-page-button";
      button.textContent=page.label;
      button.dataset.referencePageId=page.id;
      button.setAttribute(
        "aria-pressed",
        page.id===active?"true":"false"
      );

      button.addEventListener("click",()=>{
        setPage(root,state,page.id,btcUsd);
      });

      nav.appendChild(button);
    }
  }

  function populatePages(root,state,data,btcUsd){
    const select=q(root,"[data-reference-page-select]");
    if(!select)return;

    const active=activePageId(root,state,data);
    select.replaceChildren();

    for(const page of data.pages||[]){
      const option=D.createElement("option");
      option.value=page.id;
      option.textContent=page.label;
      select.appendChild(option);
    }

    if(select.options.length){
      select.value=[...select.options].some(
        option=>option.value===active
      )
        ? active
        : select.options[0].value;

      state.referenceType=select.value;
    }

    renderPageNav(root,state,data,btcUsd);
  }

  function setPage(root,state,pageId,btcUsd){
    const data=state.references;
    if(!data)return;

    const page=pageById(data,pageId);
    if(!page)return;

    state.referenceType=page.id;

    const select=q(root,"[data-reference-page-select]");
    if(select&&select.value!==page.id){
      select.value=page.id;
    }

    try{
      localStorage.setItem(
        C().storage.referencePage,
        page.id
      );
    }catch(_){}

    render(root,state,btcUsd);
  }

  function render(root,state,btcUsd){
    const data=state.references;
    if(!data)return;

    const grid=q(root,"[data-comparative-grid]");
    if(!grid)return;

    const pageId=activePageId(root,state,data);
    const page=pageById(data,pageId);
    if(!page)return;

    state.referenceType=page.id;

    const search=String(
      q(root,"[data-reference-search]")?.value||""
    ).trim().toLowerCase();

    const pageItems=data.catalog.filter(
      item=>item.page===page.id
    );

    const filtered=pageItems.filter(item=>{
      if(!search)return true;

      const haystack=[
        item.name,
        item.unit,
        item.page,
        ...(Array.isArray(item.tags)?item.tags:[])
      ].join(" ").toLowerCase();

      return haystack.includes(search);
    });

    grid.replaceChildren();

    for(const item of filtered){
      grid.appendChild(
        renderCard(
          item,
          data.prices.get(item.id),
          btcUsd
        )
      );
    }

    const pricedOnPage=pageItems.filter(
      item=>data.prices.has(item.id)
    ).length;

    const totalPriced=data.catalog.filter(
      item=>data.prices.has(item.id)
    ).length;

    set(root,"[data-reference-title]",page.label);
    set(
      root,
      "[data-reference-description]",
      page.description||""
    );
    set(
      root,
      "[data-reference-page-status]",
      `${page.label} · ${filtered.length}/${pageItems.length} items`
    );
    set(
      root,
      "[data-comparatives-state]",
      `${pricedOnPage}/${pageItems.length} priced on page · `+
      `${totalPriced}/${data.catalog.length} total`
    );

    set(
      root,
      "[data-commodity-source]",
      pricedOnPage
        ? `${pricedOnPage} priced references on this page · missing values are not guessed`
        : "reference prices unavailable for this page"
    );

    set(
      root,
      "[data-commodity-updated]",
      data.updatedAt
        ? `updated ${new Date(data.updatedAt).toLocaleString()}`
        : "reference timestamp unavailable"
    );

    renderPageNav(root,state,data,btcUsd);
  }

  W.ZZXBitcoinTickerReferences=Object.freeze({
    __version:7,
    load,
    render,
    populatePages,
    setPage
  });
})();
