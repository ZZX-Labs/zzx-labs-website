// __partials/widgets/bitbilling/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "bitbilling";
  const STORE = "zzx.widget.bitbilling.currency";

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function safeGet() {
    try { return W.localStorage.getItem(STORE); }
    catch (_) { return null; }
  }

  function safeSet(value) {
    try { W.localStorage.setItem(STORE, value); }
    catch (_) {}
  }

  function status(root, label, state) {
    const el = q(root, "[data-bill-status]");
    if (!el) return;
    el.textContent = label;
    el.setAttribute("data-status", state || "offline");
  }

  async function ensureInvoice(core) {
    if (W.ZZXBitBillingInvoice?.build) return;

    const base = core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g, "")
      : "/__partials/widgets/bitbilling";

    const src = W.ZZXAPI?.url
      ? W.ZZXAPI.url(`${base}/js/invoice.js`)
      : `${base}/js/invoice.js`;

    await new Promise((resolve, reject) => {
      const script = D.createElement("script");
      script.src = src;
      script.defer = true;
      script.addEventListener("load", resolve, { once:true });
      script.addEventListener("error", reject, { once:true });
      (D.head || D.documentElement).appendChild(script);
    });
  }

  async function calculate(root, state) {
    if (!W.ZZXFX || state.busy) return;

    const amount = finite(q(root, "[data-bill-amount]")?.value);
    const currency = q(root, "[data-bill-currency]")?.value;
    const memo = q(root, "[data-bill-memo]")?.value || "";

    if (!Number.isFinite(amount) || amount < 0 || !currency) {
      q(root, "[data-bill-meta]").textContent = "Enter a valid invoice amount.";
      return;
    }

    state.busy = true;
    status(root, "quoting", "warn");

    try {
      const [btcResult, usdResult, btcUsd] = await Promise.all([
        W.ZZXFX.convert(amount, currency, "BTC"),
        W.ZZXFX.convert(amount, currency, "USD"),
        W.ZZXFX.btcPriceUsd()
      ]);

      const invoice = W.ZZXBitBillingInvoice.build({
        amount,
        currency,
        memo,
        btc: btcResult.value,
        usd: usdResult.value,
        btcUsd,
        providers: [...(btcResult.providers || []), ...(usdResult.providers || [])],
        timestamp: new Date().toISOString()
      });

      state.invoice = invoice;

      q(root, "[data-bill-btc]").textContent =
        `${invoice.btc.toLocaleString(undefined,{maximumFractionDigits:8})} BTC`;
      q(root, "[data-bill-sats]").textContent =
        `${invoice.sats.toLocaleString()} sats`;
      q(root, "[data-bill-mbtc]").textContent =
        invoice.mbtc.toLocaleString(undefined,{maximumFractionDigits:5});
      q(root, "[data-bill-usd]").textContent =
        invoice.usd.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2});
      q(root, "[data-bill-price]").textContent =
        invoice.btcUsd.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2});
      q(root, "[data-bill-time]").textContent =
        new Date(invoice.timestamp).toLocaleTimeString();
      q(root, "[data-bill-meta]").textContent =
        `Calculator snapshot · ${invoice.providers.join(" + ") || "ZZX BPI"} · no custody/address/rate lock`;

      status(root, "live", "ok");
    } catch (error) {
      status(root, state.invoice ? "stale" : "offline", state.invoice ? "warn" : "error");
      q(root, "[data-bill-meta]").textContent = String(error?.message || error);
    } finally {
      state.busy = false;
    }
  }

  async function copyText(text) {
    if (W.navigator.clipboard?.writeText) {
      await W.navigator.clipboard.writeText(text);
      return;
    }

    const ta = D.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    D.body.appendChild(ta);
    ta.select();
    D.execCommand("copy");
    ta.remove();
  }

  async function boot(root, core) {
    if (!root) return;

    const state = { invoice:null, busy:false };
    root.__zzxBitBillingState = state;

    try {
      if (!W.ZZXFX) throw new Error("ZZXFX unavailable");
      await ensureInvoice(core || W.ZZXWidgetsCore || null);

      const catalog = await W.ZZXFX.catalog();
      const select = q(root, "[data-bill-currency]");
      select.replaceChildren();

      for (const code of catalog.order.filter(code => code !== "BTC")) {
        const option = D.createElement("option");
        option.value = code;
        option.textContent = `${code} · ${catalog.names[code] || code}`;
        select.appendChild(option);
      }

      const saved = safeGet();
      select.value = catalog.order.includes(saved) && saved !== "BTC" ? saved : "USD";

      select.addEventListener("change", () => {
        safeSet(select.value);
        calculate(root, state);
      });

      let timer = null;
      const schedule = () => {
        if (timer) W.clearTimeout(timer);
        timer = W.setTimeout(() => calculate(root, state), 150);
      };

      q(root, "[data-bill-amount]")?.addEventListener("input", schedule);
      q(root, "[data-bill-memo]")?.addEventListener("input", schedule);

      q(root, "[data-bill-refresh]")?.addEventListener("click", async () => {
        try { await W.ZZXFX.load(true); } catch (_) {}
        calculate(root, state);
      });

      q(root, "[data-bill-copy]")?.addEventListener("click", async () => {
        if (!state.invoice) return;
        try {
          await copyText(W.ZZXBitBillingInvoice.summary(state.invoice));
          status(root, "copied", "ok");
          W.setTimeout(() => status(root, "live", "ok"), 1200);
        } catch (error) {
          q(root, "[data-bill-meta]").textContent = `copy failed: ${error?.message || error}`;
        }
      });

      await calculate(root, state);
    } catch (error) {
      status(root, "offline", "error");
      q(root, "[data-bill-meta]").textContent = String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID, boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID, boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID, boot);
})();
