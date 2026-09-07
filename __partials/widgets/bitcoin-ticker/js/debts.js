(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerDebts?.__version>=8)return;

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
        name:String(row.name??row.country??row.code??"Unknown"),
        region:String(row.region??"")
      }))
      .filter(row=>row.code)
      .sort((a,b)=>a.name.localeCompare(b.name));
  }

  function debtMap(data){
    const rows=Array.isArray(data?.countries)?data.countries:[];
    const map=new Map();

    for(const row of rows){
      if(!row||typeof row!=="object")continue;
      const code=String(row.code??row.iso2??"").toUpperCase();
      if(!code)continue;

      const debt=positive(
        row.debt_usd??row.total_debt_usd??row.amount_usd??row.debt
      );

      map.set(code,{
        code,
        iso3:String(row.iso3??"").toUpperCase(),
        name:String(row.name??row.country??code),
        available:Number.isFinite(debt)&&row.available!==false,
        debtUsd:Number.isFinite(debt)?debt:NaN,
        debtPercentGdp:positive(row.debt_percent_gdp),
        gdpUsd:positive(row.gdp_usd),
        source:String(row.source??data?.source??"local sovereign debt mirror"),
        method:String(row.method??""),
        recordYear:row.record_year??null,
        recordDate:String(row.record_date??row.updated_at??data?.updated_at??"")
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

    const [registry,debtData]=await Promise.all([
      W.ZZXBitcoinTickerFetch.json(
        W.ZZXBitcoinTickerConstants.endpoints.sovereignCountries,
        {optional:true}
      ),
      W.ZZXBitcoinTickerFetch.json(
        W.ZZXBitcoinTickerConstants.endpoints.debts,
        {optional:true}
      )
    ]);

    const countries=normalizeCountries(registry);
    const debts=debtMap(debtData);

    const rows=countries.map(country=>{
      const debt=debts.get(country.code);
      return debt
        ? {...country,...debt,name:country.name}
        : {
            ...country,
            available:false,
            debtUsd:NaN,
            debtPercentGdp:NaN,
            gdpUsd:NaN,
            source:"No public debt estimate in local mirror",
            method:"",
            recordYear:null,
            recordDate:""
          };
    });

    // Compatibility fallback when registry is temporarily missing.
    if(!rows.length){
      for(const row of debts.values())rows.push(row);
      rows.sort((a,b)=>a.name.localeCompare(b.name));
    }

    cache.data=rows;
    cache.at=now;
    return rows;
  }

  function populate(root,rows){
    const select=q(root,"[data-debt-country]");
    if(!select)return;

    const stored=(()=>{
      try{
        return localStorage.getItem(
          W.ZZXBitcoinTickerConstants.storage.debtCountry
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
      option.textContent="national debt country registry unavailable";
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

  function fmtUsd(value,negative=false){
    const n=finite(value);
    if(!Number.isFinite(n))return "—";

    const out=negative?-Math.abs(n):n;

    return out.toLocaleString(undefined,{
      style:"currency",
      currency:"USD",
      notation:Math.abs(out)>=1e9?"compact":"standard",
      maximumFractionDigits:2
    });
  }

  function render(root,rows,height,issuedSats){
    const select=q(root,"[data-debt-country]");
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
      set(root,"[data-debt-total]","—");
      set(root,"[data-debt-source]","national debt data unavailable");
      return;
    }

    if(!row.available||!Number.isFinite(row.debtUsd)){
      set(root,"[data-debt-total]",`${row.name}: data unavailable`);
      set(root,"[data-debt-per-issued]","—");
      set(root,"[data-debt-per-terminal]","—");
      set(root,"[data-issued-per-debt-dollar]","—");
      set(root,"[data-terminal-per-debt-dollar]","—");
      set(
        root,
        "[data-debt-source]",
        `${row.source||"No public debt estimate"}`+
        (row.recordYear?` · ${row.recordYear}`:"")
      );
      return;
    }

    const perIssued=
      issuedBtc>0?row.debtUsd/issuedBtc:NaN;

    const perTerminal=
      row.debtUsd/terminal;

    const issuedPerDollar=
      issuedBtc>0?issuedBtc/row.debtUsd:NaN;

    const terminalPerDollar=
      terminal/row.debtUsd;

    set(
      root,
      "[data-debt-total]",
      `${row.name}: ${fmtUsd(row.debtUsd)}`
    );

    set(
      root,
      "[data-debt-per-issued]",
      fmtUsd(perIssued,true)
    );

    set(
      root,
      "[data-debt-per-terminal]",
      fmtUsd(perTerminal,true)
    );

    set(
      root,
      "[data-issued-per-debt-dollar]",
      Number.isFinite(issuedPerDollar)
        ? `${issuedPerDollar.toExponential(8)} BTC / $1`
        : "—"
    );

    set(
      root,
      "[data-terminal-per-debt-dollar]",
      Number.isFinite(terminalPerDollar)
        ? `${terminalPerDollar.toExponential(8)} BTC / $1`
        : "—"
    );

    set(
      root,
      "[data-issued-supply]",
      Number.isFinite(issuedBtc)
        ? `issued ${issuedBtc.toLocaleString(undefined,{maximumFractionDigits:8})} BTC`
        : "issued supply unavailable"
    );

    const methodology=[
      row.source,
      row.method,
      row.recordDate||row.recordYear
    ].filter(Boolean).join(" · ");

    set(
      root,
      "[data-debt-source]",
      methodology||"national debt data unavailable"
    );

    set(
      root,
      "[data-chain-height]",
      Number.isFinite(Number(height))
        ? `height ${Number(height).toLocaleString()}`
        : "height unavailable"
    );
  }

  W.ZZXBitcoinTickerDebts=Object.freeze({
    __version:8,
    load,
    populate,
    render
  });
})();
