(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitAvgFX?.__version>=5)return;

  const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:NaN};
  const code=v=>String(v||"").trim().toUpperCase();

  function fiatCodes(data){
    const set=new Set(["USD"]);

    const add=v=>{
      const c=code(v);
      if(/^[A-Z]{3}$/.test(c))set.add(c);
    };

    if(Array.isArray(data)){
      for(const item of data){
        if(typeof item==="string")add(item);
        else add(item?.code??item?.currency??item?.symbol);
      }
    }

    const candidates=[
      data?.currencies,
      data?.fiat,
      data?.data?.currencies,
      data?.data?.fiat
    ];

    for(const c of candidates){
      if(Array.isArray(c)){
        for(const item of c){
          if(typeof item==="string")add(item);
          else add(item?.code??item?.currency??item?.symbol);
        }
      }else if(c&&typeof c==="object"){
        for(const k of Object.keys(c))add(k);
      }
    }

    if(data&&typeof data==="object"&&!Array.isArray(data)){
      const keys=Object.keys(data);
      if(keys.some(k=>/^[A-Z]{3}$/.test(k))){
        for(const k of keys)add(k);
      }
    }

    return set;
  }

  function ratesPerUsd(data){
    const out=new Map([["USD",1]]);

    const set=(currency,value,orientation="per_usd")=>{
      const c=code(currency);
      let n=finite(value);
      if(!/^[A-Z]{3}$/.test(c)||!(n>0))return;
      if(orientation==="usd_per_unit")n=1/n;
      out.set(c,n);
    };

    function parseMap(map){
      if(!map||typeof map!=="object"||Array.isArray(map))return;

      for(const [currency,value] of Object.entries(map)){
        if(typeof value==="number"){
          set(currency,value,"per_usd");
          continue;
        }

        if(!value||typeof value!=="object")continue;

        const perUsd=finite(
          value.per_usd ??
          value.units_per_usd ??
          value.usd_to ??
          value.rate ??
          value.value
        );

        const usdPerUnit=finite(
          value.usd_per_unit ??
          value.to_usd ??
          value.usd_value
        );

        if(perUsd>0)set(currency,perUsd,"per_usd");
        else if(usdPerUnit>0)set(currency,usdPerUnit,"usd_per_unit");
      }
    }

    parseMap(data?.rates);
    parseMap(data?.exchange_rates);
    parseMap(data?.data?.rates);
    parseMap(data?.data?.exchange_rates);

    if(out.size===1)parseMap(data);

    return out;
  }

  function toUsd(nativePrice,quote,rates){
    const price=finite(nativePrice);
    const q=code(quote);
    if(!(price>0))return NaN;
    if(q==="USD")return price;

    const perUsd=finite(rates?.get?.(q));
    return perUsd>0?price/perUsd:NaN;
  }

  W.ZZXBitAvgFX=Object.freeze({
    __version:5,
    fiatCodes,
    ratesPerUsd,
    toUsd
  });
})();
