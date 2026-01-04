(function () {
  const ID = "btc-blockexplorer";

  function mk(url, label){
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  }

  window.ZZXWidgetRegistry.register(ID, {
    async init({ root }) {
      const inp = root.querySelector("[data-q]");
      const go  = root.querySelector("[data-go]");
      const links = root.querySelector("[data-links]");

      const run = () => {
        const q = String(inp?.value || "").trim();
        if (!q || !links) return;

        const isNum = /^\d+$/.test(q);
        const isTx  = /^[0-9a-fA-F]{64}$/.test(q);
        const isAddr = /^[13bc1][a-zA-Z0-9]{20,}$/i.test(q);

        const out = [];
        if (isNum) out.push({ k:"mempool", v: mk(`https://mempool.space/block/${q}`, "block (height)") });
        if (isTx)  out.push({ k:"mempool", v: mk(`https://mempool.space/tx/${q}`, "tx") });
        if (isAddr) out.push({ k:"mempool", v: mk(`https://mempool.space/address/${q}`, "address") });

        out.push({ k:"mempool", v: mk(`https://mempool.space/search?q=${encodeURIComponent(q)}`, "search") });

        links.innerHTML = out.map(x => `<div class="row"><span class="k">${x.k}</span><span class="v">${x.v}</span></div>`).join("");
      };

      go?.addEventListener("click", run);
      inp?.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
    },

    tick(){},
    destroy(){}
  });
})();
