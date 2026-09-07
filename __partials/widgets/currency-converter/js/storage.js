(function(){
  "use strict";
  const W=window;
  if(W.ZZXCurrencyConverterStorage?.__version>=3)return;

  const KEYS=Object.freeze({
    home:"zzx.widget.currency-converter.home.v3",
    from:"zzx.widget.currency-converter.from.v3",
    to:"zzx.widget.currency-converter.to.v3",
    amount:"zzx.widget.currency-converter.amount.v3",
    referencePage:"zzx.widget.currency-converter.reference-page.v1"
  });

  function get(key){
    try{
      return W.localStorage.getItem(key);
    }catch(_){
      return null;
    }
  }

  function set(key,value){
    try{
      W.localStorage.setItem(
        key,
        String(value)
      );
      return true;
    }catch(_){
      return false;
    }
  }

  function readHome(){
    try{
      const parsed=JSON.parse(
        get(KEYS.home)||"null"
      );

      return (
        parsed &&
        typeof parsed==="object" &&
        parsed.currency
      )
        ? parsed
        : null;
    }catch(_){
      return null;
    }
  }

  function saveHome(currency,source="explicit"){
    const record=Object.freeze({
      currency:String(
        currency||"USD"
      ).toUpperCase(),
      source:String(source||"explicit"),
      savedAt:new Date().toISOString()
    });

    try{
      W.localStorage.setItem(
        KEYS.home,
        JSON.stringify(record)
      );
    }catch(_){}

    return record;
  }

  W.ZZXCurrencyConverterStorage=Object.freeze({
    __version:3,
    keys:KEYS,
    get,
    set,
    readHome,
    saveHome
  });
})();
