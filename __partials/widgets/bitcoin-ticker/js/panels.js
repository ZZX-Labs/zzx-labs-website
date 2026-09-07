(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerPanels?.__version>=4)return;

  const KEY="zzx.widget.bitcoin-ticker.panels.v1";
  const categoryButtons=[
    {id:"exchanges",label:"Exchanges",panel:"exchanges"},
    {id:"fx",label:"Exchange Rates",panel:"fx"},
    {id:"reference-markets",label:"Purchasing Power",panel:"references",referencePage:"tobacco"},
    {id:"ref-tobacco",label:"Tobacco",panel:"references",referencePage:"tobacco"},
    {id:"ref-alcohol",label:"Alcohol",panel:"references",referencePage:"alcohol"},
    {id:"ref-cannabis",label:"Cannabis",panel:"references",referencePage:"cannabis"},
    {id:"ref-kief-hash",label:"Kief & Hash",panel:"references",referencePage:"kief-hash"},
    {id:"ref-concentrates",label:"Concentrates",panel:"references",referencePage:"concentrates"},
    {id:"ref-commodities",label:"Commodities",panel:"references",referencePage:"commodities"},
    {id:"ref-precious-metals",label:"Precious Metals",panel:"references",referencePage:"precious-metals"},
    {id:"ref-semi-precious-metals",label:"Semi Precious Metals",panel:"references",referencePage:"semi-precious-metals"},
    {id:"ref-precious-gemstones",label:"Precious Gem Stones",panel:"references",referencePage:"precious-gemstones"},
    {id:"ref-semi-precious-gemstones",label:"Semi Precious Gemstones",panel:"references",referencePage:"semi-precious-gemstones"},
    {id:"ref-collectibles",label:"Collectibles",panel:"references",referencePage:"collectibles"},
    {id:"ref-water",label:"Water",panel:"references",referencePage:"water"},
    {id:"ref-oil",label:"Oil",panel:"references",referencePage:"oil"},
    {id:"ref-fuels",label:"Fuels",panel:"references",referencePage:"fuels"},
    {id:"ref-arms",label:"Arms",panel:"references",referencePage:"arms"},
    {id:"ref-ammo",label:"Ammo",panel:"references",referencePage:"ammo"},
    {id:"debts",label:"National Debts",panel:"debts"},
    {id:"balances",label:"National Balances",panel:"balances"},
    {id:"widgets",label:"Widget Modules",panel:"widgets"},
    {id:"charts",label:"Charts",panel:"charts"}
  ];

  function safeLoad(){
    try{
      const p=JSON.parse(localStorage.getItem(KEY)||"{}");
      return p&&typeof p==="object"?p:{};
    }catch(_){return {}}
  }

  function safeSave(state){
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(_){}
  }

  function setPanel(root,panel,open){
    const el=root.querySelector(`[data-panel="${panel}"]`);
    if(!el)return;
    el.hidden=!open;

    for(const button of root.querySelectorAll(`[data-panel-nav] [data-open-panel="${panel}"]`)){
      button.setAttribute("aria-expanded",open?"true":"false");
    }

    const state=safeLoad();
    state[panel]=!!open;
    safeSave(state);

    if(panel==="charts"&&open){
      requestAnimationFrame(()=>{
        root.__zzxTickerChartState?.chart?.resize?.();
      });
    }
  }

  function openReferencePage(root,pageId){
    setPanel(root,"references",true);

    const state=root.__zzxBitcoinTickerState;
    const btcUsd=Number(state?.selection?.priceUsd);

    if(
      state?.references &&
      W.ZZXBitcoinTickerReferences?.setPage
    ){
      W.ZZXBitcoinTickerReferences.setPage(
        root,
        state,
        pageId,
        btcUsd
      );
      return;
    }

    const select=root.querySelector(
      "[data-reference-page-select]"
    );

    if(
      select &&
      [...select.options].some(
        option=>option.value===pageId
      )
    ){
      select.value=pageId;
      select.dispatchEvent(
        new Event("change",{bubbles:true})
      );
    }
  }

  function renderNav(root){
    const nav=root.querySelector("[data-panel-nav]");
    if(!nav)return;
    nav.replaceChildren();

    const saved=safeLoad();

    for(const spec of categoryButtons){
      const b=D.createElement("button");
      b.type="button";
      b.className="bitcoin-ticker__panel-toggle";
      b.textContent=spec.label;
      b.dataset.openPanel=spec.panel;
      if(spec.referencePage){
        b.dataset.referencePage=spec.referencePage;
      }

      const open=!!saved[spec.panel];
      b.setAttribute("aria-expanded",open?"true":"false");

      b.addEventListener("click",()=>{
        if(spec.referencePage){
          openReferencePage(root,spec.referencePage);
          return;
        }
        const panel=root.querySelector(`[data-panel="${spec.panel}"]`);
        setPanel(root,spec.panel,!!panel?.hidden);
      });

      nav.appendChild(b);
    }

    for(const [panel,open] of Object.entries(saved)){
      if(open)setPanel(root,panel,true);
    }

    for(const b of root.querySelectorAll("[data-panel-close]")){
      b.addEventListener("click",()=>setPanel(root,b.dataset.panelClose,false));
    }
  }

  function renderFx(root,state){
    const grid=root.querySelector("[data-fx-grid]");
    if(!grid)return;

    const cfg=state?.config;
    const rates=cfg?.rates;
    const fiat=cfg?.fiat;
    if(!rates||!fiat)return;

    const needle=String(root.querySelector("[data-fx-search]")?.value||"").trim().toLowerCase();
    const rows=[];

    for(const code of fiat.order||[]){
      const rate=Number(rates.get(code));
      if(!(Number.isFinite(rate)&&rate>0))continue;
      const name=String(fiat.names.get(code)||code);
      if(needle&&!`${code} ${name}`.toLowerCase().includes(needle))continue;
      rows.push({code,name,rate});
    }

    grid.replaceChildren();

    for(const row of rows){
      const card=D.createElement("div");
      card.className="bitcoin-ticker__fx-card";

      const code=D.createElement("span");
      code.textContent=`1 USD → ${row.code}`;

      const strong=D.createElement("strong");
      strong.textContent=row.rate.toLocaleString(undefined,{maximumFractionDigits:8});

      const small=D.createElement("small");
      small.textContent=row.name;

      card.append(code,strong,small);
      grid.appendChild(card);
    }

    const count=root.querySelector("[data-fx-count]");
    if(count)count.textContent=`${rows.length} available rates`;
  }

  function renderExchanges(root,state){
    const body=root.querySelector("[data-exchange-market-rows]");
    if(!body)return;

    const latest=state?.config?.latest;
    const rows=latest?.exchanges&&typeof latest.exchanges==="object"
      ? Object.entries(latest.exchanges)
      : [];

    const checked=rows.map(([id,row])=>{
      const eligible=W.ZZXBitcoinTickerSelection?.exchangeEligible
        ? W.ZZXBitcoinTickerSelection.exchangeEligible(
            state?.config,
            id,
            row
          )
        : row?.index_eligible!==false;

      const safeWeight=
        eligible&&Number.isFinite(Number(row?.weight))
          ? Number(row.weight)
          : 0;

      return {id,row,eligible,safeWeight};
    });

    checked.sort((a,b)=>{
      if(a.eligible!==b.eligible)return a.eligible?-1:1;
      return b.safeWeight-a.safeWeight;
    });

    body.replaceChildren();

    let activeCount=0;
    let quarantinedCount=0;

    for(const {id,row,eligible,safeWeight} of checked){
      const tr=D.createElement("tr");

      if(eligible){
        activeCount+=1;
      }else{
        quarantinedCount+=1;
        tr.dataset.marketState="quarantined";
        tr.title=String(
          row.exclusion_reason ||
          state?.config?.exchangesData?.sources?.[id]?.notes ||
          "Excluded from BPI by market sanity policy"
        );
      }

      const label=eligible
        ? (row.label||id)
        : `${row.label||id} · QUARANTINED`;

      const quote=Array.isArray(row.fiat_quotes)
        ? row.fiat_quotes.join(", ")
        : (row.quote||"—");

      const price=
        eligible&&Number.isFinite(Number(row.price_usd))
          ? Number(row.price_usd).toLocaleString(undefined,{
              style:"currency",
              currency:"USD",
              maximumFractionDigits:2
            })
          : "—";

      const volume=
        eligible&&Number.isFinite(Number(row.volume_24h_btc))
          ? `${Number(row.volume_24h_btc).toLocaleString(undefined,{maximumFractionDigits:2})} BTC`
          : "—";

      const weight=eligible
        ? `${(safeWeight*100).toFixed(3)}%`
        : "0.000%";

      const updated=row.updated_at
        ? new Date(row.updated_at).toLocaleTimeString()
        : "—";

      for(const value of [label,quote,price,volume,weight,updated]){
        const td=D.createElement("td");
        td.textContent=String(value);
        tr.appendChild(td);
      }

      body.appendChild(tr);
    }

    const meta=root.querySelector("[data-exchange-market-meta]");
    if(meta){
      meta.textContent=
        `${activeCount} active exchange sources`+
        (quarantinedCount
          ? ` · ${quarantinedCount} quarantined`
          : "")+
        " · BPI sanity gated";
    }
  }

  function update(root,state){
    renderFx(root,state);
    renderExchanges(root,state);
  }

  function mount(root,state){
    renderNav(root);

    let timer=null;
    root.querySelector("[data-fx-search]")?.addEventListener("input",()=>{
      if(timer)clearTimeout(timer);
      timer=setTimeout(()=>renderFx(root,state),100);
    });

    update(root,state);
  }

  W.ZZXBitcoinTickerPanels=Object.freeze({
    __version:4,
    mount,
    update,
    setPanel,
    openReferencePage
  });
})();
