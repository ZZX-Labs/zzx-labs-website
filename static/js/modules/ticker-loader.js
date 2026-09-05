// /static/js/modules/ticker-loader.js
// ZZX-Labs Bitcoin HUD / Widget Loader
// DROP-IN REPLACEMENT
//
// SINGLE ORCHESTRATOR:
//   fonts
//     -> wrapper/core CSS
//     -> wrapper HTML
//     -> HUD state
//     -> widget-core
//
// IMPORTANT:
// - No runtime.js direct load.
// - No individual widget IDs are hard-coded here.
// - manifest.json + widget-core remain authoritative.
// - Existing widgets are never removed/replaced by this loader.
// - Prefix-safe for root hosting, GitHub Pages, and deep paths.
// - Survives ticker-container replacement/reinjection.
// - Failed CSS/JS assets may be retried.
// - Existing wrapper HTML does NOT prevent core/HUD recovery.

(function () {
  "use strict";

  const W = window;
  const D = document;

  // Install controller once.
  // Remounting/recovery is handled internally.
  if (W.__ZZX_TICKER_LOADER_BOOTED) return;
  W.__ZZX_TICKER_LOADER_BOOTED = true;


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

    // Never permit pseudo-relative prefixes.
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


  function join(prefix, path) {
    if (!path) return path;

    const s = String(path);

    // Absolute external URL.
    if (/^https?:\/\//i.test(s)) {
      return s;
    }

    // Relative/local strings pass through.
    if (!s.startsWith("/")) {
      return s;
    }

    const p = String(prefix || "")
      .replace(/\/+$/g, "");

    if (
      !p ||
      p === "." ||
      p === "/"
    ) {
      return s;
    }

    return p + s;
  }


  function asset(path) {
    return join(
      getPrefix(),
      path
    );
  }


  // Normalize immediately if possible.
  getPrefix();


  // ===========================================================================
  // ASSET VERSION
  // ===========================================================================

  function assetVersion() {
    const el =
      D.querySelector(
        'meta[name="asset-version"]'
      );

    return el
      ? String(
          el.getAttribute("content") || ""
        ).trim()
      : "";
  }


  function withV(url) {
    const v = assetVersion();

    if (!v) return url;

    try {
      const u = new URL(
        url,
        location.href
      );

      if (!u.searchParams.has("v")) {
        u.searchParams.set("v", v);
      }

      return u.href;
    } catch (_) {
      return url;
    }
  }


  // ===========================================================================
  // CANONICAL ASSET URLS
  // ===========================================================================

  function wrapperHTML() {
    return asset(
      "/__partials/bitcoin-ticker-widget.html"
    );
  }

  function wrapperCSS() {
    return asset(
      "/__partials/bitcoin-ticker-widget.css"
    );
  }

  function hudStateJS() {
    return asset(
      "/__partials/widgets/hud-state.js"
    );
  }

  function coreCSS() {
    return asset(
      "/__partials/widgets/_core/widget-core.css"
    );
  }

  function coreJS() {
    return asset(
      "/__partials/widgets/_core/widget-core.js"
    );
  }

  function fontsJSON() {
    return asset(
      "/static/fonts/fonts.json"
    );
  }

  function manifestURL() {
    return asset(
      "/__partials/widgets/manifest.json"
    );
  }


  function publishManifestURL() {
    W.__ZZX_WIDGETS_MANIFEST_URL =
      manifestURL();
  }

  publishManifestURL();


  // ===========================================================================
  // ASSET KEYS
  // ===========================================================================

  function keyify(value) {
    try {
      return btoa(
        unescape(
          encodeURIComponent(
            String(value)
          )
        )
      ).replace(/=+$/g, "");
    } catch (_) {
      return String(value)
        .replace(
          /[^a-z0-9_-]/gi,
          "_"
        );
    }
  }


  // ===========================================================================
  // CSS LOADER
  // ===========================================================================

  function stylesheetReady(link) {
    if (!link) return false;

    if (link.dataset.zzxLoaded === "1") {
      return true;
    }

    try {
      if (link.sheet) {
        return true;
      }
    } catch (_) {
      // Access can theoretically throw.
      // Presence of sheet is sufficient when accessible.
    }

    return false;
  }


  function loadCSSOnce(href) {
    const h = withV(href);
    const key =
      "zzxcss:" + keyify(h);

    let existing =
      D.querySelector(
        `link[data-zzx-css="${key}"]`
      );

    if (
      existing &&
      existing.dataset.zzxFailed === "1"
    ) {
      try {
        existing.remove();
      } catch (_) {}

      existing = null;
    }

    if (existing) {
      if (stylesheetReady(existing)) {
        existing.dataset.zzxLoaded = "1";
        return Promise.resolve(true);
      }

      return new Promise((resolve) => {
        let settled = false;

        const finish = (ok) => {
          if (settled) return;
          settled = true;

          if (ok) {
            existing.dataset.zzxLoaded = "1";
            existing.dataset.zzxFailed = "0";
          } else {
            existing.dataset.zzxFailed = "1";
          }

          resolve(Boolean(ok));
        };

        existing.addEventListener(
          "load",
          () => finish(true),
          { once: true }
        );

        existing.addEventListener(
          "error",
          () => finish(false),
          { once: true }
        );

        // Cached stylesheets normally still emit load,
        // but verify sheet state as an additional fallback.
        W.setTimeout(() => {
          finish(
            stylesheetReady(existing)
          );
        }, 1200);
      });
    }

    return new Promise((resolve) => {
      const link =
        D.createElement("link");

      let settled = false;

      const finish = (ok) => {
        if (settled) return;
        settled = true;

        if (ok) {
          link.dataset.zzxLoaded = "1";
          link.dataset.zzxFailed = "0";
        } else {
          link.dataset.zzxFailed = "1";
        }

        resolve(Boolean(ok));
      };

      link.rel = "stylesheet";
      link.href = h;

      link.setAttribute(
        "data-zzx-css",
        key
      );

      link.addEventListener(
        "load",
        () => finish(true),
        { once: true }
      );

      link.addEventListener(
        "error",
        () => finish(false),
        { once: true }
      );

      (
        D.head ||
        D.documentElement
      ).appendChild(link);

      W.setTimeout(() => {
        finish(
          stylesheetReady(link)
        );
      }, 1200);
    });
  }


  // ===========================================================================
  // JS LOADER
  // ===========================================================================

  function loadJSOnce(src) {
    const s0 = withV(src);
    const key =
      "zzxjs:" + keyify(s0);

    let existing =
      D.querySelector(
        `script[data-zzx-js="${key}"]`
      );

    // Failed script must not poison the page forever.
    if (
      existing &&
      existing.dataset.zzxFailed === "1"
    ) {
      try {
        existing.remove();
      } catch (_) {}

      existing = null;
    }

    if (existing) {
      if (
        existing.dataset.zzxLoaded === "1"
      ) {
        return Promise.resolve(true);
      }

      // Existing script is still loading.
      return new Promise((resolve) => {
        let settled = false;

        const finish = (ok) => {
          if (settled) return;
          settled = true;

          if (ok) {
            existing.dataset.zzxLoaded = "1";
            existing.dataset.zzxFailed = "0";
          } else {
            existing.dataset.zzxFailed = "1";
          }

          resolve(Boolean(ok));
        };

        existing.addEventListener(
          "load",
          () => finish(true),
          { once: true }
        );

        existing.addEventListener(
          "error",
          () => finish(false),
          { once: true }
        );

        // A script inserted by an earlier pass may already have
        // executed before these listeners were attached.
        W.setTimeout(() => {
          if (
            existing.dataset.zzxFailed !== "1"
          ) {
            finish(true);
          }
        }, 1000);
      });
    }

    return new Promise((resolve) => {
      const script =
        D.createElement("script");

      let settled = false;

      const finish = (ok) => {
        if (settled) return;
        settled = true;

        if (ok) {
          script.dataset.zzxLoaded = "1";
          script.dataset.zzxFailed = "0";
        } else {
          script.dataset.zzxFailed = "1";
        }

        resolve(Boolean(ok));
      };

      script.src = s0;
      script.defer = true;

      script.setAttribute(
        "data-zzx-js",
        key
      );

      script.addEventListener(
        "load",
        () => finish(true),
        { once: true }
      );

      script.addEventListener(
        "error",
        () => finish(false),
        { once: true }
      );

      (
        D.head ||
        D.documentElement
      ).appendChild(script);
    });
  }


  // ===========================================================================
  // HTML
  // ===========================================================================

  async function fetchHTML(url) {
    const u = withV(url);

    const response =
      await fetch(
        u,
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTML fetch failed ${response.status}: ${u}`
      );
    }

    return await response.text();
  }


  function injectHTML(
    mount,
    html
  ) {
    mount.replaceChildren();

    const tpl =
      D.createElement("template");

    tpl.innerHTML = html;

    mount.appendChild(
      tpl.content
    );
  }


  // ===========================================================================
  // LOCAL FONTS
  // ===========================================================================

  function ensureLocalFontsOnce() {
    const existing =
      D.getElementById(
        "zzx-local-fonts"
      );

    if (existing) {
      return Promise.resolve(true);
    }

    const style =
      D.createElement("style");

    style.id = "zzx-local-fonts";
    style.type = "text/css";

    const f = (filename) =>
      asset(
        "/static/fonts/" + filename
      );

    const fontCSS = `

@font-face{
  font-family:"AdultSwimFont";
  src:url("${f("Adult-Swim-Font.ttf")}") format("truetype");
  font-weight:400;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-Thin.ttf")}") format("truetype");
  font-weight:100;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-ThinItalic.ttf")}") format("truetype");
  font-weight:100;
  font-style:italic;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-ExtraLight.ttf")}") format("truetype");
  font-weight:200;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-ExtraLightItalic.ttf")}") format("truetype");
  font-weight:200;
  font-style:italic;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-Light.ttf")}") format("truetype");
  font-weight:300;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-LightItalic.ttf")}") format("truetype");
  font-weight:300;
  font-style:italic;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-Regular.ttf")}") format("truetype");
  font-weight:400;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-Italic.ttf")}") format("truetype");
  font-weight:400;
  font-style:italic;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-Medium.ttf")}") format("truetype");
  font-weight:500;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-MediumItalic.ttf")}") format("truetype");
  font-weight:500;
  font-style:italic;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-SemiBold.ttf")}") format("truetype");
  font-weight:600;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-Bold.ttf")}") format("truetype");
  font-weight:700;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-BoldItalic.ttf")}") format("truetype");
  font-weight:700;
  font-style:italic;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-Text.ttf")}") format("truetype");
  font-weight:450;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMono";
  src:url("${f("IBMPlexMono-TextItalic.ttf")}") format("truetype");
  font-weight:450;
  font-style:italic;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexSansJP";
  src:url("${f("IBMPlexSansJP-Thin.ttf")}") format("truetype");
  font-weight:100;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexSansJP";
  src:url("${f("IBMPlexSansJP-ExtraLight.ttf")}") format("truetype");
  font-weight:200;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexSansJP";
  src:url("${f("IBMPlexSansJP-Light.ttf")}") format("truetype");
  font-weight:300;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexSansJP";
  src:url("${f("IBMPlexSansJP-Regular.ttf")}") format("truetype");
  font-weight:400;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexSansJP";
  src:url("${f("IBMPlexSansJP-Text.ttf")}") format("truetype");
  font-weight:450;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexSansJP";
  src:url("${f("IBMPlexSansJP-Medium.ttf")}") format("truetype");
  font-weight:500;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexSansJP";
  src:url("${f("IBMPlexSansJP-SemiBold.ttf")}") format("truetype");
  font-weight:600;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexSansJP";
  src:url("${f("IBMPlexSansJP-Bold.ttf")}") format("truetype");
  font-weight:700;
  font-style:normal;
  font-display:swap;
}

@font-face{
  font-family:"IBMPlexMath";
  src:url("${f("IBMPlexMath-Regular.ttf")}") format("truetype");
  font-weight:400;
  font-style:normal;
  font-display:swap;
}

:root{
  --zzx-font-display:
    "AdultSwimFont",
    "IBMPlexMono",
    ui-monospace,
    monospace;

  --zzx-font-mono:
    "IBMPlexMono",
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    "Liberation Mono",
    monospace;

  --zzx-font-sans:
    "IBMPlexSansJP",
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    Arial,
    sans-serif;
}
`;

    style.appendChild(
      D.createTextNode(fontCSS)
    );

    (
      D.head ||
      D.documentElement
    ).appendChild(style);

    // fonts.json remains the canonical font-set contract.
    // Font loading itself does not fail merely because this
    // optional verification request is unavailable.
    return fetch(
      withV(fontsJSON()),
      {
        cache: "no-store"
      }
    )
      .then((response) => {
        if (!response.ok) {
          console.warn(
            "[ticker-loader] fonts.json unavailable:",
            response.status
          );
        }

        return response.ok;
      })
      .catch(() => false);
  }


  // ===========================================================================
  // PARTIALS
  // ===========================================================================

  function waitForPartials(
    timeoutMs = 3500
  ) {
    if (W.__zzx_partials_ready) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let done = false;

      const finish = (ok) => {
        if (done) return;

        done = true;
        resolve(Boolean(ok));
      };

      const onReady = () => {
        W.__zzx_partials_ready = true;
        finish(true);
      };

      W.addEventListener(
        "zzx:partials:ready",
        onReady,
        { once: true }
      );

      W.addEventListener(
        "zzx:partials-ready",
        onReady,
        { once: true }
      );

      const started =
        performance.now();

      (function poll() {
        if (done) return;

        const header =
          D.getElementById(
            "zzx-header"
          );

        if (
          header &&
          header.childNodes &&
          header.childNodes.length
        ) {
          finish(true);
          return;
        }

        if (
          performance.now() - started >=
          timeoutMs
        ) {
          finish(false);
          return;
        }

        W.setTimeout(
          poll,
          60
        );
      })();
    });
  }


  // ===========================================================================
  // MOUNT STATE
  // ===========================================================================

  function getMount() {
    return D.getElementById(
      "ticker-container"
    );
  }


  function hasWrapper(mount) {
    if (!mount) return false;

    return Boolean(
      mount.querySelector(
        "[data-hud-root]"
      ) ||
      mount.querySelector(
        ".btc-rail"
      )
    );
  }


  // ===========================================================================
  // INFRASTRUCTURE
  // ===========================================================================

  async function ensureInfrastructure() {
    // Re-evaluate prefix AFTER partials are stable.
    getPrefix();
    publishManifestURL();

    // Fonts remain first.
    await ensureLocalFontsOnce();

    // CSS before HTML.
    const okWrapCSS =
      await loadCSSOnce(
        wrapperCSS()
      );

    if (!okWrapCSS) {
      console.warn(
        "[ticker-loader] wrapper CSS failed:",
        wrapperCSS()
      );
    }

    const okCoreCSS =
      await loadCSSOnce(
        coreCSS()
      );

    if (!okCoreCSS) {
      console.warn(
        "[ticker-loader] core CSS failed:",
        coreCSS()
      );
    }

    return {
      okWrapCSS,
      okCoreCSS
    };
  }


  async function ensureScripts() {
    // HUD state must exist before core boots.
    const okHUD =
      await loadJSOnce(
        hudStateJS()
      );

    if (!okHUD) {
      console.warn(
        "[ticker-loader] hud-state failed:",
        hudStateJS()
      );
    }

    const okCore =
      await loadJSOnce(
        coreJS()
      );

    if (!okCore) {
      console.warn(
        "[ticker-loader] widget-core failed:",
        coreJS()
      );
    }

    return {
      okHUD,
      okCore
    };
  }


  // ===========================================================================
  // BOOT
  // ===========================================================================

  let booting = false;
  let bootAgain = false;


  async function bootOnceForCurrentMount() {
    if (booting) {
      bootAgain = true;
      return;
    }

    booting = true;

    try {
      await waitForPartials();

      // Prefix may have changed while partials were loading.
      getPrefix();
      publishManifestURL();

      const mount = getMount();

      if (!mount) {
        return;
      }

      // Always recover infrastructure even when wrapper already exists.
      await ensureInfrastructure();

      // Only replace mount HTML if wrapper is absent.
      if (!hasWrapper(mount)) {
        const html =
          await fetchHTML(
            wrapperHTML()
          );

        // Mount itself could have been replaced while fetching.
        const currentMount =
          getMount();

        if (!currentMount) {
          return;
        }

        if (!hasWrapper(currentMount)) {
          injectHTML(
            currentMount,
            html
          );
        }
      }

      // CRITICAL:
      // Existing wrapper does NOT mean scripts are healthy.
      // Always ensure hud-state and widget-core.
      await ensureScripts();

      // Explicit core kick remains idempotent.
      try {
        if (
          W.ZZXWidgetsCore &&
          typeof W.ZZXWidgetsCore.boot ===
            "function"
        ) {
          await W.ZZXWidgetsCore.boot();
        }
      } catch (err) {
        console.error(
          "[ticker-loader] widget-core boot failed:",
          err
        );
      }

    } catch (err) {
      console.error(
        "[ZZX ticker-loader] fatal:",
        err
      );

    } finally {
      booting = false;

      if (bootAgain) {
        bootAgain = false;

        W.setTimeout(
          bootOnceForCurrentMount,
          0
        );
      }
    }
  }


  // ===========================================================================
  // INITIAL BOOT
  // ===========================================================================

  bootOnceForCurrentMount();


  // ===========================================================================
  // PARTIAL READY EVENTS
  // ===========================================================================

  // These remain useful even after the initial timeout path.
  W.addEventListener(
    "zzx:partials:ready",
    () => {
      getPrefix();
      bootOnceForCurrentMount();
    }
  );

  W.addEventListener(
    "zzx:partials-ready",
    () => {
      getPrefix();
      bootOnceForCurrentMount();
    }
  );


  // ===========================================================================
  // REMOUNT OBSERVER
  // ===========================================================================

  try {
    const observer =
      new MutationObserver(() => {
        const mount = getMount();

        if (!mount) return;

        // Wrapper was destroyed/replaced.
        if (!hasWrapper(mount)) {
          bootOnceForCurrentMount();
          return;
        }

        // Wrapper exists but core may have been removed/failed.
        if (
          !W.ZZXWidgetsCore ||
          typeof W.ZZXWidgetsCore.boot !==
            "function"
        ) {
          bootOnceForCurrentMount();
        }
      });

    observer.observe(
      D.documentElement,
      {
        childList: true,
        subtree: true
      }
    );

    D.__zzxTickerLoaderObserver =
      observer;

  } catch (_) {}
})();
