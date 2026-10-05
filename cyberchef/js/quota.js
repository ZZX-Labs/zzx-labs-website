(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const DB_NAME = "zzx-cyberchef-storage-backup";
    const DB_VERSION = 1;
    const STORE_NAME = "snapshots";
    const CYBERCHEF_KEYS = ["savedRecipes", "favourites", "options", "recipeId"];
    const PROBE_KEY = "__zzx_cyberchef_quota_probe__";

    function isQuotaError(err) {
        return Boolean(err && (
            err.name === "QuotaExceededError" ||
            err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
            err.code === 22 ||
            err.code === 1014
        ));
    }

    function probe() {
        try {
            localStorage.setItem(PROBE_KEY, "1");
            localStorage.removeItem(PROBE_KEY);
            return { ok: true, quota: false, error: null };
        } catch (err) {
            try { localStorage.removeItem(PROBE_KEY); } catch (ignored) {}
            return { ok: false, quota: isQuotaError(err), error: err };
        }
    }

    function snapshotCyberChefStorage() {
        const values = {};
        let bytes = 0;
        for (const key of CYBERCHEF_KEYS) {
            try {
                const value = localStorage.getItem(key);
                if (value !== null) {
                    values[key] = value;
                    bytes += (key.length + value.length) * 2;
                }
            } catch (ignored) {}
        }
        return {
            schema: "zzx-cyberchef-localstorage-backup-v1",
            createdAt: new Date().toISOString(),
            bytes,
            values
        };
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            if (!("indexedDB" in window)) {
                reject(new Error("IndexedDB is unavailable."));
                return;
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "id" });
                }
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
                const store = tx.objectStore(STORE_NAME);
                store.put({ id: "latest", ...snapshot });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error("IndexedDB backup failed."));
                tx.onabort = () => reject(tx.error || new Error("IndexedDB backup aborted."));
            });
        } finally {
            db.close();
        }
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
        } finally {
            db.close();
        }
    }

    async function ensureWritable() {
        const initial = probe();
        if (initial.ok) {
            return { ok: true, repaired: false, fallback: false, removed: [] };
        }
        if (!initial.quota) {
            return { ok: false, repaired: false, fallback: true, removed: [], error: initial.error };
        }

        const snapshot = snapshotCyberChefStorage();
        if (Object.keys(snapshot.values).length) {
            try {
                await backup(snapshot);
            } catch (err) {
                return {
                    ok: false,
                    repaired: false,
                    fallback: true,
                    removed: [],
                    error: err,
                    backupFailed: true
                };
            }
        }

        const removed = [];
        for (const key of CYBERCHEF_KEYS) {
            try {
                if (localStorage.getItem(key) !== null) {
                    localStorage.removeItem(key);
                    removed.push(key);
                }
            } catch (ignored) {}

            const result = probe();
            if (result.ok) {
                return {
                    ok: true,
                    repaired: true,
                    fallback: false,
                    removed,
                    backup: Object.keys(snapshot.values).length ? "indexeddb" : "none"
                };
            }
        }

        return {
            ok: false,
            repaired: false,
            fallback: true,
            removed,
            error: initial.error,
            reason: "origin-localstorage-still-full"
        };
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
                    catch (e) { if (${isQuotaError.toString()}(e)) return undefined; throw e; }
                };
            }
        } catch (ignored) {}
    }
})();
<\/script>`;
    }

    M.Quota = {
        probe,
        ensureWritable,
        latestBackup,
        memoryPrelude,
        keys: CYBERCHEF_KEYS.slice()
    };
})();
