// /static/js/modules/partials-loader.js
// ZZX Partials Loader
// DEPTH-SAFE + FRAME-FIRST + HUD-SAFE + RETRY-SAFE
//
// FRAME-FIRST ORDER:
//   1) header + nav
//   2) footer
//   3) credits controller
//   4) runtime LAST
//   5) readiness events
//   6) legacy ticker fallback ONLY if canonical HUD did not claim the mount
//
// PUBLIC EVENTS:
//   zzx:frame:ready
//   zzx:frame-ready
//   zzx:partials:ready
//   zzx:partials-ready
//
// IMPORTANT:
// - Does NOT remove any existing widget.
// - Does NOT replace clock-drift, tip-drift, drift, runtime, etc.
// - Does NOT inject credits UI.
// - Does NOT load runtime.js directly.
// - Does NOT let "." or "./" escape into window.ZZX.PREFIX.
// - Preserves legacy /bitcoin/ticker/ as fallback only.
// - Canonical ticker-loader/widget-core always wins.

(function () {
  "use strict";

  const W = window;
  const D = document;

  if (W.__ZZX_PARTIALS_LOADER_BOOTED) return;
  W.__ZZX_PARTIALS_LOADER_BOOTED = true;

  const PARTIALS_DIR = "__partials";
  const PREFIX_KEY = "zzx.partials.prefix";

  /*
    IMPORTANT:

    "" replaces the historical "." candidate.

    That means:

      ""      current directory
      ".."    one directory up
      "../.." two directories up
      ...
      "/"     actual domain root

    "." and "./" are accepted from old sessionStorage values,
    but normalized to "" before publication.
  */
  const PATHS = [
    "",
    "..",
    "../..",
    "../../..",
    "../../../..",
    "../../../../..",
    "../../../../../..",
    "../../../../../../..",
    "/"
  ];


  // ===========================================================================
  // PREFIX NORMALIZATION
  // ===========================================================================

  function normalizeProbePrefix(value) {
    let p = String(value || "").trim();

    if (
      p === "." ||
      p === "./"
    ) {
      p = "";
    }

    if (p === "/") {
      return "/";
    }

    return p.replace(/\/+$/g, "");
  }


  /*
    Public ZZX prefix contract.

    "/" means the site was found at actual domain root.

    Other modules work with root-relative URLs when PREFIX is "",
    so publish "" for that case.

    Relative depth prefixes such as "../.." remain intact.
  */
  function publicPrefix(probePrefix) {
    const p =
      normalizeProbePrefix(probePrefix);

    if (
      p === "" ||
      p === "/"
    ) {
      return "";
    }

    return p;
  }


  // ===========================================================================
  // STORAGE
  // ===========================================================================

  function sessionGet(key) {
    try {
      return W.sessionStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }


  function sessionSet(key, value) {
    try {
      W.sessionStorage.setItem(
        key,
        value
      );
    } catch (_) {}
  }


  function sessionDel(key) {
    try {
      W.sessionStorage.removeItem(key);
    } catch (_) {}
  }


  // ===========================================================================
  // PATH JOIN
  // ===========================================================================

  /*
    Do not use a generic Array.join("/") here.

    The historical implementation could turn a "/" prefix into
    a malformed "//__partials/..." URL.

    This helper deliberately understands the prefix position.
  */
  function joinPrefix(prefix, ...parts) {
    const p =
      normalizeProbePrefix(prefix);

    const tail = parts
      .filter(
        part =>
          part !== null &&
          part !== undefined &&
          String(part) !== ""
      )
      .map(
        part =>
          String(part)
            .replace(/^\/+/g, "")
            .replace(/\/+$/g, "")
      )
      .filter(Boolean)
      .join("/");

    if (p === "/") {
      return "/" + tail;
    }

    if (!p) {
      return tail;
    }

    if (!tail) {
      return p;
    }

    return (
      p.replace(/\/+$/g, "") +
      "/" +
      tail
    );
  }


  // ===========================================================================
  // PROBE
  // ===========================================================================

  async function probe(url) {
    try {
      const response =
        await fetch(
          url,
          {
            method: "GET",
            cache: "no-store"
          }
        );

      return response.ok;
    } catch (_) {
      return false;
    }
  }


  async function validateOrRecomputePrefix(cached) {
    if (cached !== null) {
      const normalized =
        normalizeProbePrefix(cached);

      const testURL =
        joinPrefix(
          normalized,
          PARTIALS_DIR,
          "header/header.html"
        );

      if (await probe(testURL)) {
        sessionSet(
          PREFIX_KEY,
          normalized
        );

        return normalized;
      }

      sessionDel(PREFIX_KEY);
    }

    for (const candidate of PATHS) {
      const p =
        normalizeProbePrefix(candidate);

      const testURL =
        joinPrefix(
          p,
          PARTIALS_DIR,
          "header/header.html"
        );

      if (await probe(testURL)) {
        sessionSet(
          PREFIX_KEY,
          p
        );

        return p;
      }
    }

    /*
      Safe fallback.

      Historical code returned "." here, which is precisely the
      prefix value the HUD loaders reject.

      Empty prefix represents current-directory resolution.
    */
    return "";
  }


  async function findPrefix() {
    return await validateOrRecomputePrefix(
      sessionGet(PREFIX_KEY)
    );
  }


  function publishPrefix(probePrefix) {
    const p =
      publicPrefix(probePrefix);

    W.ZZX = Object.assign(
      {},
      W.ZZX || {},
      {
        PREFIX: p
      }
    );

    if (D.documentElement) {
      try {
        D.documentElement.setAttribute(
          "data-zzx-prefix",
          p
        );
      } catch (_) {}
    }

    return p;
  }


  // ===========================================================================
  // ABSOLUTE URL REWRITE
  // ===========================================================================

  function absToPrefix(url, probePrefix) {
    if (!url) return url;

    const p =
      normalizeProbePrefix(probePrefix);

    /*
      If discovery genuinely resolved against domain root,
      preserve ordinary root-absolute URLs.
    */
    if (p === "/") {
      return url;
    }

    if (!url.startsWith("/")) {
      return url;
    }

    /*
      Current-directory prefix on the root page.

      Leave root-absolute site URLs alone.
    */
    if (!p) {
      return url;
    }

    return (
      p.replace(/\/+$/g, "") +
      url
    );
  }


  function rewriteAbsoluteURLs(
    root,
    probePrefix
  ) {
    if (!root) return;

    root
      .querySelectorAll('[href^="/"]')
      .forEach(anchor => {
        const value =
          anchor.getAttribute("href");

        if (value) {
          anchor.setAttribute(
            "href",
            absToPrefix(
              value,
              probePrefix
            )
          );
        }
      });

    root
      .querySelectorAll('[src^="/"]')
      .forEach(element => {
        const value =
          element.getAttribute("src");

        if (value) {
          element.setAttribute(
            "src",
            absToPrefix(
              value,
              probePrefix
            )
          );
        }
      });
  }


  // ===========================================================================
  // HTML
  // ===========================================================================

  async function loadHTML(url) {
    const response =
      await fetch(
        url,
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${url}: ${response.status}`
      );
    }

    return await response.text();
  }


  // ===========================================================================
  // HEADER + NAV
  // ===========================================================================

  function injectNavIntoHeader(
    headerHTML,
    navHTML
  ) {
    const marker =
      "<!-- navbar Here -->";

    if (headerHTML.includes(marker)) {
      return headerHTML.replace(
        marker,
        navHTML
      );
    }

    const index =
      headerHTML.lastIndexOf(
        "</div>"
      );

    if (index !== -1) {
      return (
        headerHTML.slice(
          0,
          index
        ) +
        "\n" +
        navHTML +
        "\n" +
        headerHTML.slice(index)
      );
    }

    return (
      headerHTML +
      "\n" +
      navHTML
    );
  }


  // ===========================================================================
  // NAV UX FALLBACK
  // ===========================================================================

  function initNavUX(
    scope = D
  ) {
    const toggle =
      scope.querySelector(
        "#navbar-toggle"
      );

    const links =
      scope.querySelector(
        "#navbar-links"
      );

    const body =
      D.body;

    if (
      toggle &&
      links &&
      !toggle.__bound_click
    ) {
      toggle.__bound_click =
        true;

      toggle.addEventListener(
        "click",
        () => {
          const isOpen =
            links.classList.toggle(
              "open"
            );

          toggle.setAttribute(
            "aria-expanded",
            isOpen
              ? "true"
              : "false"
          );

          links.setAttribute(
            "aria-hidden",
            isOpen
              ? "false"
              : "true"
          );

          if (body) {
            body.classList.toggle(
              "no-scroll",
              isOpen
            );
          }
        }
      );
    }

    scope
      .querySelectorAll(
        ".submenu-toggle"
      )
      .forEach(button => {
        if (
          button.__bound_click
        ) {
          return;
        }

        button.__bound_click =
          true;

        button.addEventListener(
          "click",
          () => {
            const list =
              button.nextElementSibling;

            if (
              list &&
              list.classList.contains(
                "submenu"
              )
            ) {
              list.classList.toggle(
                "open"
              );

              button.classList.toggle(
                "open"
              );
            }
          }
        );
      });
  }


  async function waitForSitewideInit(
    timeoutMs = 1200,
    intervalMs = 60
  ) {
    return new Promise(resolve => {
      const started =
        performance.now();

      (function poll() {
        if (
          W.ZZXSite &&
          typeof W.ZZXSite.initNav ===
            "function"
        ) {
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

        W.setTimeout(
          poll,
          intervalMs
        );
      })();
    });
  }


  // ===========================================================================
  // SCRIPT LOADER
  // ===========================================================================

  function scriptPath(src) {
    try {
      return new URL(
        src,
        location.href
      ).pathname;
    } catch (_) {
      return String(src || "");
    }
  }


  function findExistingScript(
    src,
    dataAttr
  ) {
    if (dataAttr) {
      const marked =
        D.querySelector(
          `script[${dataAttr}="1"]`
        );

      if (marked) {
        return marked;
      }
    }

    const wantedPath =
      scriptPath(src);

    for (
      const script
      of Array.from(D.scripts)
    ) {
      try {
        if (
          scriptPath(script.src) ===
          wantedPath
        ) {
          return script;
        }
      } catch (_) {}
    }

    return null;
  }


  function loadScriptOnce(
    src,
    dataAttr
  ) {
    return new Promise(resolve => {
      const abs =
        new URL(
          src,
          location.href
        ).href;

      let existing =
        findExistingScript(
          abs,
          dataAttr
        );

      /*
        A failed script must not permanently poison dedupe.
      */
      if (
        existing &&
        existing.dataset.zzxFailed ===
          "1"
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
          resolve({
            ok: true,
            deduped: true
          });

          return;
        }

        let settled = false;

        const finish = result => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        existing.addEventListener(
          "load",
          () => {
            existing.dataset.zzxLoaded =
              "1";

            existing.dataset.zzxFailed =
              "0";

            finish({
              ok: true,
              deduped: true
            });
          },
          {
            once: true
          }
        );

        existing.addEventListener(
          "error",
          () => {
            existing.dataset.zzxFailed =
              "1";

            finish({
              ok: false,
              deduped: true
            });
          },
          {
            once: true
          }
        );

        /*
          Existing static scripts may already have executed
          before this controller attached.
        */
        W.setTimeout(
          () => {
            if (
              existing.dataset.zzxFailed !==
              "1"
            ) {
              existing.dataset.zzxLoaded =
                "1";

              finish({
                ok: true,
                deduped: true
              });
            }
          },
          1000
        );

        return;
      }

      const script =
        D.createElement("script");

      script.src = abs;
      script.defer = true;

      if (dataAttr) {
        script.setAttribute(
          dataAttr,
          "1"
        );
      }

      script.addEventListener(
        "load",
        () => {
          script.dataset.zzxLoaded =
            "1";

          script.dataset.zzxFailed =
            "0";

          resolve({
            ok: true
          });
        },
        {
          once: true
        }
      );

      script.addEventListener(
        "error",
        () => {
          script.dataset.zzxFailed =
            "1";

          resolve({
            ok: false
          });
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
  // RUNTIME
  // ===========================================================================

  async function loadRuntime(
    probePrefix
  ) {
    const candidates = [
      joinPrefix(
        probePrefix,
        PARTIALS_DIR,
        "runtime/runtime.html"
      ),

      joinPrefix(
        probePrefix,
        PARTIALS_DIR,
        "runtime.html"
      ),

      joinPrefix(
        probePrefix,
        "runtime.html"
      )
    ];

    let runtimeHost =
      D.getElementById(
        "zzx-runtime"
      );

    if (!runtimeHost) {
      runtimeHost =
        D.createElement("div");

      runtimeHost.id =
        "zzx-runtime";

      (
        D.body ||
        D.documentElement
      ).appendChild(runtimeHost);
    }

    for (const url of candidates) {
      try {
        const html =
          await loadHTML(url);

        const wrap =
          D.createElement("div");

        wrap.innerHTML =
          html;

        rewriteAbsoluteURLs(
          wrap,
          probePrefix
        );

        runtimeHost.replaceChildren(
          ...wrap.childNodes
        );

        runtimeHost.setAttribute(
          "data-runtime-source",
          url
        );

        return {
          ok: true,
          url
        };

      } catch (_) {}
    }

    return {
      ok: false,
      reason: "fetch_failed"
    };
  }


  // ===========================================================================
  // CANONICAL HUD DETECTION
  // ===========================================================================

  function canonicalHUDPresent() {
    const tickerContainer =
      D.getElementById(
        "ticker-container"
      );

    if (
      tickerContainer &&
      (
        tickerContainer.querySelector(
          "[data-hud-root]"
        ) ||
        tickerContainer.querySelector(
          ".btc-rail"
        )
      )
    ) {
      return true;
    }

    return Boolean(
      W.__ZZX_TICKER_LOADER_BOOTED ||
      W.ZZXWidgetsCore ||
      D.querySelector(
        'script[data-zzx-ticker-loader="1"]'
      ) ||
      D.querySelector(
        'script[src*="/static/js/modules/ticker-loader.js"]'
      )
    );
  }


  async function waitForCanonicalHUD(
    timeoutMs = 1800
  ) {
    const started =
      performance.now();

    return await new Promise(resolve => {
      (function poll() {
        const container =
          D.getElementById(
            "ticker-container"
          );

        if (
          container &&
          (
            container.querySelector(
              "[data-hud-root]"
            ) ||
            container.querySelector(
              ".btc-rail"
            )
          )
        ) {
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

        W.setTimeout(
          poll,
          60
        );
      })();
    });
  }


  // ===========================================================================
  // LEGACY TICKER FALLBACK
  // ===========================================================================

  async function maybeLoadTickerFallback(
    probePrefix
  ) {
    const tc =
      D.getElementById(
        "ticker-container"
      );

    if (!tc) {
      return {
        ok: false,
        skipped: true,
        reason: "no_mount"
      };
    }

    /*
      Canonical HUD already owns the mount.
    */
    if (
      tc.querySelector(
        "[data-hud-root]"
      ) ||
      tc.querySelector(
        ".btc-rail"
      )
    ) {
      return {
        ok: true,
        skipped: true,
        reason: "canonical_hud"
      };
    }

    /*
      If canonical infrastructure exists or is expected,
      give it time to claim the container.
    */
    if (canonicalHUDPresent()) {
      const claimed =
        await waitForCanonicalHUD();

      if (claimed) {
        return {
          ok: true,
          skipped: true,
          reason: "canonical_hud"
        };
      }
    }

    /*
      Another legacy ticker loader may already own this.
    */
    if (
      W.__ZZX_TICKER_LOADED ||
      tc.dataset.tickerLoaded === "1" ||
      D.querySelector(
        'script[data-zzx-ticker="1"]'
      )
    ) {
      return {
        ok: true,
        skipped: true,
        reason: "legacy_deduped"
      };
    }

    try {
      const tickerHTML =
        joinPrefix(
          probePrefix,
          "bitcoin/ticker/ticker.html"
        );

      const tickerJS =
        joinPrefix(
          probePrefix,
          "bitcoin/ticker/ticker.js"
        );

      const html =
        await loadHTML(
          tickerHTML
        );

      /*
        Canonical HUD may have claimed the mount while
        ticker.html was being fetched.
      */
      if (
        tc.querySelector(
          "[data-hud-root]"
        ) ||
        tc.querySelector(
          ".btc-rail"
        )
      ) {
        return {
          ok: true,
          skipped: true,
          reason: "canonical_claimed_during_fetch"
        };
      }

      tc.innerHTML =
        html;

      const result =
        await loadScriptOnce(
          tickerJS,
          "data-zzx-ticker"
        );

      if (!result.ok) {
        throw new Error(
          "ticker.js failed"
        );
      }

      W.__ZZX_TICKER_LOADED =
        true;

      tc.dataset.tickerLoaded =
        "1";

      return {
        ok: true,
        fallback: true
      };

    } catch (error) {
      console.warn(
        "[partials-loader] legacy ticker fallback failed:",
        error
      );

      return {
        ok: false,
        reason: "fetch_failed"
      };
    }
  }


  // ===========================================================================
  // EVENTS
  // ===========================================================================

  function dispatch(
    name,
    detail
  ) {
    try {
      W.dispatchEvent(
        new CustomEvent(
          name,
          {
            detail
          }
        )
      );
    } catch (_) {}
  }


  function emitFrameReady(
    detail
  ) {
    dispatch(
      "zzx:frame:ready",
      detail
    );

    // Historical compatibility alias.
    dispatch(
      "zzx:frame-ready",
      detail
    );
  }


  function emitPartialsReady(
    detail
  ) {
    W.__zzx_partials_ready =
      true;

    dispatch(
      "zzx:partials:ready",
      detail
    );

    /*
      Several existing HUD files deliberately listen for
      this historical spelling as well.
    */
    dispatch(
      "zzx:partials-ready",
      detail
    );
  }


  // ===========================================================================
  // HOSTS
  // ===========================================================================

  function ensureHost(
    id,
    placement
  ) {
    let host =
      D.getElementById(id);

    if (host) {
      return host;
    }

    host =
      D.createElement("div");

    host.id =
      id;

    if (placement === "prepend") {
      (
        D.body ||
        D.documentElement
      ).prepend(host);
    } else {
      (
        D.body ||
        D.documentElement
      ).appendChild(host);
    }

    return host;
  }


  // ===========================================================================
  // BOOT
  // ===========================================================================

  let booting = false;

  async function boot() {
    if (booting) {
      return;
    }

    booting = true;

    try {
      const probePrefix =
        await findPrefix();

      const prefix =
        publishPrefix(
          probePrefix
        );


      // -----------------------------------------------------------------------
      // Hosts
      // -----------------------------------------------------------------------

      const headerHost =
        ensureHost(
          "zzx-header",
          "prepend"
        );

      const footerHost =
        ensureHost(
          "zzx-footer",
          "append"
        );


      // -----------------------------------------------------------------------
      // 1) HEADER + NAV + FOOTER
      // -----------------------------------------------------------------------

      const [
        headerHTML,
        navHTML,
        footerHTML
      ] = await Promise.all([
        loadHTML(
          joinPrefix(
            probePrefix,
            PARTIALS_DIR,
            "header/header.html"
          )
        ),

        loadHTML(
          joinPrefix(
            probePrefix,
            PARTIALS_DIR,
            "nav/nav.html"
          )
        ),

        loadHTML(
          joinPrefix(
            probePrefix,
            PARTIALS_DIR,
            "footer/footer.html"
          )
        )
      ]);


      // -----------------------------------------------------------------------
      // Header + nav composition
      // -----------------------------------------------------------------------

      const composedHeader =
        injectNavIntoHeader(
          headerHTML,
          navHTML
        );

      const headerWrap =
        D.createElement("div");

      headerWrap.innerHTML =
        composedHeader;

      rewriteAbsoluteURLs(
        headerWrap,
        probePrefix
      );

      headerHost.replaceChildren(
        ...headerWrap.childNodes
      );


      // -----------------------------------------------------------------------
      // Footer
      // -----------------------------------------------------------------------

      const footerWrap =
        D.createElement("div");

      footerWrap.innerHTML =
        footerHTML;

      rewriteAbsoluteURLs(
        footerWrap,
        probePrefix
      );

      footerHost.replaceChildren(
        ...footerWrap.childNodes
      );


      // -----------------------------------------------------------------------
      // 2) CREDITS CONTROLLER
      // -----------------------------------------------------------------------

      const creditsSrc =
        joinPrefix(
          probePrefix,
          PARTIALS_DIR,
          "credits/credits.js"
        );

      const creditsLoad =
        await loadScriptOnce(
          creditsSrc,
          "data-zzx-credits"
        );


      // -----------------------------------------------------------------------
      // NAV UX
      // -----------------------------------------------------------------------

      const hasSitewide =
        await waitForSitewideInit();

      if (hasSitewide) {
        try {
          W.ZZXSite.initNav(
            headerHost
          );

          if (
            typeof W.ZZXSite.autoInit ===
              "function"
          ) {
            W.ZZXSite.autoInit();
          }
        } catch (_) {
          initNavUX(
            headerHost
          );
        }

      } else {
        initNavUX(
          headerHost
        );
      }


      // -----------------------------------------------------------------------
      // FRAME READY
      // -----------------------------------------------------------------------

      const frameDetail = {
        prefix,
        probePrefix,
        credits: creditsLoad
      };

      emitFrameReady(
        frameDetail
      );


      // -----------------------------------------------------------------------
      // 3) RUNTIME LAST
      // -----------------------------------------------------------------------

      const runtime =
        await loadRuntime(
          probePrefix
        );


      // -----------------------------------------------------------------------
      // PARTIALS READY
      // -----------------------------------------------------------------------

      const partialDetail = {
        prefix,
        probePrefix,
        runtime
      };

      emitPartialsReady(
        partialDetail
      );


      // -----------------------------------------------------------------------
      // 4) LEGACY TICKER FALLBACK
      //
      // Canonical ticker-loader has now received partials-ready.
      // Only use old /bitcoin/ticker/ if canonical mounting fails.
      // -----------------------------------------------------------------------

      const ticker =
        await maybeLoadTickerFallback(
          probePrefix
        );


      // -----------------------------------------------------------------------
      // DEBUG / STATUS SURFACE
      // -----------------------------------------------------------------------

      W.ZZXPartials =
        W.ZZXPartials || {};

      W.ZZXPartials.lastResults = {
        prefix,
        probePrefix,
        credits: creditsLoad,
        runtime,
        ticker
      };

      W.ZZXPartials.prefix =
        prefix;

      W.ZZXPartials.probePrefix =
        probePrefix;

      W.ZZXPartials.boot =
        boot;

    } catch (error) {
      console.warn(
        "[partials-loader] boot failed:",
        error
      );

    } finally {
      booting = false;
    }
  }


  // ===========================================================================
  // PUBLIC SURFACE
  // ===========================================================================

  W.ZZXPartials =
    W.ZZXPartials || {};

  W.ZZXPartials.boot =
    boot;


  // ===========================================================================
  // START
  // ===========================================================================

  if (
    D.readyState === "loading"
  ) {
    D.addEventListener(
      "DOMContentLoaded",
      () => {
        boot();
      },
      {
        once: true
      }
    );
  } else {
    boot();
  }

})();
