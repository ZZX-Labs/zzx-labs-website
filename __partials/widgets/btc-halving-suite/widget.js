// __partials/widgets/btc-halving-suite/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "btc-halving-suite";

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function formatBTCFromSats(sats, digits=8) {
    if (typeof sats !== "bigint") return "—";
    const value = Number(sats) / 1e8;
    return `${value.toLocaleString(undefined,{maximumFractionDigits:digits})} BTC`;
  }

  function status(root, label, state) {
    const el = q(root, "[data-halving-status]");
    if (!el) return;
    el.textContent = label;
    el.setAttribute("data-status", state || "offline");
  }

  function humanDurationFromBlocks(blocks, secondsPerBlock) {
    const total = Math.max(0, Number(blocks) * Number(secondsPerBlock));
    if (!Number.isFinite(total)) return "—";

    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);

    if (days >= 365) {
      const years = Math.floor(days / 365);
      const remDays = days % 365;
      return `${years}y ${remDays}d`;
    }

    if (days > 0) return `${days}d ${hours}h`;

    const minutes = Math.floor((total % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  async function ensureModel(core) {
    if (W.ZZXHalvingModel?.build) return;

    const base = core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g, "")
      : "/__partials/widgets/btc-halving-suite";

    const src = W.ZZXAPI?.url
      ? W.ZZXAPI.url(`${base}/js/model.js`)
      : `${base}/js/model.js`;

    await new Promise((resolve, reject) => {
      const script = D.createElement("script");
      script.src = src;
      script.defer = true;
      script.addEventListener("load", resolve, { once:true });
      script.addEventListener("error", reject, { once:true });
      (D.head || D.documentElement).appendChild(script);
    });

    if (!W.ZZXHalvingModel?.build) {
      throw new Error("halving model unavailable");
    }
  }

  function render(root, model) {
    const pct = Math.max(0, Math.min(100, model.progress));

    q(root, "[data-halving-countdown]").textContent =
      `${model.blocksRemaining.toLocaleString()} blocks`;

    q(root, "[data-halving-sub]").textContent =
      `${humanDurationFromBlocks(model.blocksRemaining,600)} at target cadence · ` +
      `${humanDurationFromBlocks(model.blocksRemaining,model.cadenceSeconds)} at recent cadence`;

    q(root, "[data-halving-progress-label]").textContent =
      `epoch progress ${pct.toFixed(3)}%`;

    q(root, "[data-halving-height]").textContent =
      `${model.blockInEpoch.toLocaleString()} / 210,000`;

    const track = q(root, "[data-halving-progress]");
    if (track) track.setAttribute("aria-valuenow", pct.toFixed(3));

    const bar = q(root, "[data-halving-bar]");
    if (bar) bar.style.width = `${pct}%`;

    q(root, "[data-halving-subsidy]").textContent =
      formatBTCFromSats(model.subsidySats,8);

    q(root, "[data-halving-issued]").textContent =
      formatBTCFromSats(model.issuedSats,8);

    q(root, "[data-halving-remaining]").textContent =
      formatBTCFromSats(model.subsidyRemainingSats,8);

    q(root, "[data-halving-headroom]").textContent =
      formatBTCFromSats(model.nominalHeadroomSats,8);

    q(root, "[data-halving-era]").textContent =
      `halving #${model.halvingNumber} · subsidy era ${model.era}`;

    q(root, "[data-halving-next-height]").textContent =
      model.nextHeight.toLocaleString();

    q(root, "[data-halving-target-eta]").textContent =
      new Date(model.targetEtaMs).toLocaleString();

    q(root, "[data-halving-cadence-eta]").textContent =
      `${new Date(model.cadenceEtaMs).toLocaleString()} · ${(
        model.cadenceSeconds / 60
      ).toFixed(2)} min/block`;

    q(root, "[data-halving-terminal]").textContent =
      formatBTCFromSats(model.terminalSupplySats,8);

    q(root, "[data-halving-meta]").textContent =
      `height ${model.height.toLocaleString()} · integer satoshi subsidy schedule · nominal cap 21,000,000 BTC`;

    status(root,"live","ok");
  }

  async function refresh(root,state,force=false) {
    if (state.busy || !root.isConnected) return;

    state.busy = true;
    status(root,"refreshing","warn");

    try {
      if (!W.ZZXChain) throw new Error("ZZXChain unavailable");

      const [tipResult, blocksResult] = await Promise.all([
        W.ZZXChain.tipHeight(force),
        W.ZZXChain.recentBlocks(force).catch(() => ({blocks:[]}))
      ]);

      state.model = W.ZZXHalvingModel.build(
        tipResult.height,
        blocksResult.blocks
      );

      render(root,state.model);
    } catch (error) {
      status(root,state.model ? "stale" : "offline",state.model ? "warn" : "error");
      q(root,"[data-halving-meta]").textContent = String(error?.message || error);
    } finally {
      state.busy = false;
    }
  }

  async function boot(root,core) {
    if (!root) return;

    const state = {
      busy:false,
      model:null,
      timer:null
    };

    root.__zzxHalvingSuiteState = state;

    try {
      await ensureModel(core || W.ZZXWidgetsCore || null);

      q(root,"[data-halving-refresh]")?.addEventListener("click",()=>{
        refresh(root,state,true);
      });

      await refresh(root,state,false);

      async function loop() {
        if (!root.isConnected) return;
        await refresh(root,state,false);
        state.timer = W.setTimeout(loop,15000);
      }

      state.timer = W.setTimeout(loop,15000);
    } catch (error) {
      status(root,"offline","error");
      q(root,"[data-halving-meta]").textContent = String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID,boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID,boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID,boot);
})();
