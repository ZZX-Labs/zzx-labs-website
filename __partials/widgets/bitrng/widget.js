// __partials/widgets/bitrng/widget.js
// BitRNG — Bitcoin-derived entropy RNG
// Uses recent transaction / block data as entropy seed.
// DROP-IN, no dependencies beyond ZZXWidgetsCore.

(function () {
  const Core = window.ZZXWidgetsCore;
  if (!Core) return;

  const WIDGET_ID = "bitrng";

  function qs(sel, scope){ return (scope || document).querySelector(sel); }

  function hex(bytes){
    return Array.from(bytes).map(b => b.toString(16).padStart(2,"0")).join("");
  }

  async function sha256Hex(input){
    const data = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return hex(new Uint8Array(hash));
  }

  function nowISO(){
    return new Date().toISOString();
  }

  async function fetchEntropy(){
    // Prefer mempool.space public endpoints (CORS-friendly)
    try{
      // latest block height
      const tip = await Core.fetchJSON("https://mempool.space/api/blocks/tip/height");
      // recent mempool txids (limited)
      const txids = await Core.fetchJSON("https://mempool.space/api/mempool/txids");
      const slice = Array.isArray(txids) ? txids.slice(0, 8).join("") : "";
      return {
        source: "mempool.space",
        tip,
        txids: slice
      };
    }catch(e){
      // fallback entropy
      return {
        source: "fallback",
        tip: "—",
        txids: crypto.getRandomValues(new Uint32Array(4)).join("")
      };
    }
  }

  async function generate(root){
    const outHash = qs('[data-bitrng="hash"]', root);
    const outSeed = qs('[data-bitrng="seed"]', root);
    const outSrc  = qs('[data-bitrng="source"]', root);
    const outTime = qs('[data-bitrng="time"]', root);

    outHash.textContent = "…";

    const entropy = await fetchEntropy();
    const seed = [
      entropy.source,
      entropy.tip,
      entropy.txids,
      nowISO(),
      Math.random().toString()
    ].join("|");

    const hash = await sha256Hex(seed);

    outHash.textContent = hash;
    outSeed.textContent = seed.slice(0, 64) + "…";
    outSrc.textContent  = entropy.source;
    outTime.textContent = new Date().toLocaleTimeString();
  }

  function bind(root){
    const btn = qs('[data-bitrng-action="regen"]', root);
    if (btn && !btn.__bound){
      btn.__bound = true;
      btn.addEventListener("click", () => generate(root));
    }
  }

  function boot(){
    const root = qs('[data-widget-root="bitrng"]');
    if (!root || root.__booted) return;
    root.__booted = true;

    bind(root);
    generate(root);
  }

  // Safe boot
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  }else{
    boot();
  }
})();
