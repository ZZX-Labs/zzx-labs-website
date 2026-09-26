(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerPanels?.__version>=6)return;

  const KEY="zzx.widget.bitcoin-ticker.panels.v1";

  function categoryButtons(){
    return [
      {id:"fx",label:"Exchange Rates",panel:"fx"},
      {id:"exchanges",label:"Exchanges",panel:"exchanges"},
      ...(W.ZZXBitcoinTickerPurchasingPower?.navigation?.()||[]),
      {id:"debts",label:"National Debts",panel:"debts"},
      {id:"balances",label:"National Balances",panel:"balances"},
      {id:"widgets",label:"Widget Modules",panel:"widgets"},
      {id:"charts",label:"Charts",panel:"charts"}
    ];
  }

  function safeLoad(){
    try{const p=JSON.parse(localStorage.getItem(KEY)||"{}");return p&&typeof p==="object"?p:{}}
    catch(_){return {}}
  }
  function safeSave(state){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(_){}}

  function setPanel(root,panel,open){
    const el=root.querySelector(`[data-panel="${panel}"]`);
    if(!el)return;
    el.hidden=!open;
    for(const button of root.querySelectorAll(`[data-panel-nav] [data-open-panel="${panel}"]`)){
      button.setAttribute("aria-expanded",open?"true":"false");
    }
    const state=safeLoad();state[panel]=!!open;safeSave(state);
    if(panel==="charts"&&open){
      requestAnimationFrame(()=>root.__zzxTickerChartState?.chart?.resize?.());
    }
  }

  function openReferencePage(root,pageId){
    setPanel(root,"references",true);
    const state=root.__zzxBitcoinTickerState;
    const btcUsd=Number(state?.selection?.priceUsd);
    if(state?.references&&W.ZZXBitcoinTickerPurchasingPower?.setPage){
      W.ZZXBitcoinTickerPurchasingPower.setPage(root,state,pageId,btcUsd);
      return;
    }
    const select=root.querySelector("[data-reference-page-select]");
    if(select&&[...select.options].some(option=>option.value===pageId)){
      select.value=pageId;
      select.dispatchEvent(new Event("change",{bubbles:true}));
    }
  }

  function renderNav(root){
    const nav=root.querySelector("[data-panel-nav]");
    if(!nav)return;
    nav.replaceChildren();
    const saved=safeLoad();

    for(const spec of categoryButtons()){
      const b=D.createElement("button");
      b.type="button";
      b.className="bitcoin-ticker__panel-toggle";
      b.textContent=spec.label;
      b.dataset.openPanel=spec.panel;
      if(spec.referencePage)b.dataset.referencePage=spec.referencePage;
      const open=!!saved[spec.panel];
      b.setAttribute("aria-expanded",open?"true":"false");
      b.addEventListener("click",()=>{
        if(spec.referencePage){openReferencePage(root,spec.referencePage);return;}
        const panel=root.querySelector(`[data-panel="${spec.panel}"]`);
        setPanel(root,spec.panel,!!panel?.hidden);
      });
      nav.appendChild(b);
    }

    for(const [panel,open] of Object.entries(saved))if(open)setPanel(root,panel,true);
    for(const b of root.querySelectorAll("[data-panel-close]")){
      b.addEventListener("click",()=>setPanel(root,b.dataset.panelClose,false));
    }
  }

  function update(root,state){
    W.ZZXBitcoinTickerExchangeRates?.render?.(root,state);
    W.ZZXBitcoinTickerExchanges?.render?.(root,state);
  }

  function mount(root,state){
    renderNav(root);
    W.ZZXBitcoinTickerExchangeRates?.mount?.(root,state);
    W.ZZXBitcoinTickerExchanges?.mount?.(root,state);
    update(root,state);
  }

  W.ZZXBitcoinTickerPanels=Object.freeze({
    __version:6,categoryButtons,mount,update,setPanel,openReferencePage
  });
})();
