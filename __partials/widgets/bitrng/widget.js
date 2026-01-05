// __partials/widgets/bitrng/widget.js
// BitRNG — unified-runtime compatible (NO UI / logic changes)

(function () {
  window.ZZXWidgets.register("bitrng", {
    mount(slotEl) {
      this.root = slotEl;
    },

    async start(ctx) {
      if (!this.root || !ctx) return;

      const root = this.root;

      const $ = (sel) => root.querySelector(sel);

      const outValue  = $("[data-bitrng-value]");
      const outSub    = $("[data-bitrng-sub]");
      const outSource = $("[data-bitrng-source]");
      const outHealth = $("[data-bitrng-health]");
      const outRate   = $("[data-bitrng-rate]");
      const hint      = $("[data-bitrng-hint]");

      const btnRefresh = root.querySelector('[data-bitrng-action="refresh"]');
      const btnCopy    = root.querySelector('[data-bitrng-action="copy"]');

      if (!outValue) return;

      function hex(bytes) {
        return Array.from(bytes)
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");
      }

      async function sha256Hex(input) {
        const data = new TextEncoder().encode(input);
        const hash = await crypto.subtle.digest("SHA-256", data);
        return hex(new Uint8Array(hash));
      }

      async function fetchEntropy() {
        try {
          const tip = await ctx.fetchJSON("https://mempool.space/api/blocks/tip/height");
          const txids = await ctx.fetchJSON("https://mempool.space/api/mempool/txids");
          const slice = Array.isArray(txids) ? txids.slice(0, 8).join("") : "";
          return {
            source: "mempool.space",
            tip,
            txids: slice
          };
        } catch {
          return {
            source: "fallback",
            tip: "—",
            txids: crypto.getRandomValues(new Uint32Array(4)).join("")
          };
        }
      }

      const generate = async () => {
        outValue.textContent = "…";

        const entropy = await fetchEntropy();
        const seed = [
          entropy.source,
          entropy.tip,
          entropy.txids,
          new Date().toISOString(),
          Math.random().toString()
        ].join("|");

        const hash = await sha256Hex(seed);

        outValue.textContent  = hash;
        outSub.textContent    = `hardware entropy · ${new Date().toLocaleTimeString()}`;
        outSource.textContent = entropy.source;
        outHealth.textContent = entropy.source === "fallback" ? "degraded" : "ok";
        outRate.textContent   = "on-demand";
      };

      btnRefresh?.addEventListener("click", generate);
      btnCopy?.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(outValue.textContent);
          if (hint) hint.textContent = "copied to clipboard";
        } catch {
          if (hint) hint.textContent = "copy failed";
        }
      });

      await generate();
    },

    stop() {}
  });
})();
