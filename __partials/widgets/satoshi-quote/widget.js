// __partials/widgets/satoshi-quote/widget.js
(function(){
  "use strict";

  const W=window,D=document,ID="satoshi-quote";

  function q(root,sel){
    return root?root.querySelector(sel):null;
  }

  function status(root,label,state){
    const el=q(root,"[data-sq-status]");
    if(!el)return;
    el.textContent=label;
    el.setAttribute("data-status",state||"offline");
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/satoshi-quote";

    for(const [globalName,relative] of [
      ["ZZXSatoshiQuoteSources","js/sources.js"],
      ["ZZXSatoshiQuoteModel","js/model.js"],
      ["ZZXSatoshiQuotePicker","js/picker.js"],
      ["ZZXSatoshiQuoteProvider","js/provider.js"]
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
        throw new Error(`${relative} did not register ${globalName}`);
      }
    }
  }

  function renderTags(root,item){
    const host=q(root,"[data-sq-tags]");
    host.replaceChildren();

    for(const category of item?.categories||[]){
      const tag=D.createElement("span");
      tag.className="satoshi-quote__tag";
      tag.textContent=category;
      host.appendChild(tag);
    }
  }

  function renderQuote(root,state,item){
    if(!item)return;

    q(root,"[data-sq-quote]").textContent=item.text;
    q(root,"[data-sq-source]").textContent=
      W.ZZXSatoshiQuoteModel.sourceLabel(item);

    q(root,"[data-sq-date]").textContent=
      item.date||"date unavailable";

    const link=q(root,"[data-sq-link]");
    link.href=W.ZZXSatoshiQuoteModel.sourceUrl(item);
    link.textContent=item.whitepaper?"whitepaper":"archive";

    renderTags(root,item);

    const filtered=W.ZZXSatoshiQuoteModel.filter(
      state.corpus.items,
      state.kind,
      state.category
    );

    q(root,"[data-sq-count]").textContent=
      `${filtered.length.toLocaleString()} / ${state.corpus.items.length.toLocaleString()} quotes`;

    status(root,state.auto?"auto":"paused",state.auto?"ok":"warn");
  }

  function rebuildPool(root,state){
    const items=W.ZZXSatoshiQuoteModel.filter(
      state.corpus.items,
      state.kind,
      state.category
    );

    state.picker.reset(items);

    if(!items.length){
      q(root,"[data-sq-quote]").textContent=
        "No quotes match the current filters.";
      q(root,"[data-sq-source]").textContent="—";
      q(root,"[data-sq-date]").textContent="—";
      q(root,"[data-sq-tags]").replaceChildren();
      q(root,"[data-sq-count]").textContent=
        `0 / ${state.corpus.items.length.toLocaleString()} quotes`;
      status(root,"empty","warn");
      return;
    }

    renderQuote(root,state,state.picker.next());
  }

  function populateCategories(root,state){
    const select=q(root,"[data-sq-category]");

    for(const category of state.corpus.categories){
      const option=D.createElement("option");
      option.value=category;
      option.textContent=category;
      select.appendChild(option);
    }
  }

  function schedule(root,state){
    if(state.timer){
      W.clearTimeout(state.timer);
      state.timer=null;
    }

    if(!state.auto||!root.isConnected)return;

    state.timer=W.setTimeout(()=>{
      if(!root.isConnected)return;
      renderQuote(root,state,state.picker.next());
      schedule(root,state);
    },W.ZZXSatoshiQuoteSources.rotationMs);
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      corpus:null,
      picker:null,
      kind:"all",
      category:"all",
      auto:true,
      timer:null
    };

    root.__zzxSatoshiQuoteState=state;

    try{
      await ensureModules(state.core);

      state.corpus=await W.ZZXSatoshiQuoteProvider.load(state.core);
      state.picker=new W.ZZXSatoshiQuotePicker.Picker();

      populateCategories(root,state);
      rebuildPool(root,state);

      q(root,"[data-sq-kind]")?.addEventListener("change",event=>{
        state.kind=event.currentTarget.value;
        rebuildPool(root,state);
        schedule(root,state);
      });

      q(root,"[data-sq-category]")?.addEventListener("change",event=>{
        state.category=event.currentTarget.value;
        rebuildPool(root,state);
        schedule(root,state);
      });

      q(root,"[data-sq-prev]")?.addEventListener("click",()=>{
        renderQuote(root,state,state.picker.prev());
        schedule(root,state);
      });

      q(root,"[data-sq-next]")?.addEventListener("click",()=>{
        renderQuote(root,state,state.picker.next());
        schedule(root,state);
      });

      q(root,"[data-sq-auto]")?.addEventListener("click",event=>{
        state.auto=!state.auto;
        event.currentTarget.textContent=state.auto?"Pause":"Resume";
        status(root,state.auto?"auto":"paused",state.auto?"ok":"warn");
        schedule(root,state);
      });

      q(root,"[data-sq-rotation]").textContent=
        `${Math.round(W.ZZXSatoshiQuoteSources.rotationMs/1000)}s rotation`;

      schedule(root,state);
    }catch(error){
      status(root,"offline","error");
      q(root,"[data-sq-quote]").textContent=
        "Satoshi quote corpus unavailable.";
      q(root,"[data-sq-source]").textContent=
        String(error?.message||error);
      q(root,"[data-sq-date]").textContent="—";
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
