// Shared by price-24h, volume-24h, high-low-24h.
// v3: local/direct first, shared de-dup/cache, optional CORS proxy fallback.

(function () {
  "use strict";

  const W = window;

  if (W.ZZXMarket24Fetch?.__version >= 3) return;

  const DEFAULTS = Object.freeze({
    timeoutMs: 10000,
    retries: 1,
    retryDelayMs: 450,
    cacheTtlMs: 7000,
    proxyFallback: true
  });

  const AO_RAW = "https://api.allorigins.win/raw?url=";

  const jsonCache = new Map();
  const textCache = new Map();
  const inflight = new Map();

  function sleep(ms) {
    return new Promise(resolve =>
      W.setTimeout(resolve, Math.max(0, Number(ms) || 0))
    );
  }

  function localize(url) {
    const value = String(url || "").trim();

    if (
      value.startsWith("/") &&
      W.ZZXAPI?.url
    ) {
      return W.ZZXAPI.url(value);
    }

    return value;
  }

  function isLocal(url) {
    try {
      return (
        new URL(
          localize(url),
          W.location.href
        ).origin ===
        W.location.origin
      );
    } catch (_) {
      return String(url || "").startsWith("/");
    }
  }

  function isAllOrigins(url) {
    return /^https:\/\/api\.allorigins\.win\/raw\?url=/i
      .test(String(url || ""));
  }

  function proxyURL(url) {
    return AO_RAW + encodeURIComponent(String(url || ""));
  }

  function retryableStatus(status) {
    return [
      408,
      425,
      429,
      500,
      502,
      503,
      504
    ].includes(Number(status));
  }

  function canProxyFallback(
    target,
    method,
    error,
    enabled
  ) {
    if (!enabled) return false;
    if (isLocal(target)) return false;
    if (isAllOrigins(target)) return false;

    const upper =
      String(method || "GET")
        .toUpperCase();

    if (
      upper !== "GET" &&
      upper !== "HEAD"
    ) {
      return false;
    }

    // Browser CORS/network failures normally do not expose an HTTP status.
    // Do not hide a real 4xx/5xx from the direct provider behind a proxy.
    return !Number.isFinite(Number(error?.status));
  }

  async function requestDirect(
    target,
    options
  ) {
    const opts =
      Object.assign({}, options || {});

    const timeoutMs =
      Math.max(
        0,
        Number(opts.timeoutMs) ||
        DEFAULTS.timeoutMs
      );

    const retries =
      Math.max(
        0,
        Math.trunc(
          Number(opts.retries) || 0
        )
      );

    const retryDelayMs =
      Math.max(
        0,
        Number(opts.retryDelayMs) ||
        DEFAULTS.retryDelayMs
      );

    const userSignal =
      opts.signal;

    delete opts.timeoutMs;
    delete opts.retries;
    delete opts.retryDelayMs;
    delete opts.cacheTtlMs;
    delete opts.proxyFallback;
    delete opts.signal;

    if (!("method" in opts)) {
      opts.method = "GET";
    }

    if (!("cache" in opts)) {
      opts.cache = "no-store";
    }

    if (!("credentials" in opts)) {
      opts.credentials =
        isLocal(target)
          ? "same-origin"
          : "omit";
    }

    if (W.ZZXAPI?.fetchRaw) {
      return await W.ZZXAPI.fetchRaw(
        target,
        Object.assign({}, opts, {
          cacheBust: false,
          timeoutMs,
          retries,
          retryDelayMs,
          signal: userSignal
        })
      );
    }

    let lastError = null;

    for (
      let attempt = 0;
      attempt <= retries;
      attempt++
    ) {
      const controller =
        typeof AbortController ===
        "function"
          ? new AbortController()
          : null;

      let timer = null;
      let abortHandler = null;

      if (
        controller &&
        userSignal
      ) {
        abortHandler = () => {
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

        if (userSignal.aborted) {
          abortHandler();
        } else {
          userSignal.addEventListener(
            "abort",
            abortHandler,
            { once: true }
          );
        }
      }

      if (
        controller &&
        timeoutMs > 0
      ) {
        timer =
          W.setTimeout(
            () => {
              try {
                controller.abort();
              } catch (_) {}
            },
            timeoutMs
          );
      }

      try {
        const response =
          await fetch(
            target,
            Object.assign(
              {},
              opts,
              {
                signal:
                  controller
                    ? controller.signal
                    : userSignal
              }
            )
          );

        if (!response.ok) {
          const error =
            new Error(
              `HTTP ${response.status} ${target}`
            );

          error.status =
            response.status;

          throw error;
        }

        return response;

      } catch (error) {
        lastError = error;

        if (userSignal?.aborted) {
          throw error;
        }

        const retryable =
          attempt < retries &&
          (
            !Number.isFinite(
              Number(error?.status)
            ) ||
            retryableStatus(
              error.status
            )
          );

        if (!retryable) {
          throw error;
        }

        await sleep(
          retryDelayMs *
          Math.pow(2, attempt)
        );

      } finally {
        if (timer) {
          W.clearTimeout(timer);
        }

        if (
          userSignal &&
          abortHandler
        ) {
          try {
            userSignal.removeEventListener(
              "abort",
              abortHandler
            );
          } catch (_) {}
        }
      }
    }

    throw (
      lastError ||
      new Error(
        `request failed: ${target}`
      )
    );
  }

  async function raw(
    url,
    options
  ) {
    const opts =
      Object.assign(
        {},
        DEFAULTS,
        options || {}
      );

    const target =
      localize(url);

    const method =
      String(
        opts.method || "GET"
      ).toUpperCase();

    const proxyFallback =
      opts.proxyFallback !== false;

    try {
      return await requestDirect(
        target,
        opts
      );

    } catch (error) {
      if (
        !canProxyFallback(
          target,
          method,
          error,
          proxyFallback
        )
      ) {
        throw error;
      }

      return await requestDirect(
        proxyURL(target),
        Object.assign({}, opts, {
          credentials: "omit",
          proxyFallback: false,
          retries: 0
        })
      );
    }
  }

  function cacheFresh(
    entry,
    ttlMs
  ) {
    return Boolean(
      entry &&
      (
        Date.now() -
        entry.at
      ) <= ttlMs
    );
  }

  function requestKey(
    kind,
    url,
    options
  ) {
    const method =
      String(
        options?.method || "GET"
      ).toUpperCase();

    return (
      kind +
      ":" +
      method +
      ":" +
      localize(url)
    );
  }

  async function cachedParsed(
    kind,
    cache,
    url,
    options,
    parser
  ) {
    const opts =
      Object.assign(
        {},
        DEFAULTS,
        options || {}
      );

    const ttlMs =
      Math.max(
        0,
        Number(opts.cacheTtlMs) || 0
      );

    const key =
      requestKey(
        kind,
        url,
        opts
      );

    if (
      ttlMs > 0 &&
      cacheFresh(
        cache.get(key),
        ttlMs
      )
    ) {
      return cache.get(key).value;
    }

    const shareable =
      !opts.signal &&
      String(
        opts.method || "GET"
      ).toUpperCase() === "GET";

    if (
      shareable &&
      inflight.has(key)
    ) {
      return await inflight.get(key);
    }

    const task =
      (async () => {
        const response =
          await raw(url, opts);

        const value =
          await parser(response);

        if (ttlMs > 0) {
          cache.set(
            key,
            {
              at: Date.now(),
              value
            }
          );
        }

        return value;
      })();

    if (shareable) {
      inflight.set(key, task);
    }

    try {
      return await task;
    } finally {
      if (
        shareable &&
        inflight.get(key) === task
      ) {
        inflight.delete(key);
      }
    }
  }

  async function json(
    url,
    options
  ) {
    return await cachedParsed(
      "json",
      jsonCache,
      url,
      options,
      response =>
        response.json()
    );
  }

  async function text(
    url,
    options
  ) {
    return await cachedParsed(
      "text",
      textCache,
      url,
      options,
      response =>
        response.text()
    );
  }

  async function firstJSON(
    urls,
    options
  ) {
    let lastError = null;

    for (
      const url of
      (
        Array.isArray(urls)
          ? urls
          : [urls]
      )
    ) {
      if (!url) continue;

      try {
        return {
          data:
            await json(
              url,
              options
            ),
          url
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw (
      lastError ||
      new Error(
        "all request candidates failed"
      )
    );
  }

  function invalidate(
    url
  ) {
    if (!url) {
      jsonCache.clear();
      textCache.clear();
      return;
    }

    const target =
      localize(url);

    for (
      const cache of
      [jsonCache, textCache]
    ) {
      for (
        const key of
        [...cache.keys()]
      ) {
        if (
          key.endsWith(
            ":" + target
          )
        ) {
          cache.delete(key);
        }
      }
    }
  }

  W.ZZXMarket24Fetch = {
    __version: 3,
    raw,
    json,
    text,
    firstJSON,
    localize,
    isLocal,
    proxyURL,
    invalidate
  };
})();
