(function(){
  "use strict";
  const W=window,D=document,ID="bitcoin-ticker";

  function q(root,sel){return root?root.querySelector(sel):null}
  function set(root,sel,value){const el=q(root,sel);if(el)el.textContent=String(value??"—")}
  function finite(v){const n=Number(v);return Number.isFinite(n)?n:NaN}
  function positive(v){const n=finite(v);return n>0?n:NaN}

  function safeGet(key){try{return W.localStorage.getItem(key)}catch(_){return null}}
  function safeSet(key,value){try{W.localStorage.setItem(key,String(value))}catch(_){}}

  function quoteDigits(value){
    const n=Math.abs(Number(value));
    if(!Number.isFinite(n))return 2;
    if(n>=1000)return 2;
    if(n>=1)return 4;
    if(n>=0.01)return 6;
    if(n>=0.0001)return 8;
    if(n>=1e-8)return 12;
    return 16;
  }

  function format(value){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";
    const d=quoteDigits(n);
    return n.toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:n>=1&&d<=4?2:0});
  }

  function compact(value,d=2){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";
    try{return n.toLocaleString(undefined,{notation:"compact",maximumFractionDigits:d})}
    catch(_){return n.toLocaleString(undefined,{maximumFractionDigits:d})}
  }

  function formatAge(timestamp){
    if(!timestamp)return "time unknown";
    const then=new Date(timestamp).getTime();
    if(!Number.isFinite(then))return "time unknown";
    const sec=Math.max(0,Math.floor((Date.now()-then)/1000));
    if(sec<5)return "updated now";
    if(sec<60)return `updated ${sec}s ago`;
    const min=Math.floor(sec/60);
    if(min<60)return `updated ${min}m ago`;
    return `updated ${Math.floor(min/60)}h ago`;
  }

  function status(root,label,state){
    const widget=q(root,"[data-bitcoin-ticker]")||root;
    widget.dataset.status=state;
    set(root,"[data-state-text]",label);
  }

  function helperModuleSrc(raw,minVersion){
    const resolved=W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw;
    if(!minVersion)return resolved;

    try{
      const url=new URL(resolved,W.location.href);
      url.searchParams.set("zzxmod",String(minVersion));
      return url.href;
    }catch(_){
      const sep=resolved.includes("?")?"&":"?";
      return `${resolved}${sep}zzxmod=${encodeURIComponent(minVersion)}`;
    }
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/bitcoin-ticker";

    for(const [globalName,relative,minVersion] of [
      ["ZZXBitcoinTickerConstants","js/constants.js",7],
      ["ZZXBitcoinTickerDeps","js/deps.js",7],
      ["ZZXBitcoinTickerFetch","js/fetch.js"],
      ["ZZXBitcoinTickerFX","js/fx.js"],
      ["ZZXBitcoinTickerSelection","js/selection.js",6],
      ["ZZXBitcoinTickerUnits","js/units.js"],
      ["ZZXBitcoinTickerReferences","js/references.js",6],
      ["ZZXBitcoinTickerDebts","js/debts.js",8],
      ["ZZXBitcoinTickerBalances","js/balances.js",1],
      ["ZZXBitcoinTickerPanels","js/panels.js",3],
      ["ZZXBitcoinTickerWidgetBridge","js/widget-bridge.js"],
      ["ZZXBitcoinTickerCharts","js/charts.js"]
    ]){
      if(
        W[globalName] &&
        (!minVersion || Number(W[globalName].__version||0)>=minVersion)
      )continue;
      const raw=`${base}/${relative}`;
      const src=helperModuleSrc(raw,minVersion);

      await new Promise((done,fail)=>{
        const s=D.createElement("script");
        s.src=src;s.defer=true;
        s.addEventListener("load",done,{once:true});
        s.addEventListener(
          "error",
          ()=>fail(new Error(`failed to load ${relative} from ${src}`)),
          {once:true}
        );
        (D.head||D.documentElement).appendChild(s);
      });

      if(
        !W[globalName] ||
        (minVersion && Number(W[globalName].__version||0)<minVersion)
      ){
        const actual=W[globalName]?.__version??"missing";
        throw new Error(
          `${relative} did not register compatible ${globalName}`+
          (minVersion?` (required >= ${minVersion}, got ${actual})`:"")
        );
      }
    }
  }

  async function loadConfig(state,force=false){
    const now=Date.now();
    if(!force&&state.config&&now-state.configAt<W.ZZXBitcoinTickerConstants.configTtlMs)return state.config;

    const E=W.ZZXBitcoinTickerConstants.endpoints;
    const [latest,exchangesData,currenciesData,ratesData,symbolsData]=await Promise.all([
      W.ZZXBitcoinTickerFetch.json(E.latest),
      W.ZZXBitcoinTickerFetch.json(E.exchanges,{optional:true}),
      W.ZZXBitcoinTickerFetch.json(E.currencies,{optional:true}),
      W.ZZXBitcoinTickerFetch.json(E.rates,{optional:true}),
      W.ZZXBitcoinTickerFetch.json(E.symbols,{optional:true})
    ]);

    const fiat=W.ZZXBitcoinTickerFX.catalog(currenciesData||{});
    const symbols=W.ZZXBitcoinTickerFX.symbols(symbolsData||{});
    const rates=W.ZZXBitcoinTickerFX.localRates(ratesData||{});

    state.config={latest,exchangesData,currenciesData,ratesData,symbolsData,fiat,symbols,rates};
    state.configAt=now;
    return state.config;
  }

  function populateSources(root,config){
    const select=q(root,"[data-source-select]");
    if(!select)return;
    const wanted=safeGet(W.ZZXBitcoinTickerConstants.storage.source)||"bpi";

    select.replaceChildren();

    for(const [value,label] of [["bpi","BPI"],["global-bpi","Global BPI"]]){
      const o=D.createElement("option");o.value=value;o.textContent=label;select.appendChild(o);
    }

    const liveRows=config.latest?.exchanges||{};

    for(const [id,row] of W.ZZXBitcoinTickerSelection.exchangeMap(config)){
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

  function populateCurrencies(root,config){
    const select=q(root,"[data-currency-select]");
    if(!select)return;
    const wanted=safeGet(W.ZZXBitcoinTickerConstants.storage.quote)||"USD";

    select.replaceChildren();
    for(const code of config.fiat.order){
      const o=D.createElement("option");
      o.value=code;
      o.textContent=`${code} — ${config.fiat.names.get(code)||code}`;
      select.appendChild(o);
    }

    if(!select.options.length){
      const o=D.createElement("option");o.value="USD";o.textContent="USD — US Dollar";select.appendChild(o);
    }

    select.value=[...select.options].some(o=>o.value===wanted)?wanted:"USD";
  }

  function renderDenoms(root,priceQuote,symbol){
    const grid=q(root,"[data-denom-grid]");
    if(!grid)return;
    grid.replaceChildren();

    for(const unit of W.ZZXBitcoinTickerUnits.units){
      const card=D.createElement("div");
      card.className="bitcoin-ticker__denom";

      const label=D.createElement("span");
      label.className="bitcoin-ticker__denom-label";
      label.textContent=unit.label+(unit.displayOnly?" · display-only":"");

      const strong=D.createElement("strong");
      strong.textContent=`${symbol}${format(W.ZZXBitcoinTickerUnits.value(priceQuote,unit))}`;

      card.append(label,strong);
      grid.appendChild(card);
    }
  }

  function spreadPct(high,low){
    const h=positive(high),l=positive(low);
    return Number.isFinite(h)&&Number.isFinite(l)?((h-l)/l)*100:NaN;
  }

  async function render(root,state,force=false){
    const config=await loadConfig(state,force);
    const staticLatest=await W.ZZXBitcoinTickerFetch.json(W.ZZXBitcoinTickerConstants.endpoints.latest);
    const liveLatest=W.ZZXLiveBPI?.snapshot?.();
    const liveAge=liveLatest?.updated_at?Date.now()-new Date(liveLatest.updated_at).getTime():Infinity;
    config.latest=(liveLatest&&Number.isFinite(liveAge)&&liveAge<15_000)?liveLatest:staticLatest;

    const sourceId=q(root,"[data-source-select]")?.value||"bpi";
    const currency=q(root,"[data-currency-select]")?.value||"USD";

    const quote=W.ZZXBitcoinTickerSelection.resolve(config,sourceId);
    if(!quote)throw new Error(`No usable quote for ${sourceId}`);

    const fx=await W.ZZXBitcoinTickerFX.rate(config,currency);
    const priceQuote=W.ZZXBitcoinTickerFX.quoteFromUsd(quote.priceUsd,fx.rate);
    const highQuote=W.ZZXBitcoinTickerFX.quoteFromUsd(quote.highUsd,fx.rate);
    const lowQuote=W.ZZXBitcoinTickerFX.quoteFromUsd(quote.lowUsd,fx.rate);

    if(!Number.isFinite(priceQuote))throw new Error(`Invalid ${currency} conversion`);

    const symbol=config.symbols.get(currency)||`${currency} `;

    set(root,"[data-currency-symbol]",symbol);
    set(root,"[data-currency-label]",currency);
    set(root,"[data-btc]",format(priceQuote));
    set(root,"[data-source-label]",quote.label);
    set(root,"[data-update-age]",formatAge(quote.timestamp));
    set(root,"[data-high]",Number.isFinite(highQuote)?`${symbol}${format(highQuote)}`:"—");
    set(root,"[data-low]",Number.isFinite(lowQuote)?`${symbol}${format(lowQuote)}`:"—");
    set(root,"[data-volume]",Number.isFinite(quote.volumeBtc)?`${compact(quote.volumeBtc,2)} BTC`:"—");

    const spread=spreadPct(quote.highUsd,quote.lowUsd);
    set(root,"[data-spread]",Number.isFinite(spread)?`${spread.toFixed(2)}%`:"—");

    renderDenoms(root,priceQuote,symbol);

    const age=quote.timestamp?Date.now()-new Date(quote.timestamp).getTime():NaN;
    const stale=Number.isFinite(age)&&age>W.ZZXBitcoinTickerConstants.staleAfterMs;

    set(root,"[data-provider-detail]",
      `${quote.label} · ${quote.mode} · FX ${fx.provider} · 1 USD = ${format(fx.rate)} ${currency}`
    );

    const selection=W.ZZXBitcoinTickerSelection.publish({
      sourceId:quote.sourceId,
      sourceType:quote.sourceType,
      exchangeId:quote.exchangeId||null,
      label:quote.label,
      currency,
      priceUsd:quote.priceUsd,
      priceQuote,
      fxRate:fx.rate,
      fxProvider:fx.provider,
      highUsd:quote.highUsd,
      lowUsd:quote.lowUsd,
      volumeBtc:quote.volumeBtc,
      timestamp:quote.timestamp,
      mode:quote.mode
    });

    state.selection=selection;

    if(!state.references){
      state.references=await W.ZZXBitcoinTickerReferences.load(false);
      W.ZZXBitcoinTickerReferences.populateCategories(root,state.references.catalog);
    }
    W.ZZXBitcoinTickerReferences.render(root,state,quote.priceUsd);

    const tip=await W.ZZXChain.tipHeight(false);
    const height=Number(tip?.height);
    const issued=Number.isFinite(height)?W.ZZXChain.issuedSatsAtHeight(height):null;

    if(!state.debts){
      state.debts=await W.ZZXBitcoinTickerDebts.load(false);
      W.ZZXBitcoinTickerDebts.populate(root,state.debts);
    }
    W.ZZXBitcoinTickerDebts.render(root,state.debts,height,issued);

    if(!state.balances){
      state.balances=await W.ZZXBitcoinTickerBalances.load(false);
      W.ZZXBitcoinTickerBalances.populate(root,state.balances);
    }
    W.ZZXBitcoinTickerBalances.render(
      root,
      state.balances,
      height,
      issued
    );

    state.chainHeight=height;
    state.issuedSats=issued;

    W.ZZXBitcoinTickerPanels?.update?.(root,state);

    status(root,stale?"Stale":"Live",stale?"stale":"ok");
  }

  async function refresh(root,state,force=false){
    if(state.busy||!root.isConnected){
      state.queued=state.busy;
      return;
    }

    state.busy=true;
    status(root,"Loading","stale");

    try{
      if(force){
        state.configAt=0;
        state.references=null;
        state.debts=null;
        state.balances=null;
      }
      await render(root,state,force);
    }catch(error){
      status(root,state.selection?"Stale":"Offline",state.selection?"stale":"error");
      set(root,"[data-provider-detail]",`ERROR: ${String(error?.message||error)}`);
    }finally{
      state.busy=false;
      if(state.queued){
        state.queued=false;
        refresh(root,state,false);
      }
    }
  }

  async function boot(root,core){
    if(!root)return;

    const state={
      core:core||W.ZZXWidgetsCore||null,
      config:null,configAt:0,references:null,debts:null,balances:null,
      chainHeight:NaN,issuedSats:null,
      selection:null,busy:false,queued:false,timer:null,referencePage:0
    };
    root.__zzxBitcoinTickerState=state;

    try{
      await ensureModules(state.core);
      await W.ZZXBitcoinTickerDeps.ensureShared();
      W.ZZXLiveBPI.start().catch(()=>{});

      const config=await loadConfig(state,false);
      populateSources(root,config);
      populateCurrencies(root,config);

      W.ZZXBitcoinTickerPanels.mount(root,state);

      try{
        await W.ZZXBitcoinTickerWidgetBridge.mount(root);
      }catch(error){
        set(root,"[data-provider-detail]",`widget bridge: ${String(error?.message||error)}`);
      }

      try{
        await W.ZZXBitcoinTickerCharts.mount(root);
      }catch(error){
        set(root,"[data-chart-status]",`chart engine: ${String(error?.message||error)}`);
      }

      W.addEventListener("zzx:live-bpi",event=>{
        if(event?.detail&&state.config){
          state.config.latest=event.detail;
          populateSources(root,state.config);
        }
        refresh(root,state,false);
      });

      q(root,"[data-source-select]")?.addEventListener("change",event=>{
        safeSet(W.ZZXBitcoinTickerConstants.storage.source,event.currentTarget.value);
        refresh(root,state,true);
      });

      q(root,"[data-currency-select]")?.addEventListener("change",event=>{
        safeSet(W.ZZXBitcoinTickerConstants.storage.quote,event.currentTarget.value);
        refresh(root,state,false);
      });

      let searchTimer=null;
      q(root,"[data-reference-search]")?.addEventListener("input",()=>{
        if(searchTimer)W.clearTimeout(searchTimer);
        searchTimer=W.setTimeout(()=>{
          state.referencePage=0;
          if(state.references&&state.selection)W.ZZXBitcoinTickerReferences.render(root,state,state.selection.priceUsd);
        },120);
      });

      q(root,"[data-reference-category]")?.addEventListener("change",()=>{
        state.referencePage=0;
        if(state.references&&state.selection)W.ZZXBitcoinTickerReferences.render(root,state,state.selection.priceUsd);
      });

      q(root,"[data-reference-prev]")?.addEventListener("click",()=>{
        state.referencePage=Math.max(0,state.referencePage-1);
        if(state.references&&state.selection)W.ZZXBitcoinTickerReferences.render(root,state,state.selection.priceUsd);
      });

      q(root,"[data-reference-next]")?.addEventListener("click",()=>{
        state.referencePage+=1;
        if(state.references&&state.selection)W.ZZXBitcoinTickerReferences.render(root,state,state.selection.priceUsd);
      });

      q(root,"[data-debt-country]")?.addEventListener("change",event=>{
        safeSet(
          W.ZZXBitcoinTickerConstants.storage.debtCountry,
          event.currentTarget.value
        );

        if(state.debts){
          W.ZZXBitcoinTickerDebts.render(
            root,
            state.debts,
            state.chainHeight,
            state.issuedSats
          );
        }
      });

      q(root,"[data-balance-country]")?.addEventListener("change",event=>{
        safeSet(
          W.ZZXBitcoinTickerConstants.storage.balanceCountry,
          event.currentTarget.value
        );

        if(state.balances){
          W.ZZXBitcoinTickerBalances.render(
            root,
            state.balances,
            state.chainHeight,
            state.issuedSats
          );
        }
      });

      await refresh(root,state,false);

      async function loop(){
        if(!root.isConnected)return;
        await refresh(root,state,false);
        state.timer=W.setTimeout(loop,W.ZZXBitcoinTickerConstants.refreshMs);
      }
      state.timer=W.setTimeout(loop,W.ZZXBitcoinTickerConstants.refreshMs);
    }catch(error){
      status(root,"Offline","error");
      set(root,"[data-provider-detail]",String(error?.message||error));
    }
  }

  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();
