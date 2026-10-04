(function(){
  "use strict";
  const W=window;
  if(W.ZZXCurrencyConverterRegion?.__version>=3)return;

  function resolve(path){
    return W.ZZXAPI?.url
      ? W.ZZXAPI.url(path)
      : path;
  }

  async function json(path){
    const target=resolve(path);

    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(
        target,
        {
          cacheBust:false,
          timeoutMs:7000,
          retries:1
        }
      );
    }

    const response=await fetch(
      target,
      {cache:"force-cache"}
    );

    if(!response.ok){
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    return await response.json();
  }

  function regionFromLocale(locale){
    const raw=String(locale||"").trim();
    if(!raw)return null;

    try{
      if(typeof Intl.Locale==="function"){
        const localeObject=new Intl.Locale(raw);
        const maximized=
          typeof localeObject.maximize==="function"
            ? localeObject.maximize()
            : localeObject;

        const region=String(
          maximized.region||""
        ).toUpperCase();

        if(/^[A-Z]{2}$/.test(region)){
          return region;
        }
      }
    }catch(_){}

    const match=raw.match(
      /[-_]([A-Za-z]{2})(?:$|[-_])/
    );

    return match
      ? match[1].toUpperCase()
      : null;
  }

  function candidateLocales(){
    const out=[];

    for(const value of W.navigator?.languages||[]){
      if(value&&!out.includes(value)){
        out.push(value);
      }
    }

    if(
      W.navigator?.language &&
      !out.includes(W.navigator.language)
    ){
      out.push(W.navigator.language);
    }

    try{
      const locale=
        Intl.DateTimeFormat()
          .resolvedOptions()
          .locale;

      if(locale&&!out.includes(locale)){
        out.push(locale);
      }
    }catch(_){}

    return out;
  }

  async function detect(){
    const data=await json(
      "/__partials/widgets/currency-converter/region-currencies.json"
    );

    const regions=data?.regions||{};

    for(const locale of candidateLocales()){
      const region=regionFromLocale(locale);

      if(region&&regions[region]){
        return {
          region,
          currency:String(
            regions[region]
          ).toUpperCase(),
          locale,
          source:"browser-locale"
        };
      }
    }

    return {
      region:null,
      currency:String(
        data?.fallback||"USD"
      ).toUpperCase(),
      locale:candidateLocales()[0]||null,
      source:"fallback-usd"
    };
  }

  W.ZZXCurrencyConverterRegion=Object.freeze({
    __version:3,
    regionFromLocale,
    candidateLocales,
    detect
  });
})();
