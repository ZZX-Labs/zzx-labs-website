(function () {
  "use strict";

  const WFB = window.WFB;
  if (!WFB) return;

  async function init() {
    await WFB.partials?.init?.();
    WFB.navigation?.init?.();

    for (const name of ["archive", "timeline", "readingRoom", "globe", "dailyArchive",
      "status", "search", "provenance", "hybrid"]) {
      try { await WFB[name]?.init?.(); }
      catch (error) { console.error(`[ZZX-WorldFactbook] ${name} initialization failed:`, error); }
    }
    WFB.dispatch("wfb:ready", { archive: WFB.state.archive });
    let refreshing=false;
    setInterval(async()=>{
      if(document.hidden||refreshing)return;
      refreshing=true;window.ZZXWorldFactbook.clearCache();
      try {await Promise.allSettled([WFB.globe?.refresh?.(),WFB.dailyArchive?.refresh?.()]);}
      finally {refreshing=false;}
    },15*60*1000);
  }

  window.WFBCore = Object.freeze({ init });
})();
