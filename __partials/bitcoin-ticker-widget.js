// __partials/bitcoin-ticker-widget.js



// DROP-IN REPLACEMENT


//


// Purpose (and ONLY purpose):


// - Ensure the HUD boots via /static/js/modules/ticker-loader.js (prefix-aware)


// - Do NOT load runtime.js directly (that breaks widget dependency order and causes duplicates)


//


// This file is a compatibility shim for legacy pages that still include


// "__partials/bitcoin-ticker-widget.js". The real orchestrator is ticker-loader.js.





(function () {


  "use strict";





  const W = window;





  // prevent duplicate injection across reinjections / partial reloads


  if (W.__ZZX_PARTIAL_TICKER_SHIM_BOOTED) return;


  W.__ZZX_PARTIAL_TICKER_SHIM_BOOTED = true;





  function getPrefix() {


    const p = W.ZZX?.PREFIX;


    return (typeof p === "string" && p.length) ? p : ".";


  }





  function join(prefix, path) {


    if (!path) return path;


    if (/^https?:\/\//i.test(path)) return path;


    if (prefix === "/") return path;


    if (!String(path).startsWith("/")) return path;


    return String(prefix).replace(/\/+$/, "") + path;


  }





  function ensureTickerLoader() {


    // ticker-loader.js is the single source of truth now


    if (document.querySelector('script[data-zzx-ticker-loader="1"]')) return;





    const prefix = getPrefix();


    const src = join(prefix, "/static/js/modules/ticker-loader.js");





    const s = document.createElement("script");


    s.src = src;


    s.defer = true;


    s.setAttribute("data-zzx-ticker-loader", "1");


    document.body.appendChild(s);


  }





  // If prefix already known, inject immediately.


  // Otherwise, wait for partials-loader event (zzx:partials-ready).


  if (W.ZZX?.PREFIX) {


    ensureTickerLoader();


    return;


  }





  let done = false;





  function finish() {


    if (done) return;


    done = true;


    ensureTickerLoader();


  }





  // Listen for partials-loader readiness


  W.addEventListener("zzx:partials-ready", finish, { once: true });





  // Fallback: inject after DOM ready even if event never fires


  if (document.readyState === "loading") {


    document.addEventListener("DOMContentLoaded", finish, { once: true });


  } else {


    finish();


  }


})();
