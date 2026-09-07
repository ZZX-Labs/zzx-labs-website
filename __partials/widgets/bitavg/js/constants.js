(function(){
  "use strict";
  const W=window;
  if(W.ZZXBitAvgConstants?.__version>=5)return;

  W.ZZXBitAvgConstants=Object.freeze({
    __version:5,
    refreshMs:2500,
    timeoutMs:10000,
    pageSize:10,
    cacheKey:"zzx.widgets.bitavg.snapshot.v4",
    cacheMaxAgeMs:30*60*1000,
    projectPath:"/projects/software/bitavg/",
    endpoints:Object.freeze({
      markets:"/bitcoin/bpi/api/markets.json",
      latest:"/bitcoin/bpi/api/latest.json",
      exchanges:"/bitcoin/bpi/api/exchanges.json",
      currencies:"/bitcoin/bpi/api/currencies.json",
      rates:"/bitcoin/bpi/api/exchange_rates.json"
    })
  });
})();
