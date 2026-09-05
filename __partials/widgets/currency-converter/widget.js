// __partials/widgets/currency-converter/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "currency-converter";

  const STORE = Object.freeze({
    from: "zzx.widget.currency-converter.from",
    to: "zzx.widget.currency-converter.to"
  });

  function q(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function safeGet(key) {
    try { return W.localStorage.getItem(key); }
    catch (_) { return null; }
  }

  function safeSet(key, value) {
    try { W.localStorage.setItem(key, value); }
    catch (_) {}
  }

  function status(root, label, state) {
    const el = q(root, "[data-cc-status]");
    if (!el) return;
    el.textContent = label;
    el.setAttribute("data-status", state || "offline");
  }

  function digitsFor(code, value) {
    if (code === "BTC") return 8;
    const n = Math.abs(finite(value));
    if (n && n < .01) return 8;
    if (n >= 1_000_000) return 2;
    return 4;
  }

  function numberText(value, code) {
    const n = finite(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, {
      maximumFractionDigits: digitsFor(code, n)
    });
  }

  function display(value, code, catalog) {
    const symbol = catalog?.symbols?.[code] || "";
    return `${symbol}${numberText(value, code)} ${code}`.trim();
  }

  function fillSelect(select, catalog) {
    if (!select) return;
    select.replaceChildren();

    for (const code of catalog.order) {
      const option = D.createElement("option");
      option.value = code;
      option.textContent = `${code} · ${catalog.names[code] || code}`;
      select.appendChild(option);
    }
  }

  function debounce(state, fn, delay) {
    if (state.debounceTimer) W.clearTimeout(state.debounceTimer);
    state.debounceTimer = W.setTimeout(fn, delay);
  }

  async function convert(root, state) {
    if (!root?.isConnected || !W.ZZXFX) return;

    const amount = finite(q(root, "[data-cc-amount]")?.value);
    const from = q(root, "[data-cc-from]")?.value;
    const to = q(root, "[data-cc-to]")?.value;

    if (!Number.isFinite(amount) || amount < 0 || !from || !to) {
      q(root, "[data-cc-output]").textContent = "—";
      q(root, "[data-cc-rate]").textContent = "Enter a valid amount.";
      return;
    }

    const generation = ++state.generation;
    status(root, "converting", "warn");

    try {
      const [result, unitRate] = await Promise.all([
        W.ZZXFX.convert(amount, from, to),
        W.ZZXFX.convert(1, from, to)
      ]);

      if (generation !== state.generation || !root.isConnected) return;

      q(root, "[data-cc-output]").textContent =
        display(result.value, to, state.catalog);

      q(root, "[data-cc-rate]").textContent =
        `1 ${from} = ${numberText(unitRate.value, to)} ${to}`;

      const providers = [...new Set([...(result.providers || []), ...(unitRate.providers || [])])];
      q(root, "[data-cc-meta]").textContent =
        `${state.catalog.count} fiat currencies + BTC · ${providers.join(" + ") || "direct"}`;

      status(root, "live", "ok");
    } catch (error) {
      if (generation !== state.generation) return;
      q(root, "[data-cc-output]").textContent = "—";
      q(root, "[data-cc-rate]").textContent = String(error?.message || error);
      status(root, "error", "error");
    }
  }

  async function boot(root) {
    if (!root) return;

    if (!W.ZZXFX) {
      status(root, "offline", "error");
      q(root, "[data-cc-meta]").textContent = "ZZXFX unavailable";
      return;
    }

    const state = {
      catalog: null,
      generation: 0,
      debounceTimer: null
    };

    root.__zzxCurrencyConverterState = state;

    try {
      state.catalog = await W.ZZXFX.catalog();

      const from = q(root, "[data-cc-from]");
      const to = q(root, "[data-cc-to]");

      fillSelect(from, state.catalog);
      fillSelect(to, state.catalog);

      const savedFrom = safeGet(STORE.from);
      const savedTo = safeGet(STORE.to);

      from.value = state.catalog.order.includes(savedFrom) ? savedFrom : "BTC";
      to.value = state.catalog.order.includes(savedTo) ? savedTo : "USD";

      const amount = q(root, "[data-cc-amount]");
      amount?.addEventListener("input", () =>
        debounce(state, () => convert(root, state), 120)
      );

      from?.addEventListener("change", () => {
        safeSet(STORE.from, from.value);
        convert(root, state);
      });

      to?.addEventListener("change", () => {
        safeSet(STORE.to, to.value);
        convert(root, state);
      });

      q(root, "[data-cc-swap]")?.addEventListener("click", () => {
        const a = from.value;
        from.value = to.value;
        to.value = a;
        safeSet(STORE.from, from.value);
        safeSet(STORE.to, to.value);
        convert(root, state);
      });

      q(root, "[data-cc-refresh]")?.addEventListener("click", async () => {
        status(root, "refreshing", "warn");
        try { await W.ZZXFX.load(true); } catch (_) {}
        convert(root, state);
      });

      await convert(root, state);
    } catch (error) {
      status(root, "offline", "error");
      q(root, "[data-cc-meta]").textContent = String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID, boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID, boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID, boot);
})();
