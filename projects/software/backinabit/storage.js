(() => {
  "use strict";

  class ZZXLocalStore {
    constructor(key) { this.key=key; }

    load(fallback=null) {
      try {
        const raw=localStorage.getItem(this.key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    }

    save(value) {
      localStorage.setItem(this.key, JSON.stringify(value));
      return value;
    }

    clear() {
      localStorage.removeItem(this.key);
    }
  }

  window.ZZXLocalStore=ZZXLocalStore;
})();
