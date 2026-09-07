(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerWidgetBridge?.__version>=1)return;

  const STORAGE="zzx.widget.bitcoin-ticker.widget-visibility.v1";

  function loadState(){
    try{
      const v=JSON.parse(localStorage.getItem(STORAGE)||"{}");
      return v&&typeof v==="object"?v:{};
    }catch(_){return {}}
  }

  function saveState(value){
    try{localStorage.setItem(STORAGE,JSON.stringify(value))}catch(_){}
  }

  function slotFor(id){
    return (
      D.querySelector(`.btc-slot[data-widget="${CSS.escape(id)}"]`) ||
      D.querySelector(`[data-widget-slot="${CSS.escape(id)}"]`)
    );
  }

  function setVisible(id,visible){
    const slot=slotFor(id);
    if(slot){
      slot.hidden=!visible;
      slot.setAttribute("data-ticker-visible",visible?"true":"false");
    }

    const state=loadState();
    state[id]=!!visible;
    saveState(state);

    try{
      W.dispatchEvent(new CustomEvent("zzx:ticker-widget-toggle",{
        detail:{id,visible:!!visible}
      }));
    }catch(_){}

    return !!slot;
  }

  function visible(id){
    const state=loadState();
    if(Object.prototype.hasOwnProperty.call(state,id))return !!state[id];
    const slot=slotFor(id);
    return slot? !slot.hidden:false;
  }

  async function loadRegistry(root){
    const base=W.ZZXAPI?.url
      ? W.ZZXAPI.url("/__partials/widgets/bitcoin-ticker/widget-integrations.json")
      : "/__partials/widgets/bitcoin-ticker/widget-integrations.json";

    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(base,{cacheBust:true,timeoutMs:7000,retries:1});
    }
    const r=await fetch(base,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function render(root,registry){
    const host=root.querySelector("[data-widget-groups]");
    if(!host)return;
    host.replaceChildren();

    const groups=new Map();
    for(const item of registry.widgets||[]){
      const name=String(item.group||"Other");
      if(!groups.has(name))groups.set(name,[]);
      groups.get(name).push(item);
    }

    for(const [group,items] of groups){
      const section=D.createElement("section");
      section.className="bitcoin-ticker__widget-group";

      const h=D.createElement("h4");
      h.textContent=group;

      const buttons=D.createElement("div");
      buttons.className="bitcoin-ticker__widget-buttons";

      for(const item of items){
        const b=D.createElement("button");
        b.type="button";
        b.className="bitcoin-ticker__widget-toggle";
        b.textContent=item.label;
        b.dataset.widgetToggle=item.id;
        b.setAttribute("aria-pressed",visible(item.id)?"true":"false");
        b.title=`Toggle ${item.id}`;

        b.addEventListener("click",()=>{
          const next=b.getAttribute("aria-pressed")!=="true";
          setVisible(item.id,next);
          b.setAttribute("aria-pressed",next?"true":"false");
        });

        buttons.appendChild(b);
      }

      section.append(h,buttons);
      host.appendChild(section);
    }
  }

  function patchSelection(selection){
    if(!selection)return;

    try{
      W.dispatchEvent(new CustomEvent("zzx:ticker-patch",{
        detail:{
          kind:"bpi-selection",
          selection
        }
      }));
    }catch(_){}

    // Legacy/global compatibility for widgets that only know how to read a shared current price.
    W.ZZXSelectedPriceUsd=Number(selection.priceUsd);
    W.ZZXSelectedQuoteCurrency=String(selection.currency||"USD");
    W.ZZXSelectedQuotePrice=Number(selection.priceQuote);
  }

  async function mount(root){
    const registry=await loadRegistry(root);
    render(root,registry);

    W.addEventListener("zzx:bpi-selection",event=>patchSelection(event.detail));
    if(W.ZZXBPISelection)patchSelection(W.ZZXBPISelection);

    return registry;
  }

  W.ZZXBitcoinTickerWidgetBridge=Object.freeze({
    __version:1,
    mount,
    setVisible,
    visible,
    patchSelection
  });
})();
