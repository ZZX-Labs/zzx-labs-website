(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitcoinTickerExchangeRates?.__version>=1)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const code=v=>String(v||"").trim().toUpperCase();

  function catalog(data){
    const names=new Map([["USD","US Dollar"]]);
    const order=[];

    const add=(c,name)=>{
      const k=code(c);
      if(!/^[A-Z]{3}$/.test(k)||k==="BTC")return;
      if(!names.has(k))order.push(k);
      names.set(k,String(name||k));
    };

    if(Array.isArray(data)){
      for(const row of data){
        if(typeof row==="string")add(row,row);
        else add(row?.code??row?.currency??row?.symbol,row?.name??row?.label);
      }
    }

    if(Array.isArray(data?.order)){
      for(const c of data.order)add(c,data?.names?.[c]);
    }

    if(data?.names&&typeof data.names==="object"){
      for(const [c,name] of Object.entries(data.names))add(c,name);
    }

    const lists=[data?.currencies,data?.fiat,data?.data?.currencies];
    for(const list of lists){
      if(Array.isArray(list)){
        for(const row of list){
          if(typeof row==="string")add(row,row);
          else add(row?.code??row?.currency??row?.symbol,row?.name??row?.label);
        }
      }
    }

    if(!names.has("USD"))names.set("USD","US Dollar");
    if(!order.includes("USD"))order.unshift("USD");

    return {order:[...new Set(order)],names};
  }

  function symbols(data){
    const out=new Map([["USD","$"]]);
    if(data&&typeof data==="object"){
      const source=data.symbols&&typeof data.symbols==="object"?data.symbols:data;
      for(const [k,v] of Object.entries(source)){
        const c=code(k);
        if(/^[A-Z]{3}$/.test(c)&&typeof v==="string"&&v.trim())out.set(c,v);
      }
    }
    return out;
  }

  function localRates(data){
    const out=new Map([["USD",1]]);
    const parse=map=>{
      if(!map||typeof map!=="object"||Array.isArray(map))return;
      for(const [raw,row] of Object.entries(map)){
        const c=code(raw);
        if(!/^[A-Z]{3}$/.test(c))continue;

        if(typeof row==="number"){
          if(row>0)out.set(c,row);
          continue;
        }

        if(!row||typeof row!=="object")continue;
        const perUsd=finite(row.per_usd??row.units_per_usd??row.usd_to??row.rate??row.value);
        const usdPerUnit=finite(row.usd_per_unit??row.to_usd??row.usd_value);

        if(perUsd>0)out.set(c,perUsd);
        else if(usdPerUnit>0)out.set(c,1/usdPerUnit);
      }
    };

    parse(data?.rates);
    parse(data?.exchange_rates);
    parse(data?.data?.rates);
    if(out.size===1)parse(data);
    return out;
  }

  async function rate(config,currency){
    const c=code(currency)||"USD";
    if(c==="USD")return {rate:1,provider:"USD-base",updated_at:config?.ratesData?.updated_at||null};

    const local=finite(config?.rates?.get(c));
    if(local>0)return {rate:local,provider:"ZZX local FX",updated_at:config?.ratesData?.updated_at||null};

    const result=await W.ZZXFX.rate(c);
    const n=finite(result?.rate);
    if(!(n>0))throw new Error(`No valid FX rate for ${c}`);

    config.rates.set(c,n);
    return {rate:n,provider:String(result?.provider||result?.source||"ZZXFX"),updated_at:result?.updated_at||null};
  }

  function quoteFromUsd(usdValue,rateValue){
    const usd=finite(usdValue),r=finite(rateValue);
    return Number.isFinite(usd)&&r>0?usd*r:NaN;
  }

  function safeGet(key){try{return W.localStorage.getItem(key)}catch(_){return null}}

  function populateCurrencies(root,config){
    const select=root?.querySelector?.("[data-currency-select]");
    if(!select)return;
    const wanted=safeGet(W.ZZXBitcoinTickerConstants.storage.quote)||"USD";

    select.replaceChildren();
    for(const c of config?.fiat?.order||[]){
      const o=document.createElement("option");
      o.value=c;
      o.textContent=`${c} — ${config.fiat.names.get(c)||c}`;
      select.appendChild(o);
    }

    if(!select.options.length){
      const o=document.createElement("option");
      o.value="USD";o.textContent="USD — US Dollar";select.appendChild(o);
    }

    select.value=[...select.options].some(o=>o.value===wanted)?wanted:"USD";
  }

  function render(root,state){
    const grid=root?.querySelector?.("[data-fx-grid]");
    if(!grid)return;

    const cfg=state?.config;
    const rates=cfg?.rates;
    const fiat=cfg?.fiat;
    if(!rates||!fiat)return;

    const needle=String(root.querySelector("[data-fx-search]")?.value||"").trim().toLowerCase();
    const rows=[];

    for(const c of fiat.order||[]){
      const r=Number(rates.get(c));
      if(!(Number.isFinite(r)&&r>0))continue;
      const name=String(fiat.names.get(c)||c);
      if(needle&&!`${c} ${name}`.toLowerCase().includes(needle))continue;
      rows.push({code:c,name,rate:r});
    }

    grid.replaceChildren();
    for(const row of rows){
      const card=document.createElement("div");
      card.className="bitcoin-ticker__fx-card";
      const codeEl=document.createElement("span");
      codeEl.textContent=`1 USD → ${row.code}`;
      const strong=document.createElement("strong");
      strong.textContent=row.rate.toLocaleString(undefined,{maximumFractionDigits:8});
      const small=document.createElement("small");
      small.textContent=row.name;
      card.append(codeEl,strong,small);
      grid.appendChild(card);
    }

    const count=root.querySelector("[data-fx-count]");
    if(count)count.textContent=`${rows.length} available rates`;
  }

  function mount(root,state){
    if(root.__zzxTickerExchangeRatesMounted)return;
    root.__zzxTickerExchangeRatesMounted=true;
    let timer=null;
    root.querySelector("[data-fx-search]")?.addEventListener("input",()=>{
      if(timer)W.clearTimeout(timer);
      timer=W.setTimeout(()=>render(root,state),100);
    });
    render(root,state);
  }

  const api=Object.freeze({
    __version:1,
    catalog,symbols,localRates,rate,quoteFromUsd,
    populateCurrencies,render,mount
  });
  W.ZZXBitcoinTickerExchangeRates=api;
  W.ZZXBitcoinTickerFX=api;
})();
