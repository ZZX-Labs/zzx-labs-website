(() => {
  "use strict";

  const DB_NAME = "zzx-archivetagger";
  const DB_VERSION = 1;
  const STORE = "records";
  const META = "meta";

  class ArchiveTaggerStore {
    constructor() {
      this.db = null;
    }

    async open() {
      if (!("indexedDB" in window)) return null;
      if (this.db) return this.db;

      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(META)) {
            db.createObjectStore(META, { keyPath: "key" });
          }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      return this.db;
    }

    async tx(storeName, mode, fn) {
      const db = await this.open();
      if (!db) return null;

      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;

        try {
          result = fn(store);
        } catch (error) {
          reject(error);
          return;
        }

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
      });
    }

    async put(record) {
      const clean = JSON.parse(JSON.stringify(record));
      await this.tx(STORE, "readwrite", (store) => store.put(clean));
      return clean;
    }

    async putMany(records) {
      await this.tx(STORE, "readwrite", (store) => {
        for (const record of records) store.put(JSON.parse(JSON.stringify(record)));
      });
    }

    async all() {
      const db = await this.open();
      if (!db) return [];

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    async delete(id) {
      await this.tx(STORE, "readwrite", (store) => store.delete(id));
    }

    async clear() {
      await this.tx(STORE, "readwrite", (store) => store.clear());
    }

    async setMeta(key, value) {
      await this.tx(META, "readwrite", (store) => store.put({ key, value }));
    }

    async getMeta(key) {
      const db = await this.open();
      if (!db) return null;

      return new Promise((resolve, reject) => {
        const tx = db.transaction(META, "readonly");
        const req = tx.objectStore(META).get(key);
        req.onsuccess = () => resolve(req.result?.value ?? null);
        req.onerror = () => reject(req.error);
      });
    }
  }

  window.ArchiveTaggerStore = ArchiveTaggerStore;
})();
