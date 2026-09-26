(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerWidgetModules?.__version>=2)return;

  const STORAGE="zzx.widget.bitcoin-ticker.widget-visibility.v2";

  function loadState(){
    try{
      const v=JSON.parse(localStorage.getItem(STORAGE)||"{}");
      return v&&typeof v==="object"?v:{};
    }catch(_){return {}}
  }

  function saveState(value){
    try{localStorage.setItem(STORAGE,JSON.stringify(value))}catch(_){}
  }

  function esc(id){
    try{return CSS.escape(id)}catch(_){return String(id).replace(/["\\]/g,"\\$&")}
  }

  function slotFor(id){
    const s=esc(id);
    return (
      D.querySelector(`.btc-slot[data-widget="${s}"]`) ||
      D.querySelector(`[data-widget-slot="${s}"]`) ||
      D.querySelector(`[data-widget-id="${s}"]`)
    );
  }

  function runtimeState(id){
    const slot=slotFor(id);
    if(!slot)return {state:"unavailable",slot:null,label:"not mounted"};

    const enabled=!slot.hidden && slot.getAttribute("data-ticker-visible")!=="false";
    if(!enabled)return {state:"off",slot,label:"off"};

    const reported=String(
      slot.getAttribute("data-status") ||
      slot.querySelector("[data-status]")?.getAttribute("data-status") ||
      ""
    ).toLowerCase();

    if(/error|offline|failed|stale/.test(reported)){
      return {state:"error",slot,label:reported||"error"};
    }
    if(/loading|pending|refresh|warn/.test(reported)){
      return {state:"loading",slot,label:reported||"loading"};
    }
    return {state:"on",slot,label:reported||"on"};
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
        detail:{id,visible:!!visible,mounted:!!slot}
      }));
    }catch(_){}

    return !!slot;
  }

  function visible(id){
    const state=loadState();
    if(Object.prototype.hasOwnProperty.call(state,id))return !!state[id];
    const slot=slotFor(id);
    return slot?!slot.hidden:false;
  }

  async function loadRegistry(){
    const raw="/__partials/widgets/bitcoin-ticker/widget-integrations.json";
    const target=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(target,{cacheBust:true,timeoutMs:7000,retries:1});
    }
    const r=await fetch(target,{cache:"no-store"});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function applyButtonState(button,id){
    const live=runtimeState(id);
    const requested=visible(id);
    let state=live.state;
    if(!requested)state="off";
    else if(!live.slot)state="unavailable";

    button.dataset.moduleState=state;
    button.setAttribute("aria-pressed",requested?"true":"false");
    button.setAttribute(
      "aria-label",
      `${button.dataset.moduleLabel||id}: ${state}`
    );
    const text=button.querySelector("[data-module-status]");
    if(text)text.textContent=state;
    const led=button.querySelector("[data-module-led]");
    if(led)led.title=state;
  }

  function createToggle(item){
    const b=D.createElement("button");
    b.type="button";
    b.className="bitcoin-ticker__widget-switch";
    b.dataset.widgetToggle=item.id;
    b.dataset.moduleLabel=String(item.label||item.id);

    const led=D.createElement("span");
    led.className="bitcoin-ticker__module-led";
    led.dataset.moduleLed="";

    const track=D.createElement("span");
    track.className="bitcoin-ticker__micro-switch";
    track.setAttribute("aria-hidden","true");
    const lever=D.createElement("span");
    lever.className="bitcoin-ticker__micro-switch-lever";
    track.appendChild(lever);

    const label=D.createElement("span");
    label.className="bitcoin-ticker__widget-switch-label";
    label.textContent=String(item.label||item.id);

    const status=D.createElement("span");
    status.className="bitcoin-ticker__widget-switch-state";
    status.dataset.moduleStatus="";

    b.append(led,track,label,status);
    applyButtonState(b,item.id);

    b.addEventListener("click",()=>{
      const next=!visible(item.id);
      setVisible(item.id,next);
      applyButtonState(b,item.id);
    });

    return b;
  }

  function updateAll(root){
    for(const b of root.querySelectorAll("[data-widget-toggle]")){
      applyButtonState(b,b.dataset.widgetToggle);
    }
  }

  function setAll(root,registry,visibleState){
    for(const item of registry.widgets||[])setVisible(item.id,visibleState);
    updateAll(root);
  }

  function render(root,registry){
    const host=root.querySelector("[data-widget-groups]");
    if(!host)return;
    host.replaceChildren();

    const toolbar=D.createElement("div");
    toolbar.className="bitcoin-ticker__module-toolbar";

    const on=D.createElement("button");
    on.type="button";
    on.className="zzx-widgets__btn";
    on.textContent="All ON";
    on.addEventListener("click",()=>setAll(root,registry,true));

    const off=D.createElement("button");
    off.type="button";
    off.className="zzx-widgets__btn";
    off.textContent="All OFF";
    off.addEventListener("click",()=>setAll(root,registry,false));

    const legend=D.createElement("span");
    legend.className="bitcoin-ticker__module-legend";
    legend.textContent="green: on · red: off · yellow: loading/error/unavailable";
    toolbar.append(on,off,legend);
    host.appendChild(toolbar);

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

      for(const item of items)buttons.appendChild(createToggle(item));

      section.append(h,buttons);
      host.appendChild(section);
    }
  }

  function patchSelection(selection){
    if(!selection)return;
    try{
      W.dispatchEvent(new CustomEvent("zzx:ticker-patch",{
        detail:{kind:"bpi-selection",selection}
      }));
    }catch(_){}
    W.ZZXSelectedPriceUsd=Number(selection.priceUsd);
    W.ZZXSelectedQuoteCurrency=String(selection.currency||"USD");
    W.ZZXSelectedQuotePrice=Number(selection.priceQuote);
  }

  async function mount(root){
    const registry=await loadRegistry();
    render(root,registry);

    const observer=new MutationObserver(()=>updateAll(root));
    observer.observe(D.body,{
      subtree:true,
      attributes:true,
      attributeFilter:["hidden","data-status","data-ticker-visible","class"]
    });
    root.__zzxTickerWidgetObserver=observer;

    W.addEventListener("zzx:bpi-selection",event=>patchSelection(event.detail));
    W.addEventListener("zzx:widget-status",()=>updateAll(root));
    W.addEventListener("zzx:ticker-widget-toggle",()=>updateAll(root));
    if(W.ZZXBPISelection)patchSelection(W.ZZXBPISelection);

    W.setInterval(()=>{
      if(root.isConnected)updateAll(root);
      else observer.disconnect();
    },2500);

    return registry;
  }

  const api=Object.freeze({
    __version:2,
    mount,
    setVisible,
    visible,
    runtimeState,
    updateAll,
    patchSelection
  });
  W.ZZXBitcoinTickerWidgetModules=api;
  W.ZZXBitcoinTickerWidgetBridge=api;
})();
