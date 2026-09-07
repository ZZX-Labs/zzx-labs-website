(function(){
  "use strict";

  const W=window;
  const D=document;
  const ID="currency-converter";
  const REFRESH_MS=2500;

  const MODULES=Object.freeze([
    {
      global:"ZZXCurrencyConverterStorage",
      relative:"js/storage.js",
      version:3
    },
    {
      global:"ZZXCurrencyConverterRegion",
      relative:"js/region.js",
      version:3
    },
    {
      global:"ZZXCurrencyConverterData",
      relative:"js/data.js",
      version:3
    },
    {
      global:"ZZXCurrencyConverterModel",
      relative:"js/model.js",
      version:3
    }
  ]);

  function q(root,selector){
    return root?.querySelector?.(selector)||null;
  }

  function set(root,selector,value){
    const element=q(root,selector);

    if(element){
      element.textContent=
        value==null
          ? "—"
          : String(value);
    }
  }

  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function positive(value){
    const n=finite(value);
    return n>0?n:NaN;
  }

  function status(root,label,state){
    const element=q(
      root,
      "[data-cc-status]"
    );

    if(!element)return;

    element.textContent=label;
    element.setAttribute(
      "data-status",
      state||"offline"
    );
  }

  function resolve(path){
    return W.ZZXAPI?.url
      ? W.ZZXAPI.url(path)
      : path;
  }

  function versionOK(globalName,minVersion){
    const value=W[globalName];

    return !!(
      value &&
      Number(value.__version||0)>=minVersion
    );
  }

  function moduleURL(base,relative,version){
    const raw=resolve(
      `${base}/${relative}`
    );

    try{
      const target=new URL(
        raw,
        W.location.href
      );
      target.searchParams.set(
        "ccmod",
        String(version)
      );
      return target.href;
    }catch(_){
      const sep=raw.includes("?")
        ? "&"
        : "?";
      return `${raw}${sep}ccmod=${encodeURIComponent(version)}`;
    }
  }

  async function ensureModules(core){
    const base=core?.widgetBase
      ? String(
          core.widgetBase(ID)
        ).replace(/\/+$/g,"")
      : "/__partials/widgets/currency-converter";

    for(const spec of MODULES){
      if(versionOK(spec.global,spec.version)){
        continue;
      }

      const src=moduleURL(
        base,
        spec.relative,
        spec.version
      );

      const existing=[...D.scripts].find(
        script=>script.src===src
      );

      if(existing){
        const started=Date.now();

        while(
          !versionOK(
            spec.global,
            spec.version
          ) &&
          Date.now()-started<1500
        ){
          await new Promise(
            done=>W.setTimeout(done,25)
          );
        }

        if(
          versionOK(
            spec.global,
            spec.version
          )
        ){
          continue;
        }
      }

      await new Promise((done,fail)=>{
        const script=D.createElement("script");
        script.src=src;
        script.defer=true;
        script.setAttribute(
          "data-zzx-currency-converter-module",
          spec.global
        );

        script.addEventListener(
          "load",
          done,
          {once:true}
        );

        script.addEventListener(
          "error",
          ()=>fail(
            new Error(
              `failed to load ${spec.relative}`
            )
          ),
          {once:true}
        );

        (D.head||D.documentElement)
          .appendChild(script);
      });

      if(
        !versionOK(
          spec.global,
          spec.version
        )
      ){
        throw new Error(
          `${spec.relative} did not register compatible ${spec.global} `+
          `(required >= ${spec.version}, got ${Number(W[spec.global]?.__version||0)})`
        );
      }
    }
  }

  function digits(value){
    const amount=Math.abs(
      finite(value)
    );

    if(!Number.isFinite(amount)){
      return 2;
    }

    if(amount>=1e9)return 2;
    if(amount>=1e6)return 2;
    if(amount>=1000)return 3;
    if(amount>=1)return 6;
    if(amount>=.01)return 8;
    if(amount>=1e-8)return 12;
    return 16;
  }

  function numberText(value,maxDigits){
    const n=finite(value);

    if(!Number.isFinite(n)){
      return "—";
    }

    const decimals=maxDigits==null
      ? digits(n)
      : maxDigits;

    return n.toLocaleString(
      undefined,
      {
        maximumFractionDigits:decimals
      }
    );
  }

  function money(value,currency="USD"){
    const n=finite(value);

    if(!Number.isFinite(n)){
      return "—";
    }

    try{
      return n.toLocaleString(
        undefined,
        {
          style:"currency",
          currency,
          maximumFractionDigits:
            Math.abs(n)>=1
              ? 2
              : Math.min(8,digits(n))
        }
      );
    }catch(_){
      return `${numberText(n)} ${currency}`;
    }
  }

  function displayAsset(value,asset){
    const n=finite(value);

    if(
      !Number.isFinite(n) ||
      !asset
    ){
      return "—";
    }

    if(asset.kind==="fiat"){
      const symbol=asset.symbol||"";

      return (
        `${symbol}${numberText(n)} ${asset.code}`
      ).trim();
    }

    return `${numberText(n)} ${asset.unit}`;
  }

  function makeOption(asset){
    const option=D.createElement("option");
    option.value=asset.id;

    if(asset.kind==="fiat"){
      option.textContent=
        `${asset.code} · ${asset.name}`+
        (asset.available
          ? ""
          : " · unavailable");
    }else if(asset.kind==="bitcoin"){
      option.textContent=
        `${asset.code} · ${asset.name}`+
        (asset.selectable===false
          ? " · display only"
          : "");
    }else{
      option.textContent=
        `${asset.name} · ${asset.unit}`+
        (asset.available
          ? ""
          : " · unavailable");
    }

    option.disabled=
      asset.selectable===false ||
      asset.available===false;

    return option;
  }

  function fillAssetSelect(select,data){
    if(!select)return;

    const current=select.value;
    select.replaceChildren();

    const fiatGroup=D.createElement("optgroup");
    fiatGroup.label=
      `Fiat / forex (${data.availableCurrencyCount}/${data.currencyCount} live)`;

    for(const asset of data.fiat){
      fiatGroup.appendChild(
        makeOption(asset)
      );
    }

    select.appendChild(fiatGroup);

    const bitcoinGroup=D.createElement("optgroup");
    bitcoinGroup.label=
      "Bitcoin denominations";

    for(const asset of data.bitcoin){
      bitcoinGroup.appendChild(
        makeOption(asset)
      );
    }

    select.appendChild(bitcoinGroup);

    const groups=new Map();

    for(const asset of data.references){
      const category=
        asset.category||
        "References";

      if(!groups.has(category)){
        groups.set(category,[]);
      }

      groups.get(category).push(asset);
    }

    for(
      const [category,assets]
      of [...groups.entries()]
        .sort((a,b)=>a[0].localeCompare(b[0]))
    ){
      const group=D.createElement("optgroup");
      group.label=
        `${category} (`+
        `${assets.filter(asset=>asset.available).length}/`+
        `${assets.length} priced)`;

      for(const asset of assets){
        group.appendChild(
          makeOption(asset)
        );
      }

      select.appendChild(group);
    }

    if(
      current &&
      [...select.options].some(
        option=>
          option.value===current &&
          !option.disabled
      )
    ){
      select.value=current;
    }
  }

  function fillHomeSelect(select,data){
    if(!select)return;

    const current=select.value;
    select.replaceChildren();

    for(const asset of data.fiat){
      const option=makeOption(asset);
      option.value=asset.code;
      select.appendChild(option);
    }

    if(
      current &&
      [...select.options].some(
        option=>
          option.value===current &&
          !option.disabled
      )
    ){
      select.value=current;
    }
  }

  function fillReferencePageSelect(root,state){
    const select=q(
      root,
      "[data-cc-reference-page]"
    );

    if(!select)return;

    const stored=
      W.ZZXCurrencyConverterStorage.get(
        W.ZZXCurrencyConverterStorage.keys.referencePage
      );

    const current=
      stored||
      select.value||
      state.data.referencePages?.[0]?.id||
      "";

    select.replaceChildren();

    for(const page of state.data.referencePages||[]){
      const option=D.createElement("option");
      option.value=page.id;
      option.textContent=page.label;
      select.appendChild(option);
    }

    if(select.options.length){
      select.value=
        [...select.options].some(
          option=>option.value===current
        )
          ? current
          : select.options[0].value;
    }
  }

  function homeAsset(data,currency){
    return data.byId.get(
      `fiat:${String(currency||"USD").toUpperCase()}`
    )||null;
  }

  async function establishHome(state){
    const saved=
      W.ZZXCurrencyConverterStorage.readHome();

    if(saved){
      state.homeRecord=saved;
      return;
    }

    const detected=
      await W.ZZXCurrencyConverterRegion.detect();

    const candidate=homeAsset(
      state.data,
      detected.currency
    );

    const chosen=
      candidate?.available
        ? candidate.code
        : "USD";

    state.homeRecord=
      W.ZZXCurrencyConverterStorage.saveHome(
        chosen,
        candidate
          ? `${detected.source}:${detected.region||"unknown"}`
          : "fallback-usd"
      );
  }

  function renderHome(root,state){
    const record=state.homeRecord;

    const actual=homeAsset(
      state.data,
      record?.currency
    );

    const fallback=homeAsset(
      state.data,
      "USD"
    );

    const home=
      actual?.available
        ? actual
        : fallback;

    state.homeAsset=home;

    const select=q(
      root,
      "[data-cc-home-select]"
    );

    if(select&&home){
      select.value=home.code;
    }

    set(
      root,
      "[data-cc-home-title]",
      home
        ? `Home currency · ${home.code}`
        : "Home currency unavailable"
    );

    set(
      root,
      "[data-cc-home-origin]",
      record?.source
        ? `saved · ${record.source}`
        : "saved"
    );

    set(
      root,
      "[data-cc-home-meta]",
      actual?.available
        ? (
            `Stored locally since `+
            `${record?.savedAt
              ? new Date(record.savedAt).toLocaleString()
              : "first use"}. `+
            `It changes only when you press Set default.`
          )
        : (
            `Saved ${record?.currency||"currency"} is currently unavailable `+
            `in the FX mirror; using USD without overwriting your preference.`
          )
    );
  }

  function renderDenoms(root,btcValue){
    const host=q(
      root,
      "[data-cc-denoms]"
    );

    if(!host)return;

    host.replaceChildren();

    const rows=
      W.ZZXCurrencyConverterModel
        .denominations(btcValue);

    for(const row of rows){
      const card=D.createElement("div");
      card.className=
        "currency-converter__denom";

      const label=D.createElement("span");
      label.textContent=row.name;

      const strong=D.createElement("strong");
      strong.textContent=
        `${numberText(row.value)} ${row.unit}`;

      card.append(label,strong);
      host.appendChild(card);
    }
  }

  function renderFiatMatrix(root,state,usdValue){
    const details=q(
      root,
      "[data-cc-fiat-details]"
    );

    const host=q(
      root,
      "[data-cc-fiat-grid]"
    );

    if(!details||!host)return;

    set(
      root,
      "[data-cc-fiat-count]",
      `${state.data.availableCurrencyCount}/${state.data.currencyCount} live rates`
    );

    if(!details.open)return;

    host.replaceChildren();

    const btcUsd=state.data.ticker.priceUsd;

    for(const asset of state.data.fiat){
      const card=D.createElement("div");
      card.className=
        "currency-converter__matrix-card";
      card.dataset.available=
        asset.available
          ? "true"
          : "false";

      const name=D.createElement("span");
      name.textContent=
        `${asset.code} · ${asset.name}`;

      const equivalent=D.createElement("strong");
      const basis=D.createElement("small");

      if(asset.available){
        equivalent.textContent=
          displayAsset(
            usdValue/asset.usdPerUnit,
            asset
          );

        basis.textContent=
          `1 ${asset.code} = `+
          `${money(asset.usdPerUnit,"USD")} = `+
          `${numberText(asset.usdPerUnit/btcUsd)} BTC`;
      }else{
        equivalent.textContent=
          "FX rate unavailable";
        basis.textContent=
          "not used in conversions";
      }

      card.append(
        name,
        equivalent,
        basis
      );

      host.appendChild(card);
    }
  }

  function renderReferenceMatrix(root,state){
    const details=q(
      root,
      "[data-cc-reference-details]"
    );

    const host=q(
      root,
      "[data-cc-reference-grid]"
    );

    if(!details||!host)return;

    const pageId=q(
      root,
      "[data-cc-reference-page]"
    )?.value;

    const rows=state.data.references.filter(
      asset=>
        !pageId ||
        asset.pageId===pageId
    );

    const available=rows.filter(
      asset=>asset.available
    ).length;

    set(
      root,
      "[data-cc-reference-count]",
      `${state.data.availableReferenceCount}/${state.data.referenceCount} priced`
    );

    if(!details.open)return;

    host.replaceChildren();

    const btcUsd=state.data.ticker.priceUsd;

    for(const asset of rows){
      const card=D.createElement("div");
      card.className=
        "currency-converter__matrix-card";
      card.dataset.available=
        asset.available
          ? "true"
          : "false";

      if(asset.restrictedReference){
        card.dataset.referencePolicy=
          "informational-only";
      }

      const name=D.createElement("span");
      name.textContent=asset.name;

      const usd=D.createElement("strong");
      const btc=D.createElement("small");

      if(asset.available){
        usd.textContent=
          `${money(asset.usdPerUnit,"USD")} / ${asset.unit}`;

        btc.textContent=
          `${numberText(asset.usdPerUnit/btcUsd)} BTC / ${asset.unit}`;

        card.title=
          `${asset.source}`+
          (asset.updatedAt
            ? ` · ${asset.updatedAt}`
            : "");
      }else{
        usd.textContent=
          "USD reference unavailable";

        btc.textContent=
          `BTC / ${asset.unit} unavailable`;
      }

      card.append(name,usd,btc);
      host.appendChild(card);
    }

    if(!rows.length){
      const empty=D.createElement("div");
      empty.className=
        "currency-converter__matrix-empty";
      empty.textContent=
        "No reference items on this page.";
      host.appendChild(empty);
    }

    set(
      root,
      "[data-cc-reference-count]",
      `${available}/${rows.length} on page · `+
      `${state.data.availableReferenceCount}/${state.data.referenceCount} total`
    );
  }

  function sourceTimestamp(state,from,to,home){
    const values=[
      state.data.ratesUpdatedAt,
      state.data.referenceUpdatedAt,
      state.data.ticker.timestamp,
      from?.updatedAt,
      to?.updatedAt,
      home?.updatedAt
    ].filter(Boolean);

    if(!values.length){
      return "timestamp unavailable";
    }

    const parsed=values
      .map(value=>
        new Date(value).getTime()
      )
      .filter(Number.isFinite);

    if(!parsed.length){
      return "timestamp unavailable";
    }

    return new Date(
      Math.max(...parsed)
    ).toLocaleString();
  }

  async function convert(root,state){
    if(
      state.converting ||
      !root.isConnected
    ){
      return;
    }

    state.converting=true;
    status(
      root,
      "converting",
      "warn"
    );

    try{
      const amount=finite(
        q(root,"[data-cc-amount]")?.value
      );

      const fromId=q(
        root,
        "[data-cc-from]"
      )?.value;

      const toId=q(
        root,
        "[data-cc-to]"
      )?.value;

      const from=
        state.data.byId.get(fromId);

      const to=
        state.data.byId.get(toId);

      const home=
        state.homeAsset||
        homeAsset(state.data,"USD");

      const model=
        W.ZZXCurrencyConverterModel.convert(
          amount,
          from,
          to
        );

      const homeValue=
        W.ZZXCurrencyConverterModel.homeEquivalent(
          model.usdValue,
          home
        );

      const btcValue=
        W.ZZXCurrencyConverterModel.btcEquivalent(
          model.usdValue,
          state.data.ticker.priceUsd
        );

      set(
        root,
        "[data-cc-output]",
        displayAsset(
          model.output,
          to
        )
      );

      set(
        root,
        "[data-cc-rate]",
        `1 ${from?.unit||from?.code||"?"} = `+
        `${numberText(model.unitRate)} `+
        `${to?.unit||to?.code||"?"}`
      );

      set(
        root,
        "[data-cc-usd]",
        money(
          model.usdValue,
          "USD"
        )
      );

      set(
        root,
        "[data-cc-home-label]",
        home?.code==="USD"
          ? "home / USD equivalent"
          : `home equivalent · ${home?.code||"USD"}`
      );

      set(
        root,
        "[data-cc-home]",
        displayAsset(
          homeValue,
          home
        )
      );

      set(
        root,
        "[data-cc-btc]",
        `${numberText(btcValue)} BTC`
      );

      set(
        root,
        "[data-cc-bpi]",
        `${state.data.ticker.label} · `+
        `${money(state.data.ticker.priceUsd,"USD")}`
      );

      set(
        root,
        "[data-cc-btc-usd]",
        `1 BTC = `+
        `${money(state.data.ticker.priceUsd,"USD")}`
      );

      set(
        root,
        "[data-cc-from-usd]",
        `${money(model.fromUsdPerUnit,"USD")} / `+
        `${from?.unit||from?.code||"unit"}`
      );

      set(
        root,
        "[data-cc-to-usd]",
        `${money(model.toUsdPerUnit,"USD")} / `+
        `${to?.unit||to?.code||"unit"}`
      );

      set(
        root,
        "[data-cc-home-usd]",
        home
          ? `${money(home.usdPerUnit,"USD")} / ${home.code}`
          : "—"
      );

      set(
        root,
        "[data-cc-updated]",
        sourceTimestamp(
          state,
          from,
          to,
          home
        )
      );

      set(
        root,
        "[data-cc-basis-state]",
        `${from?.kind||"?"} → USD → ${to?.kind||"?"}`
      );

      set(
        root,
        "[data-cc-eyebrow]",
        `${state.data.availableCurrencyCount}/${state.data.currencyCount} live fiat · `+
        `BTC · ${state.data.availableReferenceCount}/${state.data.referenceCount} priced references`
      );

      set(
        root,
        "[data-cc-meta]",
        `${state.data.fxProvider||"ZZX local FX mirror"} · `+
        `${state.data.ticker.label} · `+
        `${state.data.ticker.live?"live ticker":"local snapshot"}`
      );

      renderDenoms(
        root,
        btcValue
      );

      renderFiatMatrix(
        root,
        state,
        model.usdValue
      );

      renderReferenceMatrix(
        root,
        state
      );

      status(
        root,
        "live",
        "ok"
      );
    }catch(error){
      set(
        root,
        "[data-cc-output]",
        "—"
      );

      set(
        root,
        "[data-cc-rate]",
        String(
          error?.message||
          error
        )
      );

      status(
        root,
        "error",
        "error"
      );
    }finally{
      state.converting=false;
    }
  }

  function selectAvailable(
    select,
    preferred,
    fallback
  ){
    if(!select)return;

    const candidates=[
      preferred,
      fallback
    ].filter(Boolean);

    for(const candidate of candidates){
      const option=[...select.options].find(
        row=>
          row.value===candidate &&
          !row.disabled
      );

      if(option){
        select.value=candidate;
        return;
      }
    }

    const first=[...select.options].find(
      option=>!option.disabled
    );

    if(first){
      select.value=first.value;
    }
  }

  async function refreshData(root,state,force=false){
    if(
      state.refreshing ||
      !root.isConnected
    ){
      return;
    }

    state.refreshing=true;

    try{
      const oldFrom=q(
        root,
        "[data-cc-from]"
      )?.value;

      const oldTo=q(
        root,
        "[data-cc-to]"
      )?.value;

      const oldHome=q(
        root,
        "[data-cc-home-select]"
      )?.value;

      state.data=
        await W.ZZXCurrencyConverterData.load(
          force
        );

      const from=q(
        root,
        "[data-cc-from]"
      );

      const to=q(
        root,
        "[data-cc-to]"
      );

      const homeSelect=q(
        root,
        "[data-cc-home-select]"
      );

      fillAssetSelect(
        from,
        state.data
      );

      fillAssetSelect(
        to,
        state.data
      );

      fillHomeSelect(
        homeSelect,
        state.data
      );

      fillReferencePageSelect(
        root,
        state
      );

      selectAvailable(
        from,
        oldFrom,
        "btc:btc"
      );

      selectAvailable(
        to,
        oldTo,
        state.homeAsset?.id||"fiat:USD"
      );

      if(
        oldHome &&
        homeAsset(
          state.data,
          oldHome
        )?.available
      ){
        homeSelect.value=oldHome;
      }

      renderHome(
        root,
        state
      );

      renderReferenceMatrix(
        root,
        state
      );

      await convert(
        root,
        state
      );
    }finally{
      state.refreshing=false;
    }
  }

  function debounce(state,fn,delay=120){
    if(state.debounceTimer){
      W.clearTimeout(
        state.debounceTimer
      );
    }

    state.debounceTimer=
      W.setTimeout(
        fn,
        delay
      );
  }

  function migrateLegacy(state){
    try{
      const legacyFrom=
        localStorage.getItem(
          "zzx.widget.currency-converter.from"
        );

      const legacyTo=
        localStorage.getItem(
          "zzx.widget.currency-converter.to"
        );

      const storage=
        W.ZZXCurrencyConverterStorage;

      if(
        legacyFrom &&
        !storage.get(storage.keys.from)
      ){
        const id=
          legacyFrom==="BTC"
            ? "btc:btc"
            : `fiat:${legacyFrom}`;

        if(
          state.data.byId.get(id)?.available
        ){
          storage.set(
            storage.keys.from,
            id
          );
        }
      }

      if(
        legacyTo &&
        !storage.get(storage.keys.to)
      ){
        const id=
          legacyTo==="BTC"
            ? "btc:btc"
            : `fiat:${legacyTo}`;

        if(
          state.data.byId.get(id)?.available
        ){
          storage.set(
            storage.keys.to,
            id
          );
        }
      }
    }catch(_){}
  }

  async function boot(root,core){
    if(!root)return;

    try{
      root.__zzxCurrencyConverterAbort?.abort?.();
    }catch(_){}

    const abortController=
      typeof AbortController==="function"
        ? new AbortController()
        : null;

    root.__zzxCurrencyConverterAbort=
      abortController;

    const state={
      core:
        core||
        W.ZZXWidgetsCore||
        null,
      data:null,
      homeRecord:null,
      homeAsset:null,
      refreshing:false,
      converting:false,
      debounceTimer:null,
      timer:null,
      generation:0,
      abortController
    };

    root.__zzxCurrencyConverterState=state;

    const eventOptions=
      abortController
        ? {signal:abortController.signal}
        : undefined;

    try{
      await ensureModules(
        state.core
      );

      state.data=
        await W.ZZXCurrencyConverterData.load(
          false
        );

      const from=q(
        root,
        "[data-cc-from]"
      );

      const to=q(
        root,
        "[data-cc-to]"
      );

      const amount=q(
        root,
        "[data-cc-amount]"
      );

      const homeSelect=q(
        root,
        "[data-cc-home-select]"
      );

      fillAssetSelect(
        from,
        state.data
      );

      fillAssetSelect(
        to,
        state.data
      );

      fillHomeSelect(
        homeSelect,
        state.data
      );

      fillReferencePageSelect(
        root,
        state
      );

      await establishHome(state);
      renderHome(root,state);

      migrateLegacy(state);

      const storage=
        W.ZZXCurrencyConverterStorage;

      const savedFrom=
        storage.get(
          storage.keys.from
        );

      const savedTo=
        storage.get(
          storage.keys.to
        );

      const savedAmount=
        storage.get(
          storage.keys.amount
        );

      selectAvailable(
        from,
        savedFrom,
        "btc:btc"
      );

      selectAvailable(
        to,
        savedTo,
        state.homeAsset?.id||"fiat:USD"
      );

      if(
        savedAmount!=null &&
        Number.isFinite(
          Number(savedAmount)
        )
      ){
        amount.value=String(
          savedAmount
        );
      }

      amount?.addEventListener(
        "input",
        ()=>{
          storage.set(
            storage.keys.amount,
            amount.value
          );

          debounce(
            state,
            ()=>convert(root,state)
          );
        },
        eventOptions
      );

      from?.addEventListener(
        "change",
        ()=>{
          storage.set(
            storage.keys.from,
            from.value
          );

          convert(
            root,
            state
          );
        },
        eventOptions
      );

      to?.addEventListener(
        "change",
        ()=>{
          storage.set(
            storage.keys.to,
            to.value
          );

          convert(
            root,
            state
          );
        },
        eventOptions
      );

      q(
        root,
        "[data-cc-swap]"
      )?.addEventListener(
        "click",
        ()=>{
          const fromValue=from.value;
          const toValue=to.value;

          const fromTarget=[
            ...from.options
          ].find(
            option=>
              option.value===toValue &&
              !option.disabled
          );

          const toTarget=[
            ...to.options
          ].find(
            option=>
              option.value===fromValue &&
              !option.disabled
          );

          if(
            !fromTarget ||
            !toTarget
          ){
            return;
          }

          from.value=toValue;
          to.value=fromValue;

          storage.set(
            storage.keys.from,
            from.value
          );

          storage.set(
            storage.keys.to,
            to.value
          );

          convert(
            root,
            state
          );
        },
        eventOptions
      );

      q(
        root,
        "[data-cc-home-save]"
      )?.addEventListener(
        "click",
        ()=>{
          const code=
            homeSelect?.value||
            "USD";

          const asset=homeAsset(
            state.data,
            code
          );

          if(!asset?.available){
            return;
          }

          state.homeRecord=
            storage.saveHome(
              code,
              "explicit"
            );

          renderHome(
            root,
            state
          );

          convert(
            root,
            state
          );
        },
        eventOptions
      );

      q(
        root,
        "[data-cc-refresh]"
      )?.addEventListener(
        "click",
        ()=>{
          status(
            root,
            "refreshing",
            "warn"
          );

          refreshData(
            root,
            state,
            true
          );
        },
        eventOptions
      );

      q(
        root,
        "[data-cc-fiat-details]"
      )?.addEventListener(
        "toggle",
        ()=>{
          if(
            q(
              root,
              "[data-cc-fiat-details]"
            )?.open
          ){
            convert(
              root,
              state
            );
          }
        },
        eventOptions
      );

      q(
        root,
        "[data-cc-reference-details]"
      )?.addEventListener(
        "toggle",
        ()=>{
          if(
            q(
              root,
              "[data-cc-reference-details]"
            )?.open
          ){
            renderReferenceMatrix(
              root,
              state
            );
          }
        },
        eventOptions
      );

      q(
        root,
        "[data-cc-reference-page]"
      )?.addEventListener(
        "change",
        event=>{
          storage.set(
            storage.keys.referencePage,
            event.currentTarget.value
          );

          renderReferenceMatrix(
            root,
            state
          );
        },
        eventOptions
      );

      const externalRefresh=()=>{
        refreshData(
          root,
          state,
          false
        );
      };

      for(const eventName of [
        "zzx:bpi-selection",
        "zzx:bpi:update",
        "zzx:live-bpi"
      ]){
        W.addEventListener(
          eventName,
          externalRefresh,
          eventOptions
        );
      }

      W.addEventListener(
        "zzx:ticker-patch",
        event=>{
          if(
            event?.detail?.kind===
            "bpi-selection"
          ){
            externalRefresh();
          }
        },
        eventOptions
      );

      await convert(
        root,
        state
      );

      async function loop(){
        if(
          !root.isConnected ||
          abortController?.signal?.aborted
        ){
          return;
        }

        await refreshData(
          root,
          state,
          false
        );

        state.timer=
          W.setTimeout(
            loop,
            REFRESH_MS
          );
      }

      state.timer=
        W.setTimeout(
          loop,
          REFRESH_MS
        );
    }catch(error){
      status(
        root,
        "offline",
        "error"
      );

      set(
        root,
        "[data-cc-output]",
        "—"
      );

      set(
        root,
        "[data-cc-rate]",
        String(
          error?.message||
          error
        )
      );

      set(
        root,
        "[data-cc-meta]",
        String(
          error?.message||
          error
        )
      );
    }
  }

  if(W.ZZXAPI?.register){
    W.ZZXAPI.register(
      ID,
      boot
    );
  }else if(W.ZZXWidgetsCore?.onMount){
    W.ZZXWidgetsCore.onMount(
      ID,
      boot
    );
  }else if(W.ZZXWidgets?.register){
    W.ZZXWidgets.register(
      ID,
      boot
    );
  }
})();
