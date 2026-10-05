(() => {
    "use strict";

    const M = window.ZZXCyberChefModules;
    const config = window.ZZX.CYBERCHEF;
    let official = config.officialDownloadUrl;
    let frameObserver = null;

    function normalize(url) {
        try {
            const u = new URL(url);
            return u.hostname === "github.com" && u.pathname.startsWith("/gchq/CyberChef/") ? u.href : null;
        } catch (_) {
            return null;
        }
    }

    function updateOuter() {
        document.querySelectorAll("[data-cz-official-download]").forEach(anchor => {
            anchor.href = official;
            anchor.removeAttribute("download");
            anchor.target = "_blank";
            anchor.rel = "noopener";
        });
    }

    function looksLikeCyberChefDownload(anchor) {
        const text = String(anchor.textContent || anchor.getAttribute("aria-label") || anchor.title || "").trim();
        const raw = anchor.getAttribute("href") || "";
        if (/download\s+cyberchef/i.test(text)) return true;
        if (anchor.closest("#download-modal") && (/\.zip(?:$|[?#])/i.test(raw) || anchor.hasAttribute("download"))) return true;
        return false;
    }

    function patchModifiedFrame() {
        if (M.Runtime?.mode() !== "modified") return;
        const doc = M.Runtime?.document();
        if (!doc) return;

        doc.querySelectorAll("a[href], a[download]").forEach(anchor => {
            if (!looksLikeCyberChefDownload(anchor)) return;
            anchor.href = official;
            anchor.removeAttribute("download");
            anchor.target = "_blank";
            anchor.rel = "noopener";
            anchor.dataset.zzxOfficialDownload = "1";
        });
    }

    function observeModifiedFrame() {
        frameObserver?.disconnect();
        frameObserver = null;
        if (M.Runtime?.mode() !== "modified") return;
        const doc = M.Runtime?.document();
        const Observer = doc?.defaultView?.MutationObserver || window.MutationObserver;
        if (!doc?.body || !Observer) return;
        patchModifiedFrame();
        frameObserver = new Observer(() => patchModifiedFrame());
        frameObserver.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "download"] });
    }

    async function openNativeSafely(event) {
        const link = event.currentTarget;
        if (!link) return;
        event.preventDefault();
        const target = window.open("about:blank", "_blank", "noopener");
        try {
            const result = await M.Quota?.ensureWritable?.();
            if (result?.repaired) M.Status?.set("CyberChef browser storage repaired before opening the pristine native runtime.", "ready");
        } catch (_) {}
        const href = new URL(link.getAttribute("href") || "./app/", window.location.href).href;
        if (target) target.location.replace(href);
        else window.location.assign(href);
    }

    M.Downloads = {
        setManifest(manifest) {
            const candidate = normalize(manifest?.release?.asset_url) || normalize(manifest?.release?.page_url);
            if (candidate) official = candidate;
            config.officialDownloadUrl = official;
            updateOuter();
            patchModifiedFrame();
        },

        boot() {
            updateOuter();
            document.querySelectorAll("[data-cz-open-native]").forEach(link => link.addEventListener("click", openNativeSafely));
            window.addEventListener("zzx-cyberchef-frame-ready", () => {
                observeModifiedFrame();
                setTimeout(patchModifiedFrame, 250);
                setTimeout(patchModifiedFrame, 1000);
            });
            window.addEventListener("zzx-cyberchef-manifest-ready", e => this.setManifest(e.detail?.manifest));
        }
    };
})();
