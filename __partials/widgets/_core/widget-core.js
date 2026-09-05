// __partials/widgets/_core/widget-core.js
// ZZX Widgets Core
// MANIFEST-DRIVEN + ADDITIVE + RETRY-SAFE + PROVIDER-AWARE
//
// RESPONSIBILITIES:
// - manifest.json is the authoritative widget registry
// - mount widget HTML/CSS/JS into existing HUD slots
// - support BOTH historical slot conventions
// - preserve legacy ZZXWidgets.register() widgets
// - load shared ZZX data/provider layers before widgets
// - expose a complete widget context
// - survive HUD reinjection
// - recover from failed HTML/CSS/JS loads
//
// IMPORTANT:
// - Does NOT remove widgets.
// - Does NOT rename widgets.
// - Does NOT replace clock-drift with tip-drift.
// - Does NOT load runtime.js.
// - Does NOT directly depend on Coinbase.
// - Existing runtime widget assets win if present.
// - Built-in runtime controls are fallback-only.
// - Local ZZX BPI is the compatibility price endpoint.

(() => {
  "use strict";

  const W = window;
  const D = document;

  if (
    W.ZZXWidgetsCore &&
    W.ZZXWidgetsCore.__zzx_core_installed
  ) {
    try {
      W.ZZXWidgetsCore.boot?.();
    } catch (_) {}

    return;
  }


  // ===========================================================================
  // PREFIX
  // ===========================================================================

  function getPrefix() {
    let p = "";

    if (
      W.ZZX &&
      typeof W.ZZX.PREFIX === "string"
    ) {
      p = W.ZZX.PREFIX.trim();
    }

    if (!p && D.documentElement) {
      const hp =
        D.documentElement.getAttribute(
          "data-zzx-prefix"
        );

      if (typeof hp === "string") {
        p = hp.trim();
      }
    }

    if (
      p === "." ||
      p === "./" ||
      p === "/"
    ) {
      p = "";
    }

    p = String(p || "")
      .replace(/\/+$/g, "");

    W.ZZX = Object.assign(
      {},
      W.ZZX || {},
      {
        PREFIX: p
      }
    );

    return p;
  }


  function url(pathOrURL) {
    const value =
      String(pathOrURL || "");

    if (!value) {
      return value;
    }

    if (
      /^https?:\/\//i.test(value)
    ) {
      return value;
    }

    if (
      !value.startsWith("/")
    ) {
      return value;
    }

    const prefix =
      getPrefix();

    return prefix
      ? prefix + value
      : value;
  }


  function widgetBase(id) {
    return (
      "/__partials/widgets/" +
      String(id || "")
    );
  }


  // ===========================================================================
  // VERSIONING
  // ===========================================================================

  function assetVersion() {
    const meta =
      D.querySelector(
        'meta[name="asset-version"]'
      );

    return meta
      ? String(
          meta.getAttribute("content") || ""
        ).trim()
      : "";
  }


  function versioned(pathOrURL) {
    const resolved =
      url(pathOrURL);

    const version =
      assetVersion();

    if (!version) {
      return resolved;
    }

    try {
      const u =
        new URL(
          resolved,
          location.href
        );

      if (
        !u.searchParams.has("v")
      ) {
        u.searchParams.set(
          "v",
          version
        );
      }

      return u.href;

    } catch (_) {
      return resolved;
    }
  }


  // ===========================================================================
  // FETCH
  // ===========================================================================

  async function fetchTextRaw(
    requestURL
  ) {
    const response =
      await fetch(
        requestURL,
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} for ${requestURL}`
      );
    }

    return await response.text();
  }


  async function fetchJSONRaw(
    requestURL
  ) {
    const response =
      await fetch(
        requestURL,
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} for ${requestURL}`
      );
    }

    return await response.json();
  }


  // ===========================================================================
  // DOM HELPERS
  // ===========================================================================

  function qs(
    selector,
    scope
  ) {
    return (
      scope ||
      D
    ).querySelector(selector);
  }


  function qsa(
    selector,
    scope
  ) {
    return Array.from(
      (
        scope ||
        D
      ).querySelectorAll(
        selector
      )
    );
  }


  function attrSelectorValue(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }


  // ===========================================================================
  // SLOT DISCOVERY
  // ===========================================================================

  function slotEl(widgetId) {
    const id =
      String(widgetId || "")
        .trim();

    if (!id) {
      return null;
    }

    const escaped =
      attrSelectorValue(id);

    return (
      D.querySelector(
        `[data-widget-slot="${escaped}"]`
      ) ||

      D.querySelector(
        `.btc-slot[data-widget="${escaped}"]`
      ) ||

      D.querySelector(
        `.btc-slot[data-widget-id="${escaped}"]`
      ) ||

      null
    );
  }


  function allSlotIds() {
    const ids = [];
    const seen = new Set();

    const add = value => {
      const id =
        String(value || "")
          .trim();

      if (
        !id ||
        seen.has(id)
      ) {
        return;
      }

      seen.add(id);
      ids.push(id);
    };

    qsa(
      "[data-widget-slot]"
    ).forEach(el => {
      add(
        el.getAttribute(
          "data-widget-slot"
        )
      );
    });

    qsa(
      ".btc-slot[data-widget]"
    ).forEach(el => {
      add(
        el.getAttribute(
          "data-widget"
        )
      );
    });

    qsa(
      ".btc-slot[data-widget-id]"
    ).forEach(el => {
      add(
        el.getAttribute(
          "data-widget-id"
        )
      );
    });

    return ids;
  }


  // ===========================================================================
  // WIDGET WRAPPER
  // ===========================================================================

  function sanitizeClassToken(value) {
    return String(value || "")
      .trim()
      .replace(
        /[^a-z0-9_-]/gi,
        "-"
      )
      .replace(
        /-+/g,
        "-"
      );
  }


  function ensureWidgetWrapper(
    slot,
    widgetId
  ) {
    const id =
      String(widgetId || "")
        .trim();

    if (
      !slot ||
      !id
    ) {
      return null;
    }

    /*
      Mirror all useful identity attributes.

      This is additive compatibility:
      old CSS and new CSS can coexist.
    */
    try {
      slot.setAttribute(
        "data-widget",
        id
      );

      slot.setAttribute(
        "data-widget-id",
        id
      );
    } catch (_) {}

    const escaped =
      attrSelectorValue(id);

    let wrapper =
      slot.querySelector(
        `[data-widget-root="${escaped}"]`
      ) ||

      slot.querySelector(
        `.zzx-widget[data-widget-id="${escaped}"]`
      );

    if (wrapper) {
      return wrapper;
    }

    wrapper =
      D.createElement("div");

    wrapper.className =
      `zzx-widget zzx-widget--${sanitizeClassToken(id)}`;

    wrapper.setAttribute(
      "data-widget-root",
      id
    );

    wrapper.setAttribute(
      "data-widget-id",
      id
    );

    /*
      Canonical core owns the contents of an actual widget slot.
      The legacy ticker loader has already been designed to yield
      if this canonical root exists.
    */
    slot.replaceChildren(
      wrapper
    );

    return wrapper;
  }


  function getWidgetRoot(
    widgetId
  ) {
    const slot =
      slotEl(widgetId);

    if (!slot) {
      return null;
    }

    const escaped =
      attrSelectorValue(widgetId);

    return (
      slot.querySelector(
        `[data-widget-root="${escaped}"]`
      ) ||

      slot.querySelector(
        `.zzx-widget[data-widget-id="${escaped}"]`
      ) ||

      slot
    );
  }


  // ===========================================================================
  // ASSET KEYS
  // ===========================================================================

  function keyify(value) {
    return String(value || "")
      .replace(
        /[^a-z0-9_-]/gi,
        "_"
      );
  }


  function absoluteURL(value) {
    try {
      return new URL(
        value,
        location.href
      ).href;
    } catch (_) {
      return String(value || "");
    }
  }


  // ===========================================================================
  // CSS LOADER
  // ===========================================================================

  function stylesheetReady(link) {
    if (!link) {
      return false;
    }

    if (
      link.dataset.zzxLoaded ===
      "1"
    ) {
      return true;
    }

    try {
      return Boolean(
        link.sheet
      );
    } catch (_) {
      return false;
    }
  }


  function ensureCSSOnce(
    key,
    href
  ) {
    const k =
      keyify(key);

    const source =
      absoluteURL(href);

    const selector =
      `link[data-zzx-css="${k}"]`;

    let existing =
      D.querySelector(
        selector
      );

    /*
      Asset-version changed or previous request failed.
    */
    if (
      existing &&
      (
        existing.dataset.zzxFailed ===
          "1" ||
        absoluteURL(existing.href) !==
          source
      )
    ) {
      try {
        existing.remove();
      } catch (_) {}

      existing = null;
    }

    if (existing) {
      if (
        stylesheetReady(
          existing
        )
      ) {
        existing.dataset.zzxLoaded =
          "1";

        return Promise.resolve(
          true
        );
      }

      return new Promise(resolve => {
        let settled = false;

        const finish = ok => {
          if (settled) {
            return;
          }

          settled = true;

          existing.dataset.zzxLoaded =
            ok
              ? "1"
              : "0";

          existing.dataset.zzxFailed =
            ok
              ? "0"
              : "1";

          resolve(
            Boolean(ok)
          );
        };

        existing.addEventListener(
          "load",
          () => finish(true),
          {
            once: true
          }
        );

        existing.addEventListener(
          "error",
          () => finish(false),
          {
            once: true
          }
        );

        W.setTimeout(
          () => {
            finish(
              stylesheetReady(
                existing
              )
            );
          },
          1200
        );
      });
    }

    return new Promise(resolve => {
      const link =
        D.createElement("link");

      let settled = false;

      const finish = ok => {
        if (settled) {
          return;
        }

        settled = true;

        link.dataset.zzxLoaded =
          ok
            ? "1"
            : "0";

        link.dataset.zzxFailed =
          ok
            ? "0"
            : "1";

        resolve(
          Boolean(ok)
        );
      };

      link.rel =
        "stylesheet";

      link.href =
        source;

      link.setAttribute(
        "data-zzx-css",
        k
      );

      link.addEventListener(
        "load",
        () => finish(true),
        {
          once: true
        }
      );

      link.addEventListener(
        "error",
        () => finish(false),
        {
          once: true
        }
      );

      (
        D.head ||
        D.documentElement
      ).appendChild(link);

      W.setTimeout(
        () => {
          finish(
            stylesheetReady(
              link
            )
          );
        },
        1200
      );
    });
  }


  // ===========================================================================
  // SCRIPT LOADER
  // ===========================================================================

  function ensureScriptOnce(
    key,
    src
  ) {
    const k =
      keyify(key);

    const source =
      absoluteURL(src);

    const selector =
      `script[data-zzx-js="${k}"]`;

    let existing =
      D.querySelector(
        selector
      );

    if (
      existing &&
      (
        existing.dataset.zzxFailed ===
          "1" ||
        absoluteURL(existing.src) !==
          source
      )
    ) {
      try {
        existing.remove();
      } catch (_) {}

      existing = null;
    }

    if (existing) {
      if (
        existing.dataset.zzxLoaded ===
        "1"
      ) {
        return Promise.resolve(
          true
        );
      }

      return new Promise(resolve => {
        let settled = false;

        const finish = ok => {
          if (settled) {
            return;
          }

          settled = true;

          existing.dataset.zzxLoaded =
            ok
              ? "1"
              : "0";

          existing.dataset.zzxFailed =
            ok
              ? "0"
              : "1";

          resolve(
            Boolean(ok)
          );
        };

        existing.addEventListener(
          "load",
          () => finish(true),
          {
            once: true
          }
        );

        existing.addEventListener(
          "error",
          () => finish(false),
          {
            once: true
          }
        );

        /*
          Compatibility with an element created by an earlier
          core revision that did not mark successful load.
        */
        W.setTimeout(
          () => {
            if (
              existing.dataset.zzxFailed !==
              "1"
            ) {
              finish(true);
            }
          },
          1000
        );
      });
    }

    return new Promise(resolve => {
      const script =
        D.createElement("script");

      script.src =
        source;

      script.defer =
        true;

      script.setAttribute(
        "data-zzx-js",
        k
      );

      script.addEventListener(
        "load",
        () => {
          script.dataset.zzxLoaded =
            "1";

          script.dataset.zzxFailed =
            "0";

          resolve(true);
        },
        {
          once: true
        }
      );

      script.addEventListener(
        "error",
        () => {
          script.dataset.zzxLoaded =
            "0";

          script.dataset.zzxFailed =
            "1";

          resolve(false);
        },
        {
          once: true
        }
      );

      (
        D.head ||
        D.documentElement
      ).appendChild(script);
    });
  }


  // ===========================================================================
  // MOUNT HOOKS
  // ===========================================================================

  const mountHooks = [];


  function onMount(
    idOrFunction,
    maybeFunction
  ) {
    if (
      typeof idOrFunction ===
      "function"
    ) {
      mountHooks.push({
        id: null,
        fn: idOrFunction
      });

      return;
    }

    if (
      typeof idOrFunction ===
        "string" &&
      typeof maybeFunction ===
        "function"
    ) {
      mountHooks.push({
        id: idOrFunction,
        fn: maybeFunction
      });
    }
  }


  function fireMount(
    widgetId,
    root
  ) {
    for (
      const hook
      of mountHooks
    ) {
      if (
        hook.id &&
        hook.id !== widgetId
      ) {
        continue;
      }

      try {
        const result =
          hook.fn(
            root,
            W.ZZXWidgetsCore
          );

        if (
          result &&
          typeof result.catch ===
            "function"
        ) {
          result.catch(error => {
            console.warn(
              `[HUD] onMount async failure for ${widgetId}`,
              error
            );
          });
        }

      } catch (error) {
        console.warn(
          `[HUD] onMount hook error for ${widgetId}`,
          error
        );
      }
    }
  }


  // ===========================================================================
  // CONTEXT
  // ===========================================================================

  const DEFAULT_API = {
    /*
      Canonical local ZZX price contract.
    */
    ZZX_BPI_LATEST:
      "/bitcoin/bpi/api/latest.json",

    /*
      Backward-compatible PROPERTY NAME ONLY.

      Existing old widget code may still ask for
      ctx.api.COINBASE_SPOT.

      The URL no longer points to Coinbase.
    */
    COINBASE_SPOT:
      "/bitcoin/bpi/api/latest.json",

    /*
      Official public mempool.space API.
    */
    MEMPOOL:
      "https://mempool.space/api",

    MEMPOOL_API:
      "https://mempool.space/api",

    /*
      ZZX-local Bitnodes datasets.
    */
    ZZX_BITNODES_LATEST:
      "/bitcoin/bitnodes/api/zzxbitnodes/latest.json",

    ZZX_BITNODES_AGGREGATE:
      "/bitcoin/bitnodes/api/aggregate/zzxbitnodes/latest.json"
  };


  const ctx = {
    urlFor:
      value => url(value),

    url:
      value => url(value),

    fetchJSON:
      async value =>
        fetchJSONRaw(
          url(value)
        ),

    fetchText:
      async value =>
        fetchTextRaw(
          url(value)
        ),

    api: {}
  };


  function refreshContext() {
    ctx.api =
      Object.assign(
        {},
        DEFAULT_API,
        W.ZZX?.api ||
          W.ZZX?.API ||
          {}
      );

    ctx.providers = {
      api:
        W.ZZXAPI ||
        null,

      fx:
        W.ZZXFX ||
        null,

      bitnodes:
        W.ZZXBitnodesData ||
        null,

      chain:
        W.ZZXChain ||
        null,

      population:
        W.ZZXPopulation ||
        null
    };

    return ctx;
  }

  refreshContext();


  // ===========================================================================
  // LEGACY REGISTRY
  // ===========================================================================

  const legacyDefs =
    new Map();


  function legacyRegister(
    id,
    definition
  ) {
    const widgetId =
      String(id || "")
        .trim();

    if (!widgetId) {
      return false;
    }

    legacyDefs.set(
      widgetId,
      definition
    );

    return true;
  }


  function clearLegacyBoot(
    root
  ) {
    if (!root) {
      return;
    }

    try {
      root.dataset.zzxLegacyBoot =
        "0";

      root.dataset.zzxLegacyBooting =
        "0";

    } catch (_) {}
  }


  function watchAsyncResult(
    result,
    widgetId,
    root
  ) {
    if (
      result &&
      typeof result.then ===
        "function"
    ) {
      result.catch(error => {
        clearLegacyBoot(
          root
        );

        console.warn(
          `[HUD] async widget failure for ${widgetId}`,
          error
        );
      });
    }
  }


  function legacyBootOne(id) {
    const widgetId =
      String(id || "")
        .trim();

    const definition =
      legacyDefs.get(
        widgetId
      );

    if (!definition) {
      return false;
    }

    const root =
      getWidgetRoot(
        widgetId
      );

    if (!root) {
      return false;
    }

    if (
      root.dataset.zzxLegacyBoot ===
      "1"
    ) {
      return true;
    }

    if (
      root.dataset.zzxLegacyBooting ===
      "1"
    ) {
      return true;
    }

    root.dataset.zzxLegacyBooting =
      "1";

    try {
      /*
        Function-style:
          register(id, fn)
      */
      if (
        typeof definition ===
        "function"
      ) {
        const result =
          definition(
            root,
            W.ZZXWidgetsCore
          );

        root.dataset.zzxLegacyBoot =
          "1";

        root.dataset.zzxLegacyBooting =
          "0";

        watchAsyncResult(
          result,
          widgetId,
          root
        );

        return true;
      }


      /*
        Object-style:
          {
            mount(root, core),
            start(ctx, core),
            stop(...)
          }
      */
      if (
        definition &&
        typeof definition.mount ===
          "function"
      ) {
        const result =
          definition.mount(
            root,
            W.ZZXWidgetsCore
          );

        watchAsyncResult(
          result,
          widgetId,
          root
        );
      }

      if (
        definition &&
        typeof definition.start ===
          "function"
      ) {
        const result =
          definition.start(
            ctx,
            W.ZZXWidgetsCore
          );

        watchAsyncResult(
          result,
          widgetId,
          root
        );

      } else if (
        definition &&
        typeof definition.boot ===
          "function"
      ) {
        const result =
          definition.boot(
            root,
            W.ZZXWidgetsCore
          );

        watchAsyncResult(
          result,
          widgetId,
          root
        );

      } else if (
        definition &&
        typeof definition.init ===
          "function"
      ) {
        const result =
          definition.init(
            root,
            W.ZZXWidgetsCore
          );

        watchAsyncResult(
          result,
          widgetId,
          root
        );
      }

      root.dataset.zzxLegacyBoot =
        "1";

      root.dataset.zzxLegacyBooting =
        "0";

      return true;

    } catch (error) {
      clearLegacyBoot(
        root
      );

      console.warn(
        `[HUD] legacy widget boot failed for ${widgetId}`,
        error
      );

      return false;
    }
  }


  function legacyStartAll() {
    for (
      const id
      of legacyDefs.keys()
    ) {
      legacyBootOne(id);
    }

    return true;
  }


  // ===========================================================================
  // REGISTRY ALIASES
  // ===========================================================================

  W.ZZXWidgets =
    W.ZZXWidgets || {};

  if (
    typeof W.ZZXWidgets.register !==
    "function"
  ) {
    W.ZZXWidgets.register =
      legacyRegister;
  }

  if (
    typeof W.ZZXWidgets.start !==
    "function"
  ) {
    W.ZZXWidgets.start =
      legacyStartAll;
  }


  W.ZZXWidgetRegistry =
    W.ZZXWidgetRegistry || {};

  if (
    typeof W.ZZXWidgetRegistry.register !==
    "function"
  ) {
    W.ZZXWidgetRegistry.register =
      legacyRegister;
  }

  if (
    typeof W.ZZXWidgetRegistry.start !==
    "function"
  ) {
    W.ZZXWidgetRegistry.start =
      legacyStartAll;
  }


  W.__ZZX_WIDGETS =
    W.__ZZX_WIDGETS || {};

  if (
    typeof W.__ZZX_WIDGETS.register !==
    "function"
  ) {
    W.__ZZX_WIDGETS.register =
      legacyRegister;
  }

  if (
    typeof W.__ZZX_WIDGETS.start !==
    "function"
  ) {
    W.__ZZX_WIDGETS.start =
      legacyStartAll;
  }


  // ===========================================================================
  // SHARED PROVIDERS
  // ===========================================================================

  const SHARED_SCRIPTS = [
    {
      key: "zzx-shared-api",
      path:
        "/__partials/widgets/_shared/zzx-api.js"
    },

    {
      key: "zzx-shared-fx",
      path:
        "/__partials/widgets/_shared/zzx-fx.js"
    },

    {
      key: "zzx-shared-bitnodes",
      path:
        "/__partials/widgets/_shared/zzx-bitnodes.js"
    },

    {
      key: "zzx-shared-chain",
      path:
        "/__partials/widgets/_shared/zzx-chain.js"
    },

    {
      key: "zzx-shared-population",
      path:
        "/__partials/widgets/_shared/zzx-population.js"
    }
  ];


  async function ensureSharedProviders() {
    const results = {};

    for (
      const asset
      of SHARED_SCRIPTS
    ) {
      let ok = false;

      try {
        ok =
          await ensureScriptOnce(
            asset.key,
            versioned(
              asset.path
            )
          );
      } catch (_) {
        ok = false;
      }

      results[asset.key] =
        ok;

      if (!ok) {
        console.warn(
          `[HUD] shared provider failed: ${asset.path}`
        );
      }
    }

    refreshContext();

    return results;
  }


  // ===========================================================================
  // MANIFEST
  // ===========================================================================

  function manifestURL() {
    /*
      ticker-loader may publish an explicit canonical URL.
    */
    const published =
      W.__ZZX_WIDGETS_MANIFEST_URL;

    if (
      published &&
      typeof published ===
        "string"
    ) {
      return versioned(
        published
      );
    }

    return versioned(
      "/__partials/widgets/manifest.json"
    );
  }


  function widgetURLs(id) {
    const base =
      widgetBase(id);

    return {
      html:
        versioned(
          `${base}/widget.html`
        ),

      css:
        versioned(
          `${base}/widget.css`
        ),

      js:
        versioned(
          `${base}/widget.js`
        )
    };
  }


  // ===========================================================================
  // ESCAPE / ERROR UI
  // ===========================================================================

  function escapeHTML(value) {
    return String(
      value ?? ""
    )
      .replaceAll(
        "&",
        "&amp;"
      )
      .replaceAll(
        "<",
        "&lt;"
      )
      .replaceAll(
        ">",
        "&gt;"
      )
      .replaceAll(
        '"',
        "&quot;"
      )
      .replaceAll(
        "'",
        "&#039;"
      );
  }


  function renderSlotError(
    wrapper,
    id,
    message
  ) {
    if (!wrapper) {
      return;
    }

    wrapper.innerHTML = `
      <div class="btc-card">
        <div class="btc-card__title">${escapeHTML(id)}</div>
        <div class="btc-card__sub btc-card__error">${escapeHTML(
          message ||
          "load failed"
        )}</div>
      </div>
    `;
  }


  // ===========================================================================
  // BUILT-IN RUNTIME FALLBACK
  // ===========================================================================

  function mountRuntimeBuiltIn(
    wrapper
  ) {
    if (!wrapper) {
      return;
    }

    wrapper.dataset.zzxRuntimeBuiltIn =
      "1";

    wrapper.innerHTML = `
      <div class="btc-card">
        <div class="btc-card__title">HUD</div>

        <div
          class="btc-card__actions"
          style="display:flex;flex-wrap:wrap;gap:.45rem;justify-content:center;align-items:center"
        >
          <button
            type="button"
            class="zzx-widgets__btn"
            data-hud-mode="full"
            data-zzx-hud="full"
          >Full</button>

          <button
            type="button"
            class="zzx-widgets__btn"
            data-hud-mode="ticker-only"
            data-zzx-hud="ticker-only"
          >Ticker</button>

          <button
            type="button"
            class="zzx-widgets__btn"
            data-hud-mode="hidden"
            data-zzx-hud="hidden"
          >Hide</button>

          <button
            type="button"
            class="zzx-widgets__btn"
            data-hud-reset="1"
            data-zzx-hud="reset"
          >Reset</button>
        </div>
      </div>
    `;

    /*
      Explicit handlers preserve compatibility with the
      older hud-state implementation.

      New hud-state.js can also use delegated data-hud-*.
    */
    const bind = (
      selector,
      fn
    ) => {
      const button =
        wrapper.querySelector(
          selector
        );

      if (
        !button ||
        button.dataset.zzxBound ===
          "1"
      ) {
        return;
      }

      button.dataset.zzxBound =
        "1";

      button.addEventListener(
        "click",
        fn
      );
    };

    bind(
      '[data-zzx-hud="full"]',
      () =>
        W.ZZXHUD?.write?.(
          "full"
        )
    );

    bind(
      '[data-zzx-hud="ticker-only"]',
      () =>
        W.ZZXHUD?.write?.(
          "ticker-only"
        )
    );

    bind(
      '[data-zzx-hud="hidden"]',
      () =>
        W.ZZXHUD?.write?.(
          "hidden"
        )
    );

    bind(
      '[data-zzx-hud="reset"]',
      () =>
        W.ZZXHUD?.reset?.()
    );
  }


  // ===========================================================================
  // RETRY
  // ===========================================================================

  function scheduleWidgetRetry(
    wrapper
  ) {
    if (!wrapper) {
      return;
    }

    const attempts =
      Math.min(
        Number(
          wrapper.dataset.zzxRetryAttempts ||
          0
        ) + 1,
        6
      );

    wrapper.dataset.zzxRetryAttempts =
      String(attempts);

    const delay =
      Math.min(
        30000,
        1000 *
          Math.pow(
            2,
            attempts - 1
          )
      );

    if (
      wrapper.__zzxRetryTimer
    ) {
      return;
    }

    wrapper.__zzxRetryTimer =
      W.setTimeout(
        () => {
          wrapper.__zzxRetryTimer =
            null;

          if (
            !wrapper.isConnected ||
            wrapper.dataset.zzxMounted ===
              "1"
          ) {
            return;
          }

          scheduleBoot();
        },
        delay
      );
  }


  function clearWidgetRetry(
    wrapper
  ) {
    if (!wrapper) {
      return;
    }

    wrapper.dataset.zzxRetryAttempts =
      "0";

    if (
      wrapper.__zzxRetryTimer
    ) {
      W.clearTimeout(
        wrapper.__zzxRetryTimer
      );

      wrapper.__zzxRetryTimer =
        null;
    }
  }


  // ===========================================================================
  // MOUNT ONE WIDGET
  // ===========================================================================

  async function mountWidget(id) {
    const widgetId =
      String(id || "")
        .trim();

    if (!widgetId) {
      return false;
    }

    const slot =
      slotEl(widgetId);

    if (!slot) {
      return false;
    }

    const wrapper =
      ensureWidgetWrapper(
        slot,
        widgetId
      );

    if (!wrapper) {
      return false;
    }

    /*
      Properly mounted current wrapper.
    */
    if (
      wrapper.dataset.zzxMounted ===
        "1" &&
      wrapper.childNodes.length
    ) {
      return true;
    }

    if (
      wrapper.dataset.zzxMounting ===
      "1"
    ) {
      return true;
    }

    wrapper.dataset.zzxMounting =
      "1";

    wrapper.dataset.zzxMountFailed =
      "0";

    const {
      html,
      css,
      js
    } = widgetURLs(
      widgetId
    );

    try {
      // -----------------------------------------------------------------------
      // HTML
      // -----------------------------------------------------------------------

      let markup;

      try {
        markup =
          await fetchTextRaw(
            html
          );

      } catch (error) {
        /*
          Runtime is preserved as a real widget if its assets exist.

          Built-in controls are ONLY a fallback if the runtime
          widget HTML itself does not exist.
        */
        if (
          widgetId ===
          "runtime"
        ) {
          mountRuntimeBuiltIn(
            wrapper
          );

          wrapper.dataset.zzxMounted =
            "1";

          wrapper.dataset.zzxMountFailed =
            "0";

          slot.dataset.mountReady =
            "1";

          clearWidgetRetry(
            wrapper
          );

          try {
            W.ZZXHUD?.apply?.(
              W.ZZXHUD?.read?.().mode ||
              "full"
            );
          } catch (_) {}

          return true;
        }

        throw error;
      }

      /*
        Real widget assets exist.
        They always win over built-in compatibility fallback.
      */
      wrapper.removeAttribute(
        "data-zzx-runtime-built-in"
      );

      wrapper.innerHTML =
        markup;

      slot.setAttribute(
        "data-widget-id",
        widgetId
      );

      slot.dataset.mountReady =
        "1";


      // -----------------------------------------------------------------------
      // CSS
      // -----------------------------------------------------------------------

      let cssOK = false;

      try {
        cssOK =
          await ensureCSSOnce(
            `wcss:${widgetId}`,
            css
          );

      } catch (error) {
        console.warn(
          `[HUD] ${widgetId} CSS inject failed`,
          error
        );
      }

      slot.dataset.widgetCss =
        cssOK
          ? "1"
          : "0";


      // -----------------------------------------------------------------------
      // JS
      // -----------------------------------------------------------------------

      const jsOK =
        await ensureScriptOnce(
          `wjs:${widgetId}`,
          js
        );

      slot.dataset.widgetJs =
        jsOK
          ? "1"
          : "0";

      if (!jsOK) {
        throw new Error(
          `JavaScript load failed: ${js}`
        );
      }


      // -----------------------------------------------------------------------
      // HOOK REGISTRY
      // -----------------------------------------------------------------------

      try {
        fireMount(
          widgetId,
          getWidgetRoot(
            widgetId
          )
        );
      } catch (_) {}


      // -----------------------------------------------------------------------
      // LEGACY REGISTRY
      // -----------------------------------------------------------------------

      try {
        legacyBootOne(
          widgetId
        );
      } catch (_) {}


      // -----------------------------------------------------------------------
      // SUCCESS
      // -----------------------------------------------------------------------

      wrapper.dataset.zzxMounted =
        "1";

      wrapper.dataset.zzxMountFailed =
        "0";

      wrapper.dataset.zzxMounting =
        "0";

      slot.dataset.mountReady =
        "1";

      clearWidgetRetry(
        wrapper
      );

      return true;

    } catch (error) {
      wrapper.dataset.zzxMounted =
        "0";

      wrapper.dataset.zzxMountFailed =
        "1";

      slot.dataset.mountReady =
        "0";

      /*
        Do not permanently poison the widget.
      */
      console.warn(
        `[HUD] ${widgetId} mount failed`,
        error
      );

      /*
        If HTML never rendered, show a useful local error card.
        If markup exists but JS failed, preserve the markup.
      */
      if (
        !wrapper.childNodes.length ||
        !slot.dataset.widgetJs
      ) {
        renderSlotError(
          wrapper,
          widgetId,
          error?.message ||
            "load failed"
        );
      }

      scheduleWidgetRetry(
        wrapper
      );

      return false;

    } finally {
      wrapper.dataset.zzxMounting =
        "0";
    }
  }


  // ===========================================================================
  // MANIFEST MOUNT
  // ===========================================================================

  async function mountAllFromManifest(
    manifest
  ) {
    const widgets =
      Array.isArray(
        manifest?.widgets
      )
        ? manifest.widgets
        : [];

    /*
      Keep manifest order stable for equal priorities.
    */
    const list =
      widgets
        .map(
          (
            widget,
            index
          ) => ({
            widget,
            index
          })
        )
        .filter(
          item =>
            item.widget &&
            item.widget.id
        )
        .sort(
          (a, b) => {
            const pa =
              a.widget.priority ??
              9999;

            const pb =
              b.widget.priority ??
              9999;

            return (
              pa - pb ||
              a.index - b.index
            );
          }
        );

    const seen =
      new Set();

    let enabled = 0;
    let disabled = 0;
    let mounted = 0;

    for (
      const item
      of list
    ) {
      const widget =
        item.widget;

      const id =
        String(
          widget.id
        ).trim();

      if (!id) {
        continue;
      }

      if (
        seen.has(id)
      ) {
        console.warn(
          `[HUD] duplicate manifest widget id: ${id}`
        );

        continue;
      }

      seen.add(id);

      const slot =
        slotEl(id);

      if (!slot) {
        console.warn(
          `[HUD] manifest widget has no slot: ${id}`
        );

        continue;
      }

      if (
        widget.enabled ===
        false
      ) {
        disabled++;

        slot.style.display =
          "none";

        slot.dataset.widgetEnabled =
          "0";

        continue;
      }

      enabled++;

      slot.style.display =
        "";

      slot.dataset.widgetEnabled =
        "1";

      if (
        await mountWidget(id)
      ) {
        mounted++;
      }
    }

    return {
      total:
        seen.size,

      enabled,
      disabled,
      mounted
    };
  }


  // ===========================================================================
  // WAIT FOR SHELL
  // ===========================================================================

  async function waitForHudShell(
    timeoutMs = 8000
  ) {
    const started =
      performance.now();

    return await new Promise(resolve => {
      (function poll() {
        const anySlot =
          D.querySelector(
            "[data-widget-slot]"
          ) ||

          D.querySelector(
            ".btc-slot[data-widget]"
          ) ||

          D.querySelector(
            ".btc-slot[data-widget-id]"
          );

        if (anySlot) {
          resolve(true);
          return;
        }

        if (
          performance.now() -
            started >=
          timeoutMs
        ) {
          resolve(false);
          return;
        }

        W.requestAnimationFrame(
          poll
        );
      })();
    });
  }


  // ===========================================================================
  // REGISTRY START
  // ===========================================================================

  function startRegistries() {
    const candidates = [
      W.__ZZX_WIDGETS?.start,
      W.ZZXWidgets?.start,
      W.ZZXWidgetRegistry?.start
    ];

    const seen =
      new Set();

    for (
      const starter
      of candidates
    ) {
      if (
        typeof starter !==
          "function" ||
        seen.has(starter)
      ) {
        continue;
      }

      seen.add(starter);

      try {
        starter();
      } catch (error) {
        console.warn(
          "[HUD] registry start failed",
          error
        );
      }
    }
  }


  // ===========================================================================
  // HUD STATE RECONCILIATION
  // ===========================================================================

  function reconcileHUDState() {
    try {
      const mode =
        W.ZZXHUD?.read?.().mode ||
        "full";

      if (
        typeof W.ZZXHUD?.apply ===
        "function"
      ) {
        W.ZZXHUD.apply(
          mode
        );

      } else if (
        typeof W.ZZXHUD?.write ===
        "function"
      ) {
        W.ZZXHUD.write(
          mode
        );
      }

    } catch (_) {}
  }


  // ===========================================================================
  // BOOT
  // ===========================================================================

  let booting = false;
  let bootAgain = false;
  let bootTimer = null;


  function scheduleBoot(
    delay = 0
  ) {
    if (bootTimer !== null) {
      return;
    }

    bootTimer =
      W.setTimeout(
        () => {
          bootTimer =
            null;

          boot();
        },
        delay
      );
  }


  async function boot() {
    if (booting) {
      bootAgain = true;
      return;
    }

    booting = true;

    try {
      getPrefix();
      refreshContext();

      // -----------------------------------------------------------------------
      // SHARED CSS
      // -----------------------------------------------------------------------

      const wrapperCSS =
        await ensureCSSOnce(
          "btc-wrapper",
          versioned(
            "/__partials/bitcoin-ticker-widget.css"
          )
        );

      if (!wrapperCSS) {
        console.warn(
          "[HUD] wrapper CSS failed"
        );
      }

      const coreCSS =
        await ensureCSSOnce(
          "zzx-core-css",
          versioned(
            "/__partials/widgets/_core/widget-core.css"
          )
        );

      if (!coreCSS) {
        console.warn(
          "[HUD] core CSS failed"
        );
      }


      // -----------------------------------------------------------------------
      // SHARED PROVIDERS
      // -----------------------------------------------------------------------

      await ensureSharedProviders();


      // -----------------------------------------------------------------------
      // HUD SHELL
      // -----------------------------------------------------------------------

      const shell =
        await waitForHudShell();

      if (!shell) {
        console.warn(
          "[HUD] no widget slots found"
        );

        return;
      }


      // -----------------------------------------------------------------------
      // MANIFEST
      // -----------------------------------------------------------------------

      let manifest;

      try {
        manifest =
          await fetchJSONRaw(
            manifestURL()
          );

      } catch (error) {
        console.warn(
          "[HUD] manifest.json failed; using slot fallback",
          error
        );

        const fallback =
          allSlotIds();

        manifest = {
          version:
            1,

          defaultMode:
            "full",

          widgets:
            fallback.map(
              (
                id,
                index
              ) => ({
                id,
                enabled:
                  true,

                priority:
                  10000 +
                  index
              })
            )
        };
      }


      // -----------------------------------------------------------------------
      // MOUNT
      // -----------------------------------------------------------------------

      const result =
        await mountAllFromManifest(
          manifest
        );


      // -----------------------------------------------------------------------
      // START LEGACY REGISTRIES
      // -----------------------------------------------------------------------

      startRegistries();


      // -----------------------------------------------------------------------
      // HUD MODE
      // -----------------------------------------------------------------------

      reconcileHUDState();


      // -----------------------------------------------------------------------
      // DEBUG SURFACE
      // -----------------------------------------------------------------------

      W.ZZXWidgetsCore.lastManifest =
        manifest;

      W.ZZXWidgetsCore.lastResults =
        result;


      // -----------------------------------------------------------------------
      // READY EVENT
      // -----------------------------------------------------------------------

      try {
        W.dispatchEvent(
          new CustomEvent(
            "zzx:widgets:ready",
            {
              detail:
                result
            }
          )
        );
      } catch (_) {}

    } catch (error) {
      console.error(
        "[HUD] widget-core fatal",
        error
      );

    } finally {
      booting = false;

      if (bootAgain) {
        bootAgain = false;

        scheduleBoot(0);
      }
    }
  }


  // ===========================================================================
  // REINJECTION OBSERVER
  // ===========================================================================

  function nodeHasSlot(node) {
    if (
      !node ||
      node.nodeType !== 1
    ) {
      return false;
    }

    try {
      if (
        node.matches?.(
          "[data-widget-slot], .btc-slot[data-widget], .btc-slot[data-widget-id]"
        )
      ) {
        return true;
      }

      if (
        node.querySelector?.(
          "[data-widget-slot], .btc-slot[data-widget], .btc-slot[data-widget-id]"
        )
      ) {
        return true;
      }

    } catch (_) {}

    return false;
  }


  function observeHudSlots() {
    if (
      D.__zzxWidgetCoreObserver
    ) {
      return;
    }

    try {
      const observer =
        new MutationObserver(
          mutations => {
            for (
              const mutation
              of mutations
            ) {
              if (
                mutation.type !==
                "childList"
              ) {
                continue;
              }

              /*
                Entire HUD/slot inserted or replaced.
              */
              if (
                Array.from(
                  mutation.addedNodes ||
                  []
                ).some(
                  nodeHasSlot
                )
              ) {
                scheduleBoot(0);
                return;
              }

              /*
                Existing slot had its widget root removed.
              */
              const target =
                mutation.target;

              if (
                target &&
                target.nodeType === 1 &&
                target.matches?.(
                  ".btc-slot[data-widget], [data-widget-slot]"
                )
              ) {
                const id =
                  target.getAttribute(
                    "data-widget"
                  ) ||
                  target.getAttribute(
                    "data-widget-slot"
                  );

                if (
                  id &&
                  !target.querySelector(
                    "[data-widget-root]"
                  )
                ) {
                  scheduleBoot(0);
                  return;
                }
              }
            }
          }
        );

      observer.observe(
        D.documentElement,
        {
          childList:
            true,

          subtree:
            true
        }
      );

      D.__zzxWidgetCoreObserver =
        observer;

    } catch (_) {}
  }


  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  W.ZZXWidgetsCore = {
    __zzx_ok:
      true,

    __zzx_core_installed:
      true,

    __zzx_core_mounting:
      true,

    __version:
      "core-manifest-mounter-1.1.0",

    getPrefix,
    url,
    versioned,
    widgetBase,
    manifestURL,

    ctx,

    fetchText:
      value =>
        fetchTextRaw(
          url(value)
        ),

    fetchJSON:
      value =>
        fetchJSONRaw(
          url(value)
        ),

    qs,
    qsa,
    slotEl,
    getWidgetRoot,

    onMount,

    legacyRegister,
    legacyBootOne,
    legacyStartAll,

    ensureCSSOnce,
    ensureScriptOnce,
    ensureSharedProviders,

    mountWidget,
    mountAllFromManifest,

    boot,
    scheduleBoot,

    lastManifest:
      null,

    lastResults:
      null
  };


  // ===========================================================================
  // INITIALIZE
  // ===========================================================================

  if (
    D.readyState ===
    "loading"
  ) {
    D.addEventListener(
      "DOMContentLoaded",
      () => {
        observeHudSlots();
        boot();
      },
      {
        once: true
      }
    );

  } else {
    observeHudSlots();
    boot();
  }

})();
