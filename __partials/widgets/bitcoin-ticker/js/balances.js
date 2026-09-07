(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerBalances?.__version>=1)return;

  const cache={data:null,at:0};
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const positive=v=>{const n=finite(v);return n>0?n:NaN};
  const q=(root,selector)=>root?.querySelector?.(selector)||null;
  const set=(root,selector,value)=>{
    const el=q(root,selector);
    if(el)el.textContent=value==null?"—":String(value);
  };

  function normalizeCountries(data){
    const rows=Array.isArray(data?.countries)?data.countries:[];

    return rows
      .filter(row=>row&&typeof row==="object")
      .map(row=>({
        code:String(row.code??row.iso2??"").toUpperCase(),
        iso3:String(row.iso3??"").toUpperCase(),
        name:String(row.name??row.country??row.code??"Unknown")
      }))
      .filter(row=>row.code)
      .sort((a,b)=>a.name.localeCompare(b.name));
  }

  function balanceMap(data){
    const rows=Array.isArray(data?.countries)?data.countries:[];
    const map=new Map();

    for(const row of rows){
      if(!row||typeof row!=="object")continue;

      const code=String(row.code??row.iso2??"").toUpperCase();
      if(!code)continue;

      const total=positive(
        row.balance_assets_usd??
        row.reserve_assets_usd??
        row.assets_usd
      );

      const exGold=positive(
        row.reserve_assets_ex_gold_usd
      );

      let gold=positive(
        row.implied_gold_component_usd
      );

      if(
        !Number.isFinite(gold) &&
        Number.isFinite(total) &&
        Number.isFinite(exGold)
      ){
        gold=Math.max(0,total-exGold);
      }

      map.set(code,{
        code,
        iso3:String(row.iso3??"").toUpperCase(),
        name:String(row.name??row.country??code),
        available:Number.isFinite(total)&&row.available!==false,
        assetsUsd:Number.isFinite(total)?total:NaN,
        reservesExGoldUsd:Number.isFinite(exGold)?exGold:NaN,
        impliedGoldUsd:Number.isFinite(gold)?gold:NaN,
        source:String(
          row.source??data?.source??"local sovereign balance mirror"
        ),
        method:String(row.method??""),
        recordYear:row.record_year??null,
        recordDate:String(
          row.record_date??row.updated_at??data?.updated_at??""
        )
      });
    }

    return map;
  }

  async function load(force=false){
    const now=Date.now();

    if(
      !force &&
      cache.data &&
      now-cache.at<W.ZZXBitcoinTickerConstants.sovereignTtlMs
    ){
      return cache.data;
    }

    const [registry,balanceData]=await Promise.all([
      W.ZZXBitcoinTickerFetch.json(
        W.ZZXBitcoinTickerConstants.endpoints.sovereignCountries,
        {optional:true}
      ),
      W.ZZXBitcoinTickerFetch.json(
        W.ZZXBitcoinTickerConstants.endpoints.balances,
        {optional:true}
      )
    ]);

    const countries=normalizeCountries(registry);
    const balances=balanceMap(balanceData);

    const rows=countries.map(country=>{
      const balance=balances.get(country.code);

      return balance
        ? {...country,...balance,name:country.name}
        : {
            ...country,
            available:false,
            assetsUsd:NaN,
            reservesExGoldUsd:NaN,
            impliedGoldUsd:NaN,
            source:"No public reserve-assets estimate in local mirror",
            method:"",
            recordYear:null,
            recordDate:""
          };
    });

    if(!rows.length){
      for(const row of balances.values())rows.push(row);
      rows.sort((a,b)=>a.name.localeCompare(b.name));
    }

    cache.data=rows;
    cache.at=now;
    return rows;
  }

  function populate(root,rows){
    const select=q(root,"[data-balance-country]");
    if(!select)return;

    const stored=(()=>{
      try{
        return localStorage.getItem(
          W.ZZXBitcoinTickerConstants.storage.balanceCountry
        );
      }catch(_){
        return null;
      }
    })();

    const current=stored||select.value||"US";
    select.replaceChildren();

    for(const row of rows){
      const option=D.createElement("option");
      option.value=row.code||row.name;
      option.textContent=row.name;
      option.dataset.available=row.available?"true":"false";
      select.appendChild(option);
    }

    if(!select.options.length){
      const option=D.createElement("option");
      option.value="";
      option.textContent="sovereign balance country registry unavailable";
      select.appendChild(option);
      return;
    }

    select.value=[...select.options].some(
      option=>option.value===current
    )
      ? current
      : ([...select.options].some(option=>option.value==="US")
          ? "US"
          : select.options[0].value);
  }

  function fmtUsd(value){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";

    return n.toLocaleString(undefined,{
      style:"currency",
      currency:"USD",
      notation:Math.abs(n)>=1e9?"compact":"standard",
      maximumFractionDigits:2
    });
  }

  function render(root,rows,height,issuedSats){
    const select=q(root,"[data-balance-country]");
    const row=rows.find(
      item=>(item.code||item.name)===(select?.value||"")
    )||rows[0];

    const issuedBtc=
      typeof issuedSats==="bigint"
        ? Number(issuedSats)/1e8
        : NaN;

    const terminal=
      W.ZZXBitcoinTickerConstants.terminalSupplyBtc;

    if(!row){
      set(root,"[data-balance-total]","—");
      set(
        root,
        "[data-balance-source]",
        "sovereign reserve-assets data unavailable"
      );
      return;
    }

    if(!row.available||!Number.isFinite(row.assetsUsd)){
      set(
        root,
        "[data-balance-total]",
        `${row.name}: data unavailable`
      );
      set(root,"[data-balance-ex-gold]","—");
      set(root,"[data-balance-gold]","—");
      set(root,"[data-balance-per-issued]","—");
      set(root,"[data-balance-per-terminal]","—");
      set(root,"[data-issued-per-balance-dollar]","—");
      set(root,"[data-terminal-per-balance-dollar]","—");
      set(
        root,
        "[data-balance-source]",
        `${row.source||"No public reserve-assets estimate"}`+
        (row.recordYear?` · ${row.recordYear}`:"")
      );
      return;
    }

    const perIssued=
      issuedBtc>0?row.assetsUsd/issuedBtc:NaN;

    const perTerminal=
      row.assetsUsd/terminal;

    const issuedPerDollar=
      issuedBtc>0?issuedBtc/row.assetsUsd:NaN;

    const terminalPerDollar=
      terminal/row.assetsUsd;

    set(
      root,
      "[data-balance-total]",
      `${row.name}: ${fmtUsd(row.assetsUsd)} reserve assets`
    );

    set(
      root,
      "[data-balance-ex-gold]",
      fmtUsd(row.reservesExGoldUsd)
    );

    set(
      root,
      "[data-balance-gold]",
      fmtUsd(row.impliedGoldUsd)
    );

    set(
      root,
      "[data-balance-per-issued]",
      fmtUsd(perIssued)
    );

    set(
      root,
      "[data-balance-per-terminal]",
      fmtUsd(perTerminal)
    );

    set(
      root,
      "[data-issued-per-balance-dollar]",
      Number.isFinite(issuedPerDollar)
        ? `${issuedPerDollar.toExponential(8)} BTC / $1`
        : "—"
    );

    set(
      root,
      "[data-terminal-per-balance-dollar]",
      Number.isFinite(terminalPerDollar)
        ? `${terminalPerDollar.toExponential(8)} BTC / $1`
        : "—"
    );

    const methodology=[
      row.source,
      row.method,
      row.recordDate||row.recordYear
    ].filter(Boolean).join(" · ");

    set(
      root,
      "[data-balance-source]",
      methodology||
      "sovereign reserve-assets data unavailable"
    );

    set(
      root,
      "[data-balance-proxy-note]",
      "Reserve-assets proxy only; not total sovereign wealth or private-sector assets"
    );

    set(
      root,
      "[data-balance-chain-height]",
      Number.isFinite(Number(height))
        ? `height ${Number(height).toLocaleString()}`
        : "height unavailable"
    );
  }

  W.ZZXBitcoinTickerBalances=Object.freeze({
    __version:1,
    load,
    populate,
    render
  });
})();
