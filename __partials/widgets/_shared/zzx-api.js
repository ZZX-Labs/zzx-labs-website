// __partials/widgets/_shared/zzx-api.js
//
// ZZX-Labs shared widget API utilities
// DROP-IN REPLACEMENT
//
// GOALS:
// - Preserve all existing public ZZXAPI methods.
// - Prefix-safe from every site depth.
// - Support normal fetch() options rather than discarding them.
// - Optional timeout/retry without forcing it on widgets.
// - No overlapping async polling calls.
// - Stop polling automatically when a widget root is removed.
// - Avoid duplicate widget boots through multiple registry paths.
// - Recover cleanly after HUD reinjection.
// - Keep existing HTML helpers for compatibility.
//
// VERSION:
//   v4
//
// No external dependencies.

(function () {
  "use strict";

  const W = window;
  const D = document;

  /*
    If a newer/equivalent API is already installed,
    leave it alone.

    IMPORTANT:
    Previous code checked >= 3, which would prevent
    a v3 instance from being upgraded by this v4 file.
  */
  if (
    W.ZZXAPI &&
    Number(W.ZZXAPI.__version || 0) >= 4
  ) {
    return;
  }


  // ===========================================================================
  // INTERNAL STATE
  // ===========================================================================

  /*
    root ->
      {
        timer,
        running,
        stopped,
        fn,
        ms,
        options
      }

    WeakMap means removed roots are not artificially
    retained by the map itself.
  */
  const timers =
    new WeakMap();


  // ===========================================================================
  // PREFIX
  // ===========================================================================

  function prefix() {
    let p = "";

    if (
      W.ZZX &&
      typeof W.ZZX.PREFIX === "string"
    ) {
      p = W.ZZX.PREFIX;
    } else if (
      W.ZZX &&
      typeof W.ZZX.prefix === "string"
    ) {
      p = W.ZZX.prefix;
    } else if (D.documentElement) {
      p =
        D.documentElement.getAttribute(
          "data-zzx-prefix"
        ) ||
        "";
    }

    p =
      String(p || "")
        .trim();

    if (
      p === "." ||
      p === "./" ||
      p === "/"
    ) {
      p = "";
    }

    p =
      p.replace(
        /\/+$/g,
        ""
      );

    /*
      Keep the site-wide contract normalized.
    */
    W.ZZX =
      Object.assign(
        {},
        W.ZZX || {},
        {
          PREFIX: p
        }
      );

    return p;
  }


  // ===========================================================================
  // URL RESOLUTION
  // ===========================================================================

  function isExternalOrSpecial(value) {
    const s =
      String(value || "");

    return (
      /^[a-z][a-z0-9+.-]*:/i.test(s) ||
      /^\/\//.test(s)
    );
  }


  function url(path) {
    const value =
      String(path || "");

    if (!value) {
      return value;
    }

    /*
      Preserve:
        https:
        http:
        data:
        blob:
        mailto:
        ws:
        wss:
        protocol-relative //host/...
        etc.
    */
    if (
      isExternalOrSpecial(value)
    ) {
      return value;
    }

    /*
      Relative path.

      Do not try to prefix it because its caller may
      deliberately mean current-document-relative.
    */
    if (
      !value.startsWith("/")
    ) {
      return value;
    }

    const pre =
      prefix();

    return pre
      ? pre + value
      : value;
  }


  // ===========================================================================
  // CACHE BUSTING
  // ===========================================================================

  function bust(path) {
    const resolved =
      url(path);

    if (!resolved) {
      return resolved;
    }

    if (
      /^data:|^blob:/i.test(
        resolved
      )
    ) {
      return resolved;
    }

    /*
      Preserve #fragment position.

      Old:
        file.json#x?t=123

      Correct:
        file.json?t=123#x
    */
    const hashIndex =
      resolved.indexOf("#");

    const base =
      hashIndex >= 0
        ? resolved.slice(
            0,
            hashIndex
          )
        : resolved;

    const hash =
      hashIndex >= 0
        ? resolved.slice(
            hashIndex
          )
        : "";

    const separator =
      base.includes("?")
        ? "&"
        : "?";

    return (
      base +
      separator +
      "t=" +
      Date.now() +
      hash
    );
  }


  // ===========================================================================
  // SLEEP
  // ===========================================================================

  function sleep(ms) {
    return new Promise(resolve => {
      W.setTimeout(
        resolve,
        Math.max(
          0,
          Number(ms) || 0
        )
      );
    });
  }


  // ===========================================================================
  // ABORT / TIMEOUT
  // ===========================================================================

  function createAbortContext(
    userSignal,
    timeoutMs
  ) {
    const timeout =
      Number(timeoutMs || 0);

    /*
      No cancellation requirements.
    */
    if (
      !userSignal &&
      !(timeout > 0)
    ) {
      return {
        signal: undefined,
        cleanup: function () {}
      };
    }

    /*
      AbortController is widely supported, but retain
      graceful behavior if unavailable.
    */
    if (
      typeof AbortController !==
      "function"
    ) {
      return {
        signal: userSignal,
        cleanup: function () {}
      };
    }

    const controller =
      new AbortController();

    let timeoutId = null;

    const abortFromUser =
      function () {
        try {
          controller.abort(
            userSignal.reason
          );
        } catch (_) {
          try {
            controller.abort();
          } catch (_) {}
        }
      };

    if (userSignal) {
      if (userSignal.aborted) {
        abortFromUser();
      } else {
        try {
          userSignal.addEventListener(
            "abort",
            abortFromUser,
            {
              once: true
            }
          );
        } catch (_) {}
      }
    }

    if (timeout > 0) {
      timeoutId =
        W.setTimeout(
          function () {
            try {
              controller.abort(
                new DOMException(
                  "Request timed out",
                  "TimeoutError"
                )
              );
            } catch (_) {
              try {
                controller.abort();
              } catch (_) {}
            }
          },
          timeout
        );
    }

    return {
      signal:
        controller.signal,

      cleanup:
        function () {
          if (timeoutId !== null) {
            W.clearTimeout(
              timeoutId
            );

            timeoutId = null;
          }

          if (userSignal) {
            try {
              userSignal.removeEventListener(
                "abort",
                abortFromUser
              );
            } catch (_) {}
          }
        }
    };
  }


  // ===========================================================================
  // RETRY POLICY
  // ===========================================================================

  function retryableStatus(status) {
    return (
      status === 408 ||
      status === 425 ||
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  }


  function retryableMethod(method) {
    const m =
      String(
        method ||
        "GET"
      ).toUpperCase();

    /*
      Do not automatically replay writes.
    */
    return (
      m === "GET" ||
      m === "HEAD"
    );
  }


  // ===========================================================================
  // FETCH
  // ===========================================================================

  async function fetchRaw(
    path,
    opts
  ) {
    const options =
      Object.assign(
        {},
        opts || {}
      );

    /*
      ZZXAPI-specific options.
      Remove these before passing the rest to fetch().
    */
    const cacheBust =
      options.cacheBust !== false;

    const timeoutMs =
      Number(
        options.timeoutMs || 0
      );

    const retries =
      Math.max(
        0,
        Math.floor(
          Number(
            options.retries || 0
          )
        )
      );

    const retryDelayMs =
      Math.max(
        0,
        Number(
          options.retryDelayMs ||
          500
        )
      );

    delete options.cacheBust;
    delete options.timeoutMs;
    delete options.retries;
    delete options.retryDelayMs;

    /*
      Preserve historical defaults.
    */
    if (!("cache" in options)) {
      options.cache =
        "no-store";
    }

    if (!("credentials" in options)) {
      options.credentials =
        "same-origin";
    }

    if (!options.method) {
      options.method =
        "GET";
    }

    const userSignal =
      options.signal;

    delete options.signal;

    let lastError = null;

    const attempts =
      retries + 1;

    for (
      let attempt = 0;
      attempt < attempts;
      attempt++
    ) {
      const requestURL =
        cacheBust
          ? bust(path)
          : url(path);

      const abort =
        createAbortContext(
          userSignal,
          timeoutMs
        );

      try {
        const requestOptions =
          Object.assign(
            {},
            options
          );

        if (abort.signal) {
          requestOptions.signal =
            abort.signal;
        }

        const response =
          await fetch(
            requestURL,
            requestOptions
          );

        if (response.ok) {
          abort.cleanup();
          return response;
        }

        const error =
          new Error(
            "HTTP " +
            response.status +
            " " +
            requestURL
          );

        error.status =
          response.status;

        error.response =
          response;

        lastError =
          error;

        abort.cleanup();

        const canRetry =
          attempt < retries &&
          retryableMethod(
            requestOptions.method
          ) &&
          retryableStatus(
            response.status
          );

        if (!canRetry) {
          throw error;
        }

      } catch (error) {
        abort.cleanup();

        lastError =
          error;

        /*
          Explicit cancellation means stop immediately.
        */
        if (
          userSignal &&
          userSignal.aborted
        ) {
          throw error;
        }

        const canRetry =
          attempt < retries &&
          retryableMethod(
            options.method
          );

        if (!canRetry) {
          throw error;
        }
      }

      /*
        Modest exponential backoff.
      */
      await sleep(
        retryDelayMs *
        Math.pow(
          2,
          attempt
        )
      );
    }

    throw (
      lastError ||
      new Error(
        "Request failed: " +
        String(path || "")
      )
    );
  }


  // ===========================================================================
  // JSON / TEXT
  // ===========================================================================

  async function json(
    path,
    fallback,
    opts
  ) {
    try {
      const response =
        await fetchRaw(
          path,
          opts
        );

      return await response.json();

    } catch (error) {
      console.warn(
        "[ZZXAPI json]",
        path,
        error
      );

      return fallback;
    }
  }


  async function text(
    path,
    fallback,
    opts
  ) {
    try {
      const response =
        await fetchRaw(
          path,
          opts
        );

      return await response.text();

    } catch (error) {
      console.warn(
        "[ZZXAPI text]",
        path,
        error
      );

      return fallback == null
        ? ""
        : fallback;
    }
  }


  /*
    Strict variants are useful for provider adapters that
    need to distinguish a failed request from valid null data.
  */
  async function jsonStrict(
    path,
    opts
  ) {
    const response =
      await fetchRaw(
        path,
        opts
      );

    return await response.json();
  }


  async function textStrict(
    path,
    opts
  ) {
    const response =
      await fetchRaw(
        path,
        opts
      );

    return await response.text();
  }


  // ===========================================================================
  // NUMERIC HELPERS
  // ===========================================================================

  function n(
    value,
    fallback
  ) {
    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : (
          fallback == null
            ? 0
            : fallback
        );
  }


  function has(value) {
    return (
      value !== null &&
      value !== undefined &&
      !(
        typeof value ===
          "number" &&
        Number.isNaN(value)
      )
    );
  }


  function clamp(
    value,
    min,
    max
  ) {
    const number =
      n(value);

    return Math.min(
      max,
      Math.max(
        min,
        number
      )
    );
  }


  // ===========================================================================
  // FORMATTERS
  // ===========================================================================

  function int(value) {
    return Math.round(
      n(value)
    ).toLocaleString();
  }


  function fixed(
    value,
    digits
  ) {
    const decimals =
      digits == null
        ? 2
        : Math.max(
            0,
            Number(digits) || 0
          );

    return n(value)
      .toLocaleString(
        undefined,
        {
          minimumFractionDigits:
            decimals,

          maximumFractionDigits:
            decimals
        }
      );
  }


  function money(
    value,
    currency,
    digits
  ) {
    const code =
      String(
        currency ||
        "USD"
      ).toUpperCase();

    const decimals =
      digits == null
        ? 2
        : Math.max(
            0,
            Number(digits) || 0
          );

    try {
      return n(value)
        .toLocaleString(
          undefined,
          {
            style:
              "currency",

            currency:
              code,

            minimumFractionDigits:
              decimals,

            maximumFractionDigits:
              decimals
          }
        );

    } catch (_) {
      return (
        fixed(
          value,
          decimals
        ) +
        " " +
        code
      );
    }
  }


  function pct(
    value,
    digits
  ) {
    return (
      fixed(
        value,
        digits == null
          ? 2
          : digits
      ) +
      "%"
    );
  }


  function btc(
    value,
    digits
  ) {
    const decimals =
      digits == null
        ? 8
        : Math.max(
            0,
            Number(digits) || 0
          );

    return (
      n(value)
        .toLocaleString(
          undefined,
          {
            maximumFractionDigits:
              decimals
          }
        ) +
      " BTC"
    );
  }


  function sats(value) {
    return (
      int(value) +
      " sat"
    );
  }


  /*
    Historical behavior preserved.

    Despite the old helper name "ago", existing widget code
    may depend on this returning a localized timestamp.
  */
  function ago(timestamp) {
    try {
      if (!timestamp) {
        return "—";
      }

      return new Date(
        timestamp
      ).toLocaleString();

    } catch (_) {
      return "—";
    }
  }


  /*
    New actual relative-time helper.
  */
  function relative(timestamp) {
    try {
      if (!timestamp) {
        return "—";
      }

      const t =
        new Date(
          timestamp
        ).getTime();

      if (!Number.isFinite(t)) {
        return "—";
      }

      let seconds =
        Math.round(
          (
            Date.now() -
            t
          ) /
          1000
        );

      const future =
        seconds < 0;

      seconds =
        Math.abs(seconds);

      let value;
      let unit;

      if (seconds < 60) {
        value = seconds;
        unit = "s";

      } else if (
        seconds < 3600
      ) {
        value =
          Math.floor(
            seconds /
            60
          );

        unit = "m";

      } else if (
        seconds < 86400
      ) {
        value =
          Math.floor(
            seconds /
            3600
          );

        unit = "h";

      } else {
        value =
          Math.floor(
            seconds /
            86400
          );

        unit = "d";
      }

      return future
        ? "in " +
            value +
            unit
        : value +
            unit +
            " ago";

    } catch (_) {
      return "—";
    }
  }


  // ===========================================================================
  // HTML ESCAPING
  // ===========================================================================

  function esc(value) {
    return String(
      value == null
        ? ""
        : value
    ).replace(
      /[&<>"']/g,
      function (match) {
        return {
          "&":
            "&amp;",

          "<":
            "&lt;",

          ">":
            "&gt;",

          "\"":
            "&quot;",

          "'":
            "&#039;"
        }[match];
      }
    );
  }


  // ===========================================================================
  // DOM SETTERS
  // ===========================================================================

  function set(
    root,
    selector,
    value
  ) {
    const element =
      root &&
      root.querySelector(
        selector
      );

    if (element) {
      element.textContent =
        !has(value)
          ? "—"
          : String(value);
    }
  }


  /*
    Intentionally raw HTML for backward compatibility.

    Only call this with trusted/generated markup.
  */
  function html(
    root,
    selector,
    value
  ) {
    const element =
      root &&
      root.querySelector(
        selector
      );

    if (element) {
      element.innerHTML =
        value == null
          ? ""
          : String(value);
    }
  }


  // ===========================================================================
  // MARKUP HELPERS
  // ===========================================================================

  function kv(rows) {
    return (
      '<div class="btc-kv">' +
      (
        rows ||
        []
      ).map(
        function (row) {
          return (
            '<div class="btc-kv__row">' +
              '<span class="k">' +
                esc(row[0]) +
              "</span>" +
              '<span class="v">' +
                esc(row[1]) +
              "</span>" +
            "</div>"
          );
        }
      ).join("") +
      "</div>"
    );
  }


  function table(
    items,
    columns
  ) {
    return (
      '<div class="zzx-mini-table">' +
      (
        items ||
        []
      ).map(
        function (
          item,
          index
        ) {
          return (
            '<div class="zzx-mini-row">' +
            (
              columns ||
              []
            ).map(
              function (formatter) {
                let value = "";

                try {
                  value =
                    formatter(
                      item,
                      index
                    );
                } catch (_) {}

                return (
                  "<span>" +
                  esc(value) +
                  "</span>"
                );
              }
            ).join("") +
            "</div>"
          );
        }
      ).join("") +
      "</div>"
    );
  }


  function card(
    title,
    value,
    sub,
    body
  ) {
    return (
      '<div class="btc-card">' +

        '<div class="btc-card__title">' +
          esc(title) +
        "</div>" +

        '<div class="btc-card__value">' +
          esc(value) +
        "</div>" +

        '<div class="btc-card__sub">' +
          esc(sub || "") +
        "</div>" +

        /*
          body remains raw intentionally because current widgets
          pass generated markup such as kv() and table().
        */
        (
          body ||
          ""
        ) +

      "</div>"
    );
  }


  // ===========================================================================
  // SELECTOR SAFETY
  // ===========================================================================

  function selectorValue(value) {
    return String(
      value || ""
    )
      .replace(
        /\\/g,
        "\\\\"
      )
      .replace(
        /"/g,
        '\\"'
      );
  }


  // ===========================================================================
  // ROOT LOOKUP
  // ===========================================================================

  function rootFor(ID) {
    const id =
      String(ID || "")
        .trim();

    if (!id) {
      return null;
    }

    const safe =
      selectorValue(id);

    return (
      D.querySelector(
        '[data-widget-root="' +
        safe +
        '"]'
      ) ||

      D.querySelector(
        '[data-widget-slot="' +
        safe +
        '"]'
      ) ||

      D.querySelector(
        '.btc-slot[data-widget="' +
        safe +
        '"]'
      ) ||

      D.querySelector(
        '.btc-slot[data-widget-id="' +
        safe +
        '"]'
      ) ||

      null
    );
  }


  // ===========================================================================
  // ERROR CARD
  // ===========================================================================

  function renderWidgetError(
    root,
    ID,
    message
  ) {
    if (!root) {
      return;
    }

    root.innerHTML =
      card(
        ID,
        "offline",
        message ||
        "widget render error"
      );
  }


  // ===========================================================================
  // WIDGET REGISTRATION
  // ===========================================================================

  function register(
    ID,
    boot
  ) {
    const id =
      String(ID || "")
        .trim();

    if (
      !id ||
      typeof boot !==
        "function"
    ) {
      return false;
    }

    function wrapped(
      root,
      core
    ) {
      const r =
        root ||
        rootFor(id);

      if (!r) {
        return false;
      }

      /*
        Prevent duplicate boots from:
          Core.onMount()
          +
          legacy registry
          +
          setTimeout fallback

        New/reinjected roots are distinct DOM nodes,
        so they still boot normally.
      */
      if (
        r.__zzxApiBootState ===
        "booted"
      ) {
        return true;
      }

      if (
        r.__zzxApiBootState ===
        "booting"
      ) {
        return true;
      }

      r.__zzxApiBootState =
        "booting";

      try {
        const result =
          boot(
            r,
            core ||
            W.ZZXWidgetsCore ||
            W.ZZXAPI
          );

        if (
          result &&
          typeof result.then ===
            "function"
        ) {
          result
            .then(
              function () {
                r.__zzxApiBootState =
                  "booted";
              }
            )
            .catch(
              function (error) {
                r.__zzxApiBootState =
                  null;

                console.warn(
                  "[ZZXAPI widget]",
                  id,
                  error
                );

                renderWidgetError(
                  r,
                  id,
                  "widget render error"
                );
              }
            );

          return result;
        }

        r.__zzxApiBootState =
          "booted";

        return result;

      } catch (error) {
        r.__zzxApiBootState =
          null;

        console.warn(
          "[ZZXAPI widget]",
          id,
          error
        );

        renderWidgetError(
          r,
          id,
          "widget render error"
        );

        return false;
      }
    }


    /*
      Prefer the canonical core lifecycle.

      Do NOT also register through the legacy registry when
      onMount exists, otherwise one widget can be booted twice.
    */
    if (
      W.ZZXWidgetsCore &&
      typeof W.ZZXWidgetsCore.onMount ===
        "function"
    ) {
      W.ZZXWidgetsCore.onMount(
        id,
        wrapped
      );

    } else if (
      W.ZZXWidgets &&
      typeof W.ZZXWidgets.register ===
        "function"
    ) {
      W.ZZXWidgets.register(
        id,
        wrapped
      );

    } else if (
      W.ZZXWidgetRegistry &&
      typeof W.ZZXWidgetRegistry.register ===
        "function"
    ) {
      W.ZZXWidgetRegistry.register(
        id,
        wrapped
      );

    } else if (
      W.__ZZX_WIDGETS &&
      typeof W.__ZZX_WIDGETS.register ===
        "function"
    ) {
      W.__ZZX_WIDGETS.register(
        id,
        wrapped
      );
    }


    /*
      Standalone/backward-compatible immediate discovery.
    */
    W.setTimeout(
      function () {
        const root =
          rootFor(id);

        if (
          root &&
          !root.__zzxApiBootState
        ) {
          wrapped(
            root,
            W.ZZXWidgetsCore ||
            W.ZZXAPI
          );
        }
      },
      0
    );

    return true;
  }


  // ===========================================================================
  // REPEATING / POLLING
  // ===========================================================================

  /*
    repeat(root, fn, ms)

    Existing call shape remains valid.

    Improvements:
    - async fn() calls never overlap
    - timer stops when root leaves DOM
    - old timer for same root is cancelled
    - visibility-aware optional behavior available
  */
  function repeat(
    root,
    fn,
    ms,
    options
  ) {
    if (
      !root ||
      typeof fn !==
        "function"
    ) {
      return null;
    }

    stop(root);

    const interval =
      Math.max(
        250,
        Number(ms) ||
        60000
      );

    const opts =
      Object.assign(
        {
          pauseWhenHidden:
            false,

          runImmediately:
            true
        },
        options ||
        {}
      );

    const state = {
      timer:
        null,

      running:
        false,

      stopped:
        false,

      fn,
      ms:
        interval,

      options:
        opts
    };

    timers.set(
      root,
      state
    );

    async function tick() {
      if (
        state.stopped
      ) {
        return;
      }

      /*
        HUD reinjected / widget removed.
        Automatically terminate polling.
      */
      if (
        !root.isConnected
      ) {
        stop(root);
        return;
      }

      if (
        state.options.pauseWhenHidden &&
        D.visibilityState ===
          "hidden"
      ) {
        schedule();
        return;
      }

      if (state.running) {
        schedule();
        return;
      }

      state.running =
        true;

      try {
        await state.fn();

      } catch (error) {
        console.warn(
          "[ZZXAPI repeat]",
          error
        );

      } finally {
        state.running =
          false;
      }

      schedule();
    }


    function schedule() {
      if (
        state.stopped
      ) {
        return;
      }

      if (
        state.timer !==
        null
      ) {
        W.clearTimeout(
          state.timer
        );
      }

      state.timer =
        W.setTimeout(
          tick,
          state.ms
        );

      /*
        Preserve historical debug/compatibility property.
      */
      root.__zzxInterval =
        state.timer;
    }


    if (
      opts.runImmediately
    ) {
      /*
        Run asynchronously so widget initialization can finish
        before its first refresh touches the DOM.
      */
      Promise.resolve()
        .then(tick);
    } else {
      schedule();
    }

    return state;
  }


  // ===========================================================================
  // STOP POLLING
  // ===========================================================================

  function stop(root) {
    if (!root) {
      return;
    }

    const state =
      timers.get(root);

    if (state) {
      state.stopped =
        true;

      if (
        state.timer !==
        null
      ) {
        W.clearTimeout(
          state.timer
        );

        state.timer =
          null;
      }

      timers.delete(root);
    }

    /*
      Historical property compatibility.
    */
    if (
      root.__zzxInterval
    ) {
      W.clearTimeout(
        root.__zzxInterval
      );

      W.clearInterval(
        root.__zzxInterval
      );

      root.__zzxInterval =
        null;
    }
  }


  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  W.ZZXAPI = {
    __version:
      4,

    prefix,
    url,
    bust,

    json,
    text,

    jsonStrict,
    textStrict,

    fetchRaw,

    n,
    has,
    clamp,

    money,
    int,
    fixed,
    pct,
    btc,
    sats,
    ago,
    relative,

    set,
    html,
    esc,

    kv,
    table,
    card,

    register,
    repeat,
    stop,
    rootFor,

    sleep
  };

})();
