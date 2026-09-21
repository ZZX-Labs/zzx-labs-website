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

    const categoryModules=[
      ["tobacco","ZZXBitcoinTickerPurchasingPowerCategoryTobacco"],
      ["alcohol","ZZXBitcoinTickerPurchasingPowerCategoryAlcohol"],
      ["cannabis","ZZXBitcoinTickerPurchasingPowerCategoryCannabis"],
      ["kief-hash","ZZXBitcoinTickerPurchasingPowerCategoryKiefHash"],
      ["concentrates","ZZXBitcoinTickerPurchasingPowerCategoryConcentrates"],
      ["commodities","ZZXBitcoinTickerPurchasingPowerCategoryCommodities"],
      ["precious-metals","ZZXBitcoinTickerPurchasingPowerCategoryPreciousMetals"],
      ["semi-precious-metals","ZZXBitcoinTickerPurchasingPowerCategorySemiPreciousMetals"],
      ["precious-gemstones","ZZXBitcoinTickerPurchasingPowerCategoryPreciousGemstones"],
      ["semi-precious-gemstones","ZZXBitcoinTickerPurchasingPowerCategorySemiPreciousGemstones"],
      ["collectibles","ZZXBitcoinTickerPurchasingPowerCategoryCollectibles"],
      ["water","ZZXBitcoinTickerPurchasingPowerCategoryWater"],
      ["oil","ZZXBitcoinTickerPurchasingPowerCategoryOil"],
      ["fuels","ZZXBitcoinTickerPurchasingPowerCategoryFuels"],
      ["arms","ZZXBitcoinTickerPurchasingPowerCategoryArms"],
      ["ammo","ZZXBitcoinTickerPurchasingPowerCategoryAmmo"]
    ];

    const modules=[
      ["ZZXBitcoinTickerConstants","js/constants.js",9],
      ["ZZXBitcoinTickerDeps","js/deps.js",7],
      ["ZZXBitcoinTickerFetch","js/fetch.js"],
      ["ZZXBitcoinTickerSelection","js/selection.js",7],
      ["ZZXBitcoinTickerUnits","js/units.js"],
      ["ZZXBitcoinTickerExchangeRates","js/exchange-rates.js",1],
      ["ZZXBitcoinTickerExchanges","js/exchanges.js",1],
      ["ZZXBitcoinTickerPurchasingPowerRegistry","js/purchasing-power/registry.js",1],
      ...categoryModules.map(([id,globalName])=>[globalName,`js/purchasing-power/${id}.js`]),
      ["ZZXBitcoinTickerPurchasingPower","js/purchasing-power.js",1],
      ["ZZXBitcoinTickerNationalDebts","js/national-debts.js",1],
      ["ZZXBitcoinTickerNationalBalances","js/national-balances.js",1],
      ["ZZXBitcoinTickerPanels","js/panels.js",5],
      ["ZZXBitcoinTickerWidgetModules","js/widget-modules.js",1],
      ["ZZXBitcoinTickerCharts","js/charts.js",1]
    ];

    for(const [globalName,relative,minVersion] of modules){
      if(
        globalName &&
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
        globalName &&
        (!W[globalName] ||
          (minVersion && Number(W[globalName].__version||0)<minVersion))
      ){
        const actual=W[globalName]?.__version??"missing";
        throw new Error(
          `${relative} did not register compatible ${globalName}`+
          (minVersion?` (required >= ${minVersion}, got ${actual})`:"")
        );
      }
    }

    const pageCount=W.ZZXBitcoinTickerPurchasingPowerRegistry?.list?.().length||0;
    if(pageCount!==categoryModules.length){
      throw new Error(
        `purchasing-power category registry incomplete: ${pageCount}/${categoryModules.length}`
      );
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

    const fiat=W.ZZXBitcoinTickerExchangeRates.catalog(currenciesData||{});
    const symbols=W.ZZXBitcoinTickerExchangeRates.symbols(symbolsData||{});
    const rates=W.ZZXBitcoinTickerExchangeRates.localRates(ratesData||{});

    state.config={latest,exchangesData,currenciesData,ratesData,symbolsData,fiat,symbols,rates};
    state.configAt=now;
    if(latest){
      state.lastGoodLatest=latest;
      state.lastGoodLatestAt=now;
      state.lastStaticLatestFetchAt=now;
    }
    return state.config;
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
    const C=W.ZZXBitcoinTickerConstants;
    const now=Date.now();
    const liveLatest=W.ZZXLiveBPI?.snapshot?.();
    const liveAt=liveLatest?.updated_at?new Date(liveLatest.updated_at).getTime():NaN;
    const liveAge=Number.isFinite(liveAt)?now-liveAt:Infinity;

    if(liveLatest&&liveAge>=0&&liveAge<C.liveFreshMs){
      config.latest=liveLatest;
      state.lastGoodLatest=liveLatest;
      state.lastGoodLatestAt=now;
    }else if(
      !state.lastGoodLatest ||
      now-state.lastStaticLatestFetchAt>=C.latestFallbackTtlMs
    ){
      try{
        const staticLatest=await W.ZZXBitcoinTickerFetch.json(C.endpoints.latest);
        if(staticLatest){
          config.latest=staticLatest;
          state.lastGoodLatest=staticLatest;
          state.lastGoodLatestAt=now;
        }
        state.lastStaticLatestFetchAt=now;
      }catch(error){
        if(state.lastGoodLatest)config.latest=state.lastGoodLatest;
        else throw error;
      }
    }else if(state.lastGoodLatest){
      config.latest=state.lastGoodLatest;
    }

    const sourceId=q(root,"[data-source-select]")?.value||"bpi";
    const currency=q(root,"[data-currency-select]")?.value||"USD";

    const quote=W.ZZXBitcoinTickerSelection.resolve(config,sourceId);
    if(!quote)throw new Error(`No usable quote for ${sourceId}`);

    const fx=await W.ZZXBitcoinTickerExchangeRates.rate(config,currency);
    const priceQuote=W.ZZXBitcoinTickerExchangeRates.quoteFromUsd(quote.priceUsd,fx.rate);
    const highQuote=W.ZZXBitcoinTickerExchangeRates.quoteFromUsd(quote.highUsd,fx.rate);
    const lowQuote=W.ZZXBitcoinTickerExchangeRates.quoteFromUsd(quote.lowUsd,fx.rate);

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
      mode:quote.mode,
      weightingMode:quote.weightingMode||"off",
      weightingApplied:!!quote.weightingApplied,
      weightedPriceUsd:quote.weightedPriceUsd,
      unweightedPriceUsd:quote.unweightedPriceUsd
    });

    state.selection=selection;

    await W.ZZXBitcoinTickerPurchasingPower.update(
      root,state,quote.priceUsd,force
    );

    if(
      force ||
      !Number.isFinite(state.chainHeight) ||
      now-state.chainAt>=C.chainRefreshMs
    ){
      try{
        const tip=await W.ZZXChain.tipHeight(false);
        const nextHeight=Number(tip?.height);
        if(Number.isFinite(nextHeight)){
          state.chainHeight=nextHeight;
          state.issuedSats=W.ZZXChain.issuedSatsAtHeight(nextHeight);
          state.chainAt=now;
        }
      }catch(_){
        // Preserve the last-known-good chain state. Price selection must not fail
        // merely because the chain metadata endpoint is temporarily unavailable.
      }
    }

    const height=state.chainHeight;
    const issued=state.issuedSats;

    await W.ZZXBitcoinTickerNationalDebts.update(
      root,state,height,issued,force
    );

    await W.ZZXBitcoinTickerNationalBalances.update(
      root,state,height,issued,force
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
      chainHeight:NaN,issuedSats:null,chainAt:0,
      lastGoodLatest:null,lastGoodLatestAt:0,lastStaticLatestFetchAt:0,
      selection:null,busy:false,queued:false,timer:null,referenceType:null
    };
    root.__zzxBitcoinTickerState=state;

    try{
      await ensureModules(state.core);
      await W.ZZXBitcoinTickerDeps.ensureShared();
      W.ZZXLiveBPI.start().catch(()=>{});

      const config=await loadConfig(state,false);
      W.ZZXBitcoinTickerExchanges.populateSources(root,config);
      W.ZZXBitcoinTickerExchangeRates.populateCurrencies(root,config);

      W.ZZXBitcoinTickerPurchasingPower.mount(root,state);
      W.ZZXBitcoinTickerNationalDebts.mount(root,state);
      W.ZZXBitcoinTickerNationalBalances.mount(root,state);
      W.ZZXBitcoinTickerPanels.mount(root,state);

      try{
        await W.ZZXBitcoinTickerWidgetModules.mount(root);
      }catch(error){
        set(root,"[data-provider-detail]",`widget modules: ${String(error?.message||error)}`);
      }

      try{
        await W.ZZXBitcoinTickerCharts.mount(root);
      }catch(error){
        set(root,"[data-chart-status]",`chart engine: ${String(error?.message||error)}`);
      }

      W.addEventListener("zzx:live-bpi",event=>{
        if(event?.detail&&state.config){
          state.config.latest=event.detail;
          W.ZZXBitcoinTickerExchanges.populateSources(root,state.config);
        }
        refresh(root,state,false);
      });

      W.addEventListener("zzx:bpi-weighting",()=>{
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


      await refresh(root,state,false);

      try{
        W.dispatchEvent(new CustomEvent("zzx:bitcoin-ticker-ready",{
          detail:{root,selection:state.selection}
        }));
      }catch(_){}

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
