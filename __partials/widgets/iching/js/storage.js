// __partials/widgets/iching/js/storage.js
(function () {
  "use strict";

  const W = window;
  if (W.ZZXIChingStorage?.__version >= 1) return;

  const KEY = "zzx.widgets.iching.lots.v2";

  function load() {
    try {
      const parsed = JSON.parse(W.localStorage.getItem(KEY) || "[]");
      return Array.isArray(parsed)
        ? parsed.filter(x => x && Number(x.btc) > 0 && Number(x.usd) > 0 && x.date)
        : [];
    } catch (_) {
      return [];
    }
  }

  function save(lots) {
    try {
      W.localStorage.setItem(KEY, JSON.stringify(Array.isArray(lots) ? lots : []));
      return true;
    } catch (_) {
      return false;
    }
  }

  function id() {
    if (W.crypto?.randomUUID) return W.crypto.randomUUID();

    if (W.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      W.crypto.getRandomValues(bytes);
      return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
    }

    return String(Date.now());
  }

  W.ZZXIChingStorage = Object.freeze({
    __version: 1,
    key: KEY,
    load,
    save,
    id
  });
})();
