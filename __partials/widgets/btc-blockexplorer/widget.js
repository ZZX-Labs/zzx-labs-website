(function () {
  const ID = "btc-blockexplorer";

  function mk(url, label){
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = label;
    return a;
  }

  window.ZZXWidgetRegistry.register(ID, {
    _root: null,

    async init({ root }) {
      this._root = root;

      const inp = root.querySelector("[data-q]");
      const go  = root.querySelector("[data-go]");
      const links = root.querySelector("[data-links]");

      const run = () => {
        const q = String(inp?.value || "").trim();
        if (!q) return;

        // naive classification
        const isNum = /^\d+$/.test(q);
        const isTx  = /^[0-9a-fA-F]{64}$/.test(q);
        const isAddr = /^[13bc1][a-zA-Z0-9]{20,}$/i.test(q);

        const list = [];
        if (isNum) {
          list.push({ cc:"mempool", url:`https://mempool.space/block/${q}`, n:"block height" });
        }
        if (isTx) {
          list.push({ cc:"mempool", url:`https://mempool.space/tx/${q}`, n:"tx" });
        }
        if (isAddr) {
          list.push({ cc:"mempool", url:`https://mempool.space/address/${q}`, n:"address" });
        }

        // Always provide search fallback
        list.push({ cc:"mempool", url:`https://mempool.space/search?q=${encodeURIComponent(q)}`, n:"search" });

        if (links) {
          links.innerHTML = "";
          list.forEach(x => {
            const row = document.createElement("div");
            row.className = "row";
            const left = document.createElement("span");
            left.className = "cc";
            left.textContent = x.cc;
            const right = document.createElement("span");
            right.appendChild(mk(x.url, x.n));
            row.appendChild(left);
            row.appendChild(right);
            links.appendChild(row);
          });
        }
      };

      go?.addEventListener("click", run);
      inp?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") run();
      });
    },

    tick(){},
    destroy(){}
  });
})();
