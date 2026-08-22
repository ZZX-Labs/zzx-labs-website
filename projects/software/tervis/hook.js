(() => {
  "use strict";

  const listeners = new Map();

  window.ZZXHooks = window.ZZXHooks || Object.freeze({
    on(name, handler) {
      if (typeof name !== "string" || typeof handler !== "function") {
        throw new TypeError("ZZXHooks.on(name, handler) requires a string and function.");
      }
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(handler);
      return () => listeners.get(name)?.delete(handler);
    },

    emit(name, payload) {
      const handlers = listeners.get(name);
      if (!handlers) return;
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`[ZZXHooks:${name}]`, error);
        }
      }
    }
  });

  window.dispatchEvent(new CustomEvent("zzx:hooks-ready"));
})();
