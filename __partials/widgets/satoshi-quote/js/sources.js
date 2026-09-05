// __partials/widgets/satoshi-quote/js/sources.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXSatoshiQuoteSources?.__version>=3)return;

  W.ZZXSatoshiQuoteSources=Object.freeze({
    __version:3,
    corpus:"/__partials/widgets/satoshi-quote/quotes.json",
    rotationMs:45000,
    archiveUrl:"https://satoshi.nakamotoinstitute.org/quotes/",
    whitepaperUrl:"https://bitcoin.org/bitcoin.pdf"
  });
})();
