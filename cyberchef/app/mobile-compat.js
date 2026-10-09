/* ZZXCyberChef: additive, direct-open mobile compatibility for the original
 * CyberChef 11.5.0 engine. This file does not run in the wrapper iframe.
 * Nothing here touches assets/main.js, workers, recipe logic, or user files. */
(() => {
    "use strict";
    let standalone = false;
    try { standalone = window.self === window.top; } catch (_) {}
    if (!standalone) return;

    const media = window.matchMedia("(max-width: 760px)");
    const apply = () => {
        document.documentElement.classList.toggle("zzx-app-mobile-standalone", media.matches);
    };
    apply();
    if (typeof media.addEventListener === "function") media.addEventListener("change", apply);
    else if (typeof media.addListener === "function") media.addListener(apply);

    /* Android Firefox can block writes after the origin fills localStorage.
     * Never clear user data automatically. On a verified storage failure, use
     * a lazy copy-on-write facade in this tab, and warn that changes are
     * temporary until site storage is repaired by the user. */
    if (!media.matches) return;
    const probeKey = "__zzx_cyberchef_native_storage_probe__";
    let nativeStorage = null;
    let storageFailed = false;
    try {
        nativeStorage = window.localStorage;
        nativeStorage.setItem(probeKey, "1");
        nativeStorage.removeItem(probeKey);
    } catch (err) {
        storageFailed = true;
        try { nativeStorage?.removeItem(probeKey); } catch (_) {}
    }
    if (!storageFailed) return;

    let memory = Object.create(null);
    let removed = Object.create(null);
    let cleared = false;
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    let names = null;
    const visibleNames = () => {
        if (names) return names;
        const seen = new Set();
        if (!cleared && nativeStorage) {
            try {
                for (let i = 0; i < nativeStorage.length; i++) {
                    const k = nativeStorage.key(i);
                    if (k !== null && !removed[k]) seen.add(k);
                }
            } catch (_) {}
        }
        Object.keys(memory).forEach(k => seen.add(k));
        names = Array.from(seen);
        return names;
    };
    const facade = {
        getItem(k) {
            k = String(k);
            if (own(memory, k)) return memory[k];
            if (cleared || removed[k] || !nativeStorage) return null;
            try { return nativeStorage.getItem(k); } catch (_) { return null; }
        },
        setItem(k, v) { k = String(k); memory[k] = String(v); delete removed[k]; names = null; },
        removeItem(k) { k = String(k); delete memory[k]; removed[k] = true; names = null; },
        clear() { memory = Object.create(null); removed = Object.create(null); cleared = true; names = null; },
        key(i) { return visibleNames()[i] ?? null; }
    };
    Object.defineProperty(facade, "length", { get() { return visibleNames().length; } });
    try {
        Object.defineProperty(window, "localStorage", { configurable:true, value:facade });
    } catch (_) {
        /* Last-resort protection for Firefox configurations which prohibit
           replacing localStorage on window. Other errors remain visible. */
        try {
            const original = window.Storage?.prototype?.setItem;
            if (original) window.Storage.prototype.setItem = function(k, v) {
                try { return original.call(this, k, v); }
                catch(e) {
                    if (e?.name === "QuotaExceededError" || e?.name === "NS_ERROR_DOM_QUOTA_REACHED" || e?.code === 22 || e?.code === 1014) return;
                    throw e;
                }
            };
        } catch (_) {}
    }
    document.documentElement.dataset.zzxNativeVolatileStorage = "1";
    const notice = () => {
        const target = document.getElementById("banner") || document.body;
        if (!target || document.getElementById("zzx-mobile-storage-notice")) return;
        const label = document.createElement("span");
        label.id = "zzx-mobile-storage-notice";
        label.textContent = "Storage full or unavailable: edits in this tab may not persist. Export recipes before closing.";
        label.style.cssText = "display:block;flex:1 1 100%;font-size:11px;line-height:1.3;background:#3c2d14;color:#ffdf9b;padding:5px;border:1px solid #b18b44;border-radius:3px;";
        target.appendChild(label);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", notice, { once:true });
    else notice();
})();
