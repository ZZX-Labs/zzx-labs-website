(() => {
  "use strict";

  function normalizePrices(data) {
    if(!data||typeof data!=="object")throw new Error("Price provider returned no object.");
    const out={};
    for(const [k,v] of Object.entries(data)) {
      const n=Number(v);
      if(Number.isFinite(n)&&n>0)out[String(k).toUpperCase()]=n;
    }
    if(!Object.keys(out).length)throw new Error("No positive numeric prices found.");
    return out;
  }

  function convert(amount,from,to,price) {
    const a=Number(amount);
    if(!Number.isFinite(a))throw new Error("Invalid amount.");
    if(!(price>0))throw new Error("Price unavailable.");

    let btc;
    if(from==="BTC")btc=a;
    else if(from==="SATS")btc=a/100000000;
    else if(from==="FIAT")btc=a/price;
    else throw new Error("Unknown source unit.");

    if(to==="BTC")return btc;
    if(to==="SATS")return btc*100000000;
    if(to==="FIAT")return btc*price;
    throw new Error("Unknown target unit.");
  }

  window.BitTickCore=Object.freeze({normalizePrices,convert});
})();
