// __partials/widgets/themarketbtccreated/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXTheMarketBTCCreatedSources?.__version>=4)return;

  W.ZZXTheMarketBTCCreatedSources=Object.freeze({
    __version:4,
    appraisal:"/bitcoin/bpi/api/themarketbtccreated.json",
    bpi:"/bitcoin/bpi/api/latest.json",
    refreshMs:120000,
    timeoutMs:12000,
    cacheKey:"zzx:themarketbtccreated:v4",
    cacheMaxAgeMs:24*60*60*1000
  });
})();
