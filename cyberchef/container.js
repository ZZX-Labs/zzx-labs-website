(() => {
    "use strict";

    let announced = false;

    function findCyberChefNode() {
        return (
            document.querySelector("#workspace-wrapper") ||
            document.querySelector("#content-wrapper") ||
            document.querySelector("#operations") ||
            document.querySelector("#recipe") ||
            document.querySelector("#IO") ||
            document.querySelector("#input") ||
            document.querySelector("#output")
        );
    }

    function announceReady() {
        if (announced || !findCyberChefNode()) {
            return false;
        }
        announced = true;
        document.documentElement.classList.add("zzx-cyberchef-ready");
        window.dispatchEvent(new CustomEvent("zzx-cyberchef-ready"));
        return true;
    }

    function boot() {
        if (announceReady() || !window.MutationObserver) {
            return;
        }
        const observer = new MutationObserver(() => {
            if (announceReady()) {
                observer.disconnect();
            }
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
        window.setTimeout(() => observer.disconnect(), 30000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})();
