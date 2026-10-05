(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    const DB_NAME = "zzx-cyberchef-storage-backup";
    const DB_VERSION = 2;
    const STORE_NAME = "snapshots";
    const CYBERCHEF_KEYS = ["savedRecipes", "favourites", "options", "recipeId"];
    const PROBE_KEY = "__zzx_cyberchef_quota_probe__";

    function isQuotaError(err) {
        return Boolean(err && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" || err.code === 22 || err.code === 1014));
    }

    function probe() {
        try {
            localStorage.setItem(PROBE_KEY, "1");
            localStorage.removeItem(PROBE_KEY);
            return { ok: true, quota: false, error: null };
        } catch (err) {
            try { localStorage.removeItem(PROBE_KEY); } catch (_) {}
            return { ok: false, quota: isQuotaError(err), error: err };
        }
    }

    function managedKeys() {
        const found = new Set(CYBERCHEF_KEYS);
        Object.values(config.storageKeys || {}).forEach(value => value && found.add(String(value)));
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && /^zzxCyberChef/i.test(key)) found.add(key);
            }
        } catch (_) {}
        return Array.from(found);
    }

    function snapshotManagedStorage(keys = managedKeys()) {
        const values = {};
        let bytes = 0;
        for (const key of keys) {
            try {
                const value = localStorage.getItem(key);
                if (value !== null) {
                    values[key] = value;
                    bytes += (key.length + value.length) * 2;
                }
            } catch (_) {}
        }
        return { schema: "zzx-cyberchef-localstorage-backup-v2", createdAt: new Date().toISOString(), bytes, values };
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            if (!("indexedDB" in window)) return reject(new Error("IndexedDB is unavailable."));
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("IndexedDB open failed."));
        });
    }

    async function backup(snapshot) {
        const db = await openDb();
        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, "readwrite");
                tx.objectStore(STORE_NAME).put({ id: "latest", ...snapshot });
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error || new Error("IndexedDB backup failed."));
                tx.onabort = () => reject(tx.error || new Error("IndexedDB backup aborted."));
            });
        } finally { db.close(); }
        return snapshot;
    }

    async function latestBackup() {
        const db = await openDb();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, "readonly");
                const req = tx.objectStore(STORE_NAME).get("latest");
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error || new Error("IndexedDB backup read failed."));
            });
        } finally { db.close(); }
    }

    async function ensureWritable() {
        const initial = probe();
        if (initial.ok) return { ok: true, repaired: false, fallback: false, removed: [] };
        if (!initial.quota) return { ok: false, repaired: false, fallback: true, removed: [], error: initial.error };

        const keys = managedKeys();
        const snapshot = snapshotManagedStorage(keys);
        if (Object.keys(snapshot.values).length) {
            try { await backup(snapshot); }
            catch (err) { return { ok: false, repaired: false, fallback: true, removed: [], error: err, backupFailed: true }; }
        }

        /* Remove only CyberChef/ZZX-CyberChef owned keys. Never touch unrelated zzx-labs.io data. */
        const preferredOrder = [
            ...CYBERCHEF_KEYS,
            ...keys.filter(key => !CYBERCHEF_KEYS.includes(key))
        ];
        const removed = [];
        for (const key of preferredOrder) {
            try {
                if (localStorage.getItem(key) !== null) { localStorage.removeItem(key); removed.push(key); }
            } catch (_) {}
            const result = probe();
            if (result.ok) return { ok: true, repaired: true, fallback: false, removed, backup: Object.keys(snapshot.values).length ? "indexeddb" : "none" };
        }

        return { ok: false, repaired: false, fallback: true, removed, error: initial.error, reason: "origin-localstorage-still-full" };
    }

    function memoryPrelude() {
        return `
<script data-zzx-cyberchef-storage-guard>
(function () {
    "use strict";
    var nativeStorage = null;
    var memory = Object.create(null);
    var keys = [];
    function refreshKeys() { keys = Object.keys(memory); }
    try {
        nativeStorage = window.localStorage;
        for (var i = 0; i < nativeStorage.length; i++) {
            var k = nativeStorage.key(i);
            if (k !== null) memory[k] = nativeStorage.getItem(k);
        }
    } catch (ignored) {}
    refreshKeys();
    var facade = {
        getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null; },
        setItem: function (k, v) { memory[String(k)] = String(v); refreshKeys(); },
        removeItem: function (k) { delete memory[String(k)]; refreshKeys(); },
        clear: function () { memory = Object.create(null); refreshKeys(); },
        key: function (i) { return keys[i] === undefined ? null : keys[i]; }
    };
    Object.defineProperty(facade, "length", { get: function () { return keys.length; } });
    try {
        Object.defineProperty(window, "localStorage", { configurable: true, enumerable: true, value: facade });
        document.documentElement.dataset.zzxStorageFallback = "memory";
    } catch (err) {
        try {
            if (window.Storage && Storage.prototype && nativeStorage) {
                var originalSetItem = Storage.prototype.setItem;
                Storage.prototype.setItem = function (k, v) {
                    try { return originalSetItem.call(this, k, v); }
                    catch (e) {
                        if (e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014)) return undefined;
                        throw e;
                    }
                };
            }
        } catch (ignored) {}
    }
})();
<\/script>`;
    }

    M.Quota = { probe, ensureWritable, latestBackup, memoryPrelude, managedKeys, keys: CYBERCHEF_KEYS.slice() };
})();
