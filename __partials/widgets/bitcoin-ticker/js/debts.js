(function(){
  "use strict";
  const W=window,D=document;
  if(W.ZZXBitcoinTickerDebts?.__version>=7)return;

  const cache={data:null,at:0};
  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const positive=v=>{const n=finite(v);return n>0?n:NaN};
  const q=(root,selector)=>root?.querySelector?.(selector)||null;
  const set=(root,selector,value)=>{
    const el=q(root,selector);
    if(el)el.textContent=value==null?"—":String(value);
  };

  function normalize(data){
    const rows=Array.isArray(data)
      ? data
      : Array.isArray(data?.countries)
        ? data.countries
        : Array.isArray(data?.data)
          ? data.data
          : [];

    const out=[];

    for(const row of rows){
      if(!row||typeof row!=="object")continue;
      const debt=positive(row.debt_usd??row.total_debt_usd??row.amount_usd??row.debt??row.amount);
      if(!Number.isFinite(debt))continue;

      out.push({
        code:String(row.code??row.iso2??row.country_code??row.iso??"").toUpperCase(),
        name:String(row.name??row.country??row.label??row.code??"Unknown"),
        debtUsd:debt,
        source:String(row.source??row.provider??data?.source??"local national debt feed"),
        recordDate:String(row.record_date??row.updated_at??data?.updated_at??"")
      });
    }

    return out.sort((a,b)=>a.name.localeCompare(b.name));
  }

  function normalizeUs(data){
    if(!data||typeof data!=="object")return null;
    const row=Array.isArray(data.data)?data.data[0]:data;
    const debt=positive(
      row?.tot_pub_debt_out_amt ??
      row?.total_public_debt_outstanding ??
      row?.debt_usd ??
      row?.total_debt ??
      row?.amount
    );
    if(!Number.isFinite(debt))return null;

    return {
      code:"US",
      name:"United States",
      debtUsd:debt,
      source:String(data.source||data.provider||"U.S. Treasury Fiscal Data"),
      recordDate:String(row?.record_date||data.updated_at||"")
    };
  }

  async function load(force=false){
    const now=Date.now();
    if(!force&&cache.data&&now-cache.at<W.ZZXBitcoinTickerConstants.debtTtlMs)return cache.data;

    const [all,us]=await Promise.all([
      W.ZZXBitcoinTickerFetch.json(W.ZZXBitcoinTickerConstants.endpoints.debts,{optional:true}),
      W.ZZXBitcoinTickerFetch.json(W.ZZXBitcoinTickerConstants.endpoints.usDebt,{optional:true})
    ]);

    const rows=normalize(all);
    const usRow=normalizeUs(us);

    if(usRow&&!rows.some(r=>r.code==="US"))rows.push(usRow);
    rows.sort((a,b)=>a.name.localeCompare(b.name));

    cache.data=rows;
    cache.at=now;
    return rows;
  }

  function populate(root,rows){
    const select=root.querySelector("[data-debt-country]");
    if(!select)return;

    const stored=(()=>{try{return localStorage.getItem(W.ZZXBitcoinTickerConstants.storage.debtCountry)}catch(_){return null}})();
    const current=stored||select.value||"US";

    select.replaceChildren();

    for(const row of rows){
      const o=D.createElement("option");
      o.value=row.code||row.name;
      o.textContent=row.name;
      select.appendChild(o);
    }

    if(!select.options.length){
      const o=D.createElement("option");o.value="";o.textContent="national debt data unavailable";select.appendChild(o);
    }else{
      select.value=[...select.options].some(o=>o.value===current)?current:select.options[0].value;
    }
  }

  function fmtUsd(v,negative=false){
    const n=finite(v);
    if(!Number.isFinite(n))return "—";
    const value=negative?-Math.abs(n):n;
    return value.toLocaleString(undefined,{style:"currency",currency:"USD",notation:Math.abs(value)>=1e9?"compact":"standard",maximumFractionDigits:2});
  }

  function render(root,rows,height,issuedSats){
    const select=root.querySelector("[data-debt-country]");
    const row=rows.find(r=>(r.code||r.name)===(select?.value||""))||rows[0];

    const issuedBtc=typeof issuedSats==="bigint"?Number(issuedSats)/1e8:NaN;
    const terminal=W.ZZXBitcoinTickerConstants.terminalSupplyBtc;

    if(!row){
      set(root,"[data-debt-total]","—");
      set(root,"[data-debt-source]","national debt data unavailable");
      return;
    }

    const perIssued=issuedBtc>0?row.debtUsd/issuedBtc:NaN;
    const perTerminal=row.debtUsd/terminal;
    const issuedPerDollar=issuedBtc>0?issuedBtc/row.debtUsd:NaN;
    const terminalPerDollar=terminal/row.debtUsd;

    set(root,"[data-debt-total]",`${row.name}: ${fmtUsd(row.debtUsd)}`);
    set(root,"[data-debt-per-issued]",fmtUsd(perIssued,true));
    set(root,"[data-debt-per-terminal]",fmtUsd(perTerminal,true));
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
    set(root,"[data-debt-source]",`${row.source}${row.recordDate?` · ${row.recordDate}`:""}`);
    set(
      root,
      "[data-chain-height]",
      Number.isFinite(Number(height))
        ? `height ${Number(height).toLocaleString()}`
        : "height unavailable"
    );
  }

  W.ZZXBitcoinTickerDebts=Object.freeze({__version:7,load,populate,render});
})();
